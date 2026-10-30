-- Firplak CRM · Fase 5: importaciones, duplicados (detección y fusión) y alertas
-- programadas diarias.

-- ---------------------------------------------------------------------------
-- Historial de importaciones
-- ---------------------------------------------------------------------------
create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  object text not null,
  file_name text,
  mode text not null default 'create' check (mode in ('create', 'upsert')),
  match_field text,
  total int not null default 0,
  created int not null default 0,
  updated int not null default 0,
  skipped int not null default 0,
  errors jsonb not null default '[]'::jsonb,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.import_jobs enable row level security;
create policy "importaciones: propias o administración" on public.import_jobs for select to authenticated
  using (created_by = auth.uid() or public.has_perm('system', 'customize'));
create policy "importaciones: registrar" on public.import_jobs for insert to authenticated
  with check (created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- Duplicados
-- ---------------------------------------------------------------------------
create or replace function public.normalize_text(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(regexp_replace(
    translate(lower(trim(coalesce(p, ''))), 'áéíóúüñàèìòù', 'aeiouunaeiou'),
    '(\s|\.|,|-)+(s\.?a\.?s\.?|s\.?a\.?|ltda\.?|limitada|s\.?en\.?c\.?)?$|[^a-z0-9]+', '', 'g'), '');
$$;

-- Parejas de posibles duplicados visibles para el usuario (RLS aplica).
create or replace function public.find_duplicates(p_object text)
returns table (id_a uuid, name_a text, id_b uuid, name_b text, reason text)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.id, a.name, b.id, b.name,
         case when public.normalize_text(regexp_replace(coalesce(a.tax_id, ''), '\D', '', 'g')) is not null
                   and regexp_replace(coalesce(a.tax_id, ''), '\D', '', 'g') = regexp_replace(coalesce(b.tax_id, ''), '\D', '', 'g')
              then 'Mismo NIT' else 'Mismo nombre' end
  from public.accounts a
  join public.accounts b on a.id < b.id
   and (
     (length(regexp_replace(coalesce(a.tax_id, ''), '\D', '', 'g')) >= 6
      and regexp_replace(coalesce(a.tax_id, ''), '\D', '', 'g') = regexp_replace(coalesce(b.tax_id, ''), '\D', '', 'g'))
     or public.normalize_text(a.name) = public.normalize_text(b.name)
   )
  where p_object = 'accounts'
  union all
  select a.id, a.full_name, b.id, b.full_name,
         case when lower(a.email) = lower(b.email) then 'Mismo correo' else 'Mismo nombre y cuenta' end
  from public.contacts a
  join public.contacts b on a.id < b.id
   and (
     (a.email is not null and lower(trim(a.email)) = lower(trim(b.email)))
     or (public.normalize_text(a.full_name) = public.normalize_text(b.full_name) and a.account_id is not distinct from b.account_id)
   )
  where p_object = 'contacts'
  union all
  select a.id, a.full_name || ' · ' || a.company, b.id, b.full_name || ' · ' || b.company,
         case when lower(a.email) = lower(b.email) then 'Mismo correo' else 'Mismo nombre y empresa' end
  from public.leads a
  join public.leads b on a.id < b.id and not a.is_converted and not b.is_converted
   and (
     (a.email is not null and lower(trim(a.email)) = lower(trim(b.email)))
     or (public.normalize_text(a.full_name) = public.normalize_text(b.full_name) and public.normalize_text(a.company) = public.normalize_text(b.company))
   )
  where p_object = 'leads';
$$;
grant execute on function public.find_duplicates(text) to authenticated;

-- Posibles duplicados de un registro que se va a crear (RLS aplica).
create or replace function public.possible_duplicates(p_object text, p_name text, p_email text default null, p_tax_id text default null)
returns table (id uuid, label text)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.id, a.name || coalesce(' · NIT ' || a.tax_id, '')
  from public.accounts a
  where p_object = 'accounts'
    and (public.normalize_text(a.name) = public.normalize_text(p_name)
         or (length(regexp_replace(coalesce(p_tax_id, ''), '\D', '', 'g')) >= 6
             and regexp_replace(coalesce(a.tax_id, ''), '\D', '', 'g') = regexp_replace(p_tax_id, '\D', '', 'g')))
  union all
  select c.id, c.full_name || coalesce(' · ' || c.email, '')
  from public.contacts c
  where p_object = 'contacts'
    and ((p_email is not null and lower(c.email) = lower(trim(p_email))) or public.normalize_text(c.full_name) = public.normalize_text(p_name))
  union all
  select l.id, l.full_name || ' · ' || l.company
  from public.leads l
  where p_object = 'leads' and not l.is_converted
    and ((p_email is not null and lower(l.email) = lower(trim(p_email))) or public.normalize_text(l.full_name || l.company) = public.normalize_text(p_name))
  limit 5;
$$;
grant execute on function public.possible_duplicates(text, text, text, text) to authenticated;

-- Fusiona el duplicado en el registro principal: completa campos vacíos, mueve
-- todos los registros relacionados y elimina el duplicado. Exige poder editar el
-- principal y eliminar el duplicado.
create or replace function public.merge_records(p_object text, p_master uuid, p_duplicate uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_master jsonb;
  v_dup jsonb;
begin
  if p_object not in ('accounts', 'contacts', 'leads') then
    raise exception 'Objeto no admitido para fusión';
  end if;
  if p_master = p_duplicate then
    raise exception 'Elige dos registros distintos';
  end if;
  execute format('select to_jsonb(t) from public.%I t where id = $1', p_object) into v_master using p_master;
  execute format('select to_jsonb(t) from public.%I t where id = $1', p_object) into v_dup using p_duplicate;
  if v_master is null or v_dup is null then
    raise exception 'Registro no encontrado';
  end if;
  if not public.can_edit_record(p_object, (v_master ->> 'owner_id')::uuid)
     or not public.can_delete_record(p_object, (v_dup ->> 'owner_id')::uuid) then
    raise exception 'No tienes permiso para fusionar estos registros' using errcode = '42501';
  end if;

  if p_object = 'accounts' then
    update public.accounts m set
      tax_id = coalesce(m.tax_id, d.tax_id), phone = coalesce(m.phone, d.phone), email = coalesce(m.email, d.email),
      website = coalesce(m.website, d.website), industry = coalesce(m.industry, d.industry), segment = coalesce(m.segment, d.segment),
      rating = coalesce(m.rating, d.rating), annual_revenue = coalesce(m.annual_revenue, d.annual_revenue),
      employees = coalesce(m.employees, d.employees), billing_street = coalesce(m.billing_street, d.billing_street),
      billing_city = coalesce(m.billing_city, d.billing_city), billing_state = coalesce(m.billing_state, d.billing_state),
      shipping_street = coalesce(m.shipping_street, d.shipping_street), shipping_city = coalesce(m.shipping_city, d.shipping_city),
      description = coalesce(m.description, d.description), custom_fields = d.custom_fields || m.custom_fields
    from public.accounts d where m.id = p_master and d.id = p_duplicate;
    update public.contacts set account_id = p_master where account_id = p_duplicate;
    update public.opportunities set account_id = p_master where account_id = p_duplicate;
    update public.activities set account_id = p_master where account_id = p_duplicate;
    update public.quotes set account_id = p_master where account_id = p_duplicate;
    update public.cases set account_id = p_master where account_id = p_duplicate;
    update public.accounts set parent_account_id = p_master where parent_account_id = p_duplicate and id <> p_master;
    update public.leads set converted_account_id = p_master where converted_account_id = p_duplicate;
    delete from public.accounts where id = p_duplicate;
  elsif p_object = 'contacts' then
    update public.contacts m set
      account_id = coalesce(m.account_id, d.account_id), first_name = coalesce(m.first_name, d.first_name),
      title = coalesce(m.title, d.title), department = coalesce(m.department, d.department), email = coalesce(m.email, d.email),
      phone = coalesce(m.phone, d.phone), mobile = coalesce(m.mobile, d.mobile), birthdate = coalesce(m.birthdate, d.birthdate),
      lead_source = coalesce(m.lead_source, d.lead_source), mailing_city = coalesce(m.mailing_city, d.mailing_city),
      description = coalesce(m.description, d.description), custom_fields = d.custom_fields || m.custom_fields
    from public.contacts d where m.id = p_master and d.id = p_duplicate;
    update public.opportunities set contact_id = p_master where contact_id = p_duplicate;
    update public.activities set contact_id = p_master where contact_id = p_duplicate;
    update public.quotes set contact_id = p_master where contact_id = p_duplicate;
    update public.cases set contact_id = p_master where contact_id = p_duplicate;
    update public.contacts set reports_to_id = p_master where reports_to_id = p_duplicate and id <> p_master;
    delete from public.campaign_members cm where cm.contact_id = p_duplicate
      and exists (select 1 from public.campaign_members x where x.campaign_id = cm.campaign_id and x.contact_id = p_master);
    update public.campaign_members set contact_id = p_master where contact_id = p_duplicate;
    update public.leads set converted_contact_id = p_master where converted_contact_id = p_duplicate;
    delete from public.contacts where id = p_duplicate;
  else
    update public.leads m set
      first_name = coalesce(m.first_name, d.first_name), title = coalesce(m.title, d.title), email = coalesce(m.email, d.email),
      phone = coalesce(m.phone, d.phone), mobile = coalesce(m.mobile, d.mobile), website = coalesce(m.website, d.website),
      industry = coalesce(m.industry, d.industry), city = coalesce(m.city, d.city), campaign_id = coalesce(m.campaign_id, d.campaign_id),
      description = coalesce(m.description, d.description), custom_fields = d.custom_fields || m.custom_fields
    from public.leads d where m.id = p_master and d.id = p_duplicate;
    update public.activities set lead_id = p_master where lead_id = p_duplicate;
    delete from public.campaign_members cm where cm.lead_id = p_duplicate
      and exists (select 1 from public.campaign_members x where x.campaign_id = cm.campaign_id and x.lead_id = p_master);
    update public.campaign_members set lead_id = p_master where lead_id = p_duplicate;
    delete from public.leads where id = p_duplicate;
  end if;
  return p_master;
end;
$$;
grant execute on function public.merge_records(text, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Alertas programadas
-- ---------------------------------------------------------------------------
alter table public.notifications add column dedupe_key text;
create unique index notifications_dedupe_uq on public.notifications (user_id, dedupe_key) where dedupe_key is not null;

create table public.alert_settings (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default true,
  stale_days int not null default 14 check (stale_days between 3 and 180),
  notify_overdue_close boolean not null default true,
  notify_stale boolean not null default true,
  notify_overdue_tasks boolean not null default true,
  last_run_at timestamptz,
  last_run_count int
);
insert into public.alert_settings (id) values (1) on conflict do nothing;
alter table public.alert_settings enable row level security;
create policy "alertas: lectura" on public.alert_settings for select to authenticated using (true);
create policy "alertas: personalización" on public.alert_settings for update to authenticated
  using (public.has_perm('system', 'customize')) with check (public.has_perm('system', 'customize'));

-- Genera los avisos del día (una sola vez por día y elemento gracias a dedupe_key).
-- La ejecuta pg_cron sin usuario, o un administrador con «Ejecutar ahora».
create or replace function public.generate_alerts()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.alert_settings%rowtype;
  v_today text := to_char((now() at time zone 'America/Bogota')::date, 'YYYY-MM-DD');
  v_count int := 0;
  v_n int;
begin
  if auth.uid() is not null and not public.has_perm('system', 'customize') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select * into s from public.alert_settings where id = 1;
  if not found or not s.enabled then
    return 0;
  end if;

  if s.notify_overdue_close then
    insert into public.notifications (user_id, title, body, link, dedupe_key)
    select o.owner_id, 'Fecha de cierre vencida', o.name || ' · cerraba el ' || to_char(o.close_date, 'DD/MM/YYYY'),
           '/oportunidades/' || o.id, 'close:' || o.id || ':' || v_today
    from public.opportunities o
    join public.profiles p on p.id = o.owner_id and p.is_active
    where not o.is_closed and o.close_date < (now() at time zone 'America/Bogota')::date
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
    get diagnostics v_n = row_count;
    v_count := v_count + v_n;
  end if;

  if s.notify_stale then
    insert into public.notifications (user_id, title, body, link, dedupe_key)
    select o.owner_id, 'Oportunidad sin actividad', o.name || ' · ' || s.stale_days || ' días sin actividades ni cambios de etapa',
           '/oportunidades/' || o.id, 'stale:' || o.id || ':' || to_char(date_trunc('week', now()), 'YYYY-MM-DD')
    from public.opportunities o
    join public.profiles p on p.id = o.owner_id and p.is_active
    where not o.is_closed
      and o.stage_changed_at < now() - make_interval(days => s.stale_days)
      and not exists (
        select 1 from public.activities a
        where a.opportunity_id = o.id and coalesce(a.completed_at, a.created_at) > now() - make_interval(days => s.stale_days)
      )
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
    get diagnostics v_n = row_count;
    v_count := v_count + v_n;
  end if;

  if s.notify_overdue_tasks then
    insert into public.notifications (user_id, title, body, link, dedupe_key)
    select a.owner_id, 'Tienes ' || count(*) || ' tarea(s) vencida(s)', 'Revisa tu agenda para ponerte al día.',
           '/actividades', 'tasks:' || a.owner_id || ':' || v_today
    from public.activities a
    join public.profiles p on p.id = a.owner_id and p.is_active
    where a.status in ('pending', 'in_progress') and a.activity_type in ('task', 'call')
      and a.due_date < (now() at time zone 'America/Bogota')::date
    group by a.owner_id
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
    get diagnostics v_n = row_count;
    v_count := v_count + v_n;
  end if;

  update public.alert_settings set last_run_at = now(), last_run_count = v_count where id = 1;
  return v_count;
end;
$$;
grant execute on function public.generate_alerts() to authenticated;

-- Programación diaria (7:00 a. m. Bogotá = 12:00 UTC) si pg_cron está disponible.
-- En entornos sin pg_cron la migración continúa y las alertas se ejecutan a mano.
do $$
begin
  begin
    execute 'create extension if not exists pg_cron';
  exception when others then
    raise notice 'pg_cron no disponible: las alertas se ejecutarán desde Configuración';
    return;
  end;
  begin
    execute $cron$select cron.schedule('firplak-alertas-diarias', '0 12 * * *', 'select public.generate_alerts()')$cron$;
  exception when others then
    raise notice 'No se pudo programar la tarea de pg_cron: %', sqlerrm;
  end;
end
$$;
