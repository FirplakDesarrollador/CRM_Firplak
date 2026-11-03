-- Firplak CRM · Fase 25: notificaciones push (Web Push).
-- Cada persona activa las notificaciones en sus dispositivos. Todo lo que llega a la campana también
-- se envía a esos dispositivos: las notificaciones quedan como pendientes de envío y el servidor las
-- reclama (lo despierta un webhook de la base y, de respaldo, un cron).

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  endpoint text not null unique check (length(endpoint) <= 2000),
  p256dh text not null check (length(p256dh) <= 200),
  auth text not null check (length(auth) <= 100),
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy "push: ver las propias" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy "push: quitar las propias" on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

-- Registra este dispositivo a nombre de quien tiene la sesión. Un mismo navegador pertenece a una
-- sola persona: si otra inició sesión en él, deja de recibir allí.
create or replace function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not exists (select 1 from public.profiles where id = auth.uid() and is_active) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.push_subscribe(text, text, text, text) from public, anon;
grant execute on function public.push_subscribe(text, text, text, text) to authenticated;

-- Pendientes de envío. Las que ya existían no se envían.
alter table public.notifications add column push_processed_at timestamptz;
update public.notifications set push_processed_at = now();
create index notifications_push_pending_idx on public.notifications (created_at) where push_processed_at is null;

-- Toma un lote una sola vez, aunque corran varios envíos a la vez. Lo que tenga más de un día (el
-- envío estuvo apagado) se descarta sin enviar, y a un usuario inactivo no se le envía; todo sigue
-- en la campana.
create or replace function public.push_claim_pending(p_limit integer default 200)
returns table (id uuid, user_id uuid, title text, body text, link text)
language sql
security definer
set search_path = ''
as $$
  with pending as (
    select n.id from public.notifications n
    where n.push_processed_at is null
    order by n.created_at
    limit greatest(p_limit, 1)
    for update skip locked
  ), claimed as (
    update public.notifications n set push_processed_at = now()
    from pending p where n.id = p.id
    returning n.id, n.user_id, n.title, n.body, n.link, n.created_at
  )
  select c.id, c.user_id, c.title, c.body, c.link
  from claimed c
  join public.profiles u on u.id = c.user_id and u.is_active
  where c.created_at > now() - interval '24 hours'
  order by c.created_at;
$$;
revoke execute on function public.push_claim_pending(integer) from public, anon, authenticated;
-- Solo el servidor la usa. (El rol no existe en la base de pruebas embebida.)
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.push_claim_pending(integer) to service_role;
  end if;
end;
$$;
