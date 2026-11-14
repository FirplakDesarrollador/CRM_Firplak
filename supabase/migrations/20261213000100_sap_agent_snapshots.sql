-- Firplak CRM · SAP por agente dentro de la red.
-- El Service Layer de SAP solo responde dentro de la red de Firplak, así que el servidor del CRM (en la
-- nube) no puede consultarlo. Un agente que corre dentro de la red lee SAP y deja aquí una copia de
-- solo lectura; el CRM lee esa copia. El agente entra con un usuario técnico cuyo perfil solo tiene el
-- permiso de sistema «sap_agent»: no ve ni toca nada más, y solo escribe por las funciones de abajo.

create table public.sap_partners (
  card_code text primary key,
  -- Lo mismo que antes se consultaba en vivo: { partner, orders, invoices }. Nulo = no existe en SAP.
  data jsonb,
  synced_at timestamptz not null default now()
);
create table public.sap_items (
  item_code text primary key,
  data jsonb,
  synced_at timestamptz not null default now()
);
create table public.sap_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  host text,
  partners int not null default 0,
  items int not null default 0,
  errors jsonb not null default '[]'::jsonb,
  ok boolean
);
create index sap_sync_runs_started_at on public.sap_sync_runs (started_at desc);

alter table public.sap_partners enable row level security;
alter table public.sap_items enable row level security;
alter table public.sap_sync_runs enable row level security;

-- Cartera: quien tiene «Ver información de SAP» y puede ver una cuenta con ese código.
create policy "sap clientes: leer" on public.sap_partners for select to authenticated
  using (public.has_perm('system', 'view_sap')
    and exists (select 1 from public.accounts a where a.sap_card_code = sap_partners.card_code));
create policy "sap artículos: leer" on public.sap_items for select to authenticated
  using (public.has_perm('system', 'view_sap'));
create policy "sap corridas: leer" on public.sap_sync_runs for select to authenticated
  using (public.has_perm('system', 'customize'));
-- Sin políticas de escritura: solo escriben las funciones del agente.

-- Perfil del usuario técnico del agente. En una base nueva lo crea la configuración inicial
-- (seeds/01_configuracion.sql), que exige encontrar la base sin perfiles; aquí, solo en las ya configuradas.
insert into public.permission_profiles (name, description, is_admin, permissions)
select 'Integración SAP', 'Solo para el agente de sincronización con SAP. No da acceso a la aplicación.', false,
       '{"system": {"sap_agent": true}}'::jsonb
where exists (select 1 from public.permission_profiles)
  and not exists (select 1 from public.permission_profiles where name = 'Integración SAP');

-- Solo el agente (no basta ser administrador: se exige el permiso escrito en el perfil).
create or replace function public.is_sap_agent()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select coalesce((pp.permissions -> 'system' ->> 'sap_agent')::boolean, false)
    from public.profiles p
    join public.permission_profiles pp on pp.id = p.permission_profile_id
    where p.id = auth.uid() and p.is_active
  ), false);
$$;
revoke execute on function public.is_sap_agent() from public, anon, authenticated;

-- Qué debe traer el agente: códigos de cliente vinculados y referencias de productos activos.
create or replace function public.sap_agent_targets()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_sap_agent() then raise exception 'Solo el agente de SAP' using errcode = '42501'; end if;
  return jsonb_build_object(
    'card_codes', coalesce((select jsonb_agg(a.sap_card_code order by a.sap_card_code)
                            from public.accounts a where a.sap_card_code is not null), '[]'::jsonb),
    'item_codes', coalesce((select jsonb_agg(p.product_code order by p.product_code)
                            from public.products p where p.is_active and p.product_code is not null and not p.is_kit), '[]'::jsonb));
end;
$$;

create or replace function public.sap_agent_start(p_host text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if not public.is_sap_agent() then raise exception 'Solo el agente de SAP' using errcode = '42501'; end if;
  insert into public.sap_sync_runs (host) values (left(p_host, 120)) returning id into v_id;
  return v_id;
end;
$$;

-- Guarda un lote: [{ "code": "...", "data": {...} | null }]. p_kind: 'partners' o 'items'.
create or replace function public.sap_agent_save(p_kind text, p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_n int;
begin
  if not public.is_sap_agent() then raise exception 'Solo el agente de SAP' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'Lote no válido' using errcode = '22023';
  end if;
  if p_kind = 'partners' then
    insert into public.sap_partners (card_code, data, synced_at)
    select r ->> 'code', nullif(r -> 'data', 'null'::jsonb), now()
    from jsonb_array_elements(p_rows) r where coalesce(r ->> 'code', '') <> ''
    on conflict (card_code) do update set data = excluded.data, synced_at = excluded.synced_at;
  elsif p_kind = 'items' then
    insert into public.sap_items (item_code, data, synced_at)
    select r ->> 'code', nullif(r -> 'data', 'null'::jsonb), now()
    from jsonb_array_elements(p_rows) r where coalesce(r ->> 'code', '') <> ''
    on conflict (item_code) do update set data = excluded.data, synced_at = excluded.synced_at;
  else
    raise exception 'Tipo no válido' using errcode = '22023';
  end if;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Cierra la corrida y borra las copias de códigos que ya no están vinculados en el CRM.
create or replace function public.sap_agent_finish(p_run uuid, p_partners int, p_items int, p_errors jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_sap_agent() then raise exception 'Solo el agente de SAP' using errcode = '42501'; end if;
  update public.sap_sync_runs
     set finished_at = now(), partners = p_partners, items = p_items,
         errors = coalesce(p_errors, '[]'::jsonb), ok = coalesce(jsonb_array_length(p_errors), 0) = 0
   where id = p_run;
  delete from public.sap_partners s where not exists (select 1 from public.accounts a where a.sap_card_code = s.card_code);
  delete from public.sap_items s where not exists (select 1 from public.products p where p.product_code = s.item_code and p.is_active);
  -- Historial corto: las últimas 200 corridas.
  delete from public.sap_sync_runs where id in (select id from public.sap_sync_runs order by started_at desc offset 200);
end;
$$;

revoke execute on function public.sap_agent_targets() from public, anon;
revoke execute on function public.sap_agent_start(text) from public, anon;
revoke execute on function public.sap_agent_save(text, jsonb) from public, anon;
revoke execute on function public.sap_agent_finish(uuid, int, int, jsonb) from public, anon;
grant execute on function public.sap_agent_targets() to authenticated;
grant execute on function public.sap_agent_start(text) to authenticated;
grant execute on function public.sap_agent_save(text, jsonb) to authenticated;
grant execute on function public.sap_agent_finish(uuid, int, int, jsonb) to authenticated;
