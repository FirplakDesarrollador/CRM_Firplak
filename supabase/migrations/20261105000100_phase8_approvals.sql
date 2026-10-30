-- Firplak CRM · Fase 8: procesos de aprobación (p. ej. descuentos altos en cotizaciones).
-- Un proceso define a qué registros aplica (condiciones), quién aprueba (el jefe directo del
-- propietario o un usuario fijo), si el registro queda bloqueado mientras espera, y qué campos
-- se actualizan al enviar, aprobar y rechazar o retirar.

-- ---------------------------------------------------------------------------
-- Cotizaciones: estado «Aprobada» y porcentaje de descuento calculado.
-- ---------------------------------------------------------------------------
alter table public.quotes drop constraint quotes_status_check;
alter table public.quotes add constraint quotes_status_check
  check (status in ('Borrador', 'En revisión', 'Aprobada', 'Presentada', 'Aceptada', 'Rechazada'));
alter table public.quotes add column discount_percent numeric(6, 2)
  generated always as (case when subtotal > 0 then round(discount_total * 100 / subtotal, 2) else 0 end) stored;

-- Las cotizaciones aprobadas siguen abiertas en los indicadores.
create or replace function public.crm_dashboard_extra(p_from date, p_to date, p_owner uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with
  l as (select * from public.leads where p_owner is null or owner_id = p_owner),
  c as (select * from public.cases where p_owner is null or owner_id = p_owner),
  qt as (select * from public.quotes where p_owner is null or owner_id = p_owner)
  select jsonb_build_object(
    'leads_new', (select count(*) from l where created_at::date between p_from and p_to),
    'leads_converted', (select count(*) from l where is_converted and converted_at::date between p_from and p_to),
    'leads_open', (select count(*) from l where not is_converted and status <> 'No calificado'),
    'lead_conversion_rate', (
      select case when count(*) = 0 then null
                  else round(count(*) filter (where is_converted) * 100.0 / count(*), 1) end
      from l where created_at::date between p_from and p_to),
    'leads_by_status', coalesce((select jsonb_agg(row_to_json(s)) from (
        select status, count(*) as count from l group by status order by count(*) desc) s), '[]'::jsonb),
    'cases_open', (select count(*) from c where not is_closed),
    'cases_high', (select count(*) from c where not is_closed and priority = 'Alta'),
    'cases_closed', (select count(*) from c where is_closed and closed_at::date between p_from and p_to),
    'avg_resolution_days', (select round(avg(extract(epoch from (closed_at - created_at)) / 86400)::numeric, 1)
                             from c where is_closed and closed_at::date between p_from and p_to),
    'quotes_open', (select count(*) from qt where status in ('Borrador', 'En revisión', 'Aprobada', 'Presentada')),
    'quotes_open_amount', coalesce((select sum(net_total) from qt where status in ('Borrador', 'En revisión', 'Aprobada', 'Presentada')), 0),
    'quotes_accepted', (select count(*) from qt where status = 'Aceptada' and updated_at::date between p_from and p_to)
  );
$$;

-- ---------------------------------------------------------------------------
-- Procesos y solicitudes
-- updates = [{"field":"status","value":"En revisión"}, {"field":"cf.nivel","value":"2"}]
-- ---------------------------------------------------------------------------
create table public.approval_processes (
  id uuid primary key default gen_random_uuid(),
  object text not null check (object in ('accounts', 'contacts', 'opportunities', 'leads', 'quotes', 'cases', 'campaigns', 'products')),
  name text not null check (length(trim(name)) > 0),
  description text,
  conditions jsonb not null default '[]'::jsonb,
  approver_type text not null default 'manager' check (approver_type in ('manager', 'user')),
  approver_id uuid references public.profiles (id) on delete set null,
  lock_record boolean not null default true,
  submit_updates jsonb not null default '[]'::jsonb,
  approve_updates jsonb not null default '[]'::jsonb,
  reject_updates jsonb not null default '[]'::jsonb,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger approval_processes_updated_at before update on public.approval_processes
  for each row execute function public.set_updated_at();
alter table public.approval_processes enable row level security;
create policy "procesos de aprobación: lectura" on public.approval_processes for select to authenticated using (true);
create policy "procesos de aprobación: personalización" on public.approval_processes for all to authenticated
  using (public.has_perm('system', 'customize')) with check (public.has_perm('system', 'customize'));

create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  process_id uuid references public.approval_processes (id) on delete set null,
  process_name text not null,
  object text not null,
  record_id uuid not null,
  record_name text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'recalled')),
  lock_record boolean not null default true,
  submitted_by uuid references public.profiles (id) on delete set null,
  submitted_at timestamptz not null default now(),
  submit_comment text,
  approver_id uuid references public.profiles (id) on delete set null,
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  decision_comment text
);
create unique index approval_requests_one_pending on public.approval_requests (object, record_id) where status = 'pending';
create index approval_requests_record_idx on public.approval_requests (object, record_id, submitted_at desc);
create index approval_requests_approver_idx on public.approval_requests (approver_id, status);
create index approval_requests_submitter_idx on public.approval_requests (submitted_by, status);

-- Se ven si participas (enviaste o apruebas), si administras usuarios o si ves el registro.
-- Solo se crean y cambian con las funciones de abajo.
alter table public.approval_requests enable row level security;
create policy "aprobaciones: ver" on public.approval_requests for select to authenticated
  using (
    submitted_by = auth.uid() or approver_id = auth.uid()
    or public.has_perm('system', 'manage_users')
    or public.can_see_record(object, record_id)
  );

-- Ruta de la ficha de cada objeto (enlaces de las notificaciones).
create or replace function public.record_path(p_object text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_object
    when 'accounts' then '/cuentas' when 'contacts' then '/contactos' when 'opportunities' then '/oportunidades'
    when 'leads' then '/prospectos' when 'quotes' then '/cotizaciones' when 'cases' then '/casos'
    when 'campaigns' then '/campanas' when 'products' then '/productos' end;
$$;

-- Aplica las actualizaciones de campo de un proceso. Solo la usan las funciones de
-- aprobación; valida que la columna exista y no sea de sistema.
create or replace function public.apply_field_updates(p_table text, p_id uuid, p_updates jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  u jsonb;
  f text;
  v text;
  t text;
begin
  for u in select * from jsonb_array_elements(coalesce(p_updates, '[]'::jsonb)) loop
    f := u ->> 'field';
    v := nullif(u ->> 'value', '');
    continue when f is null or f = '';
    if left(f, 3) = 'cf.' then
      execute format('update public.%I set custom_fields = coalesce(custom_fields, ''{}''::jsonb) || jsonb_build_object($1::text, to_jsonb($2::text)) where id = $3', p_table)
        using substr(f, 4), v, p_id;
    else
      select pg_catalog.format_type(a.atttypid, a.atttypmod) into t
        from pg_catalog.pg_attribute a
        where a.attrelid = format('public.%I', p_table)::regclass and a.attname = f
          and a.attnum > 0 and not a.attisdropped and a.attgenerated = '';
      if t is null or f in ('id', 'created_at', 'created_by', 'updated_at', 'is_demo', 'custom_fields') then
        raise exception 'Campo no válido en el proceso de aprobación: %', f;
      end if;
      execute format('update public.%I set %I = $1::%s where id = $2', p_table, f, t) using v, p_id;
    end if;
  end loop;
end;
$$;
revoke execute on function public.apply_field_updates(text, uuid, jsonb) from public, anon, authenticated;

-- ¿El registro está bloqueado para el usuario actual? Lo puede editar el aprobador
-- asignado y quien administra usuarios.
create or replace function public.is_record_locked(p_object text, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.approval_requests r
      where r.object = p_object and r.record_id = p_id and r.status = 'pending' and r.lock_record
        and r.approver_id is distinct from auth.uid())
    and not public.has_perm('system', 'manage_users');
$$;
grant execute on function public.is_record_locked(text, uuid) to authenticated;

-- Bloqueo en la base: solo cambios directos del usuario (no los que hacen otros
-- triggers, como el recálculo de totales) y nunca procesos del sistema sin usuario.
create or replace function public.enforce_approval_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_trigger_depth() = 1 and auth.uid() is not null and public.is_record_locked(tg_table_name, old.id) then
    raise exception 'El registro está bloqueado mientras espera aprobación' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['accounts', 'contacts', 'opportunities', 'leads', 'quotes', 'cases', 'campaigns', 'products'] loop
    execute format('create trigger %I before update or delete on public.%I for each row execute function public.enforce_approval_lock()',
                   t || '_approval_lock', t);
  end loop;
end
$$;

-- Las líneas de una cotización bloqueada tampoco se pueden cambiar.
create or replace function public.enforce_quote_line_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_quote uuid;
begin
  if tg_op = 'DELETE' then v_quote := old.quote_id; else v_quote := new.quote_id; end if;
  if auth.uid() is not null and public.is_record_locked('quotes', v_quote) then
    raise exception 'La cotización está bloqueada mientras espera aprobación' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
create trigger quote_line_items_approval_lock before insert or update or delete on public.quote_line_items
  for each row execute function public.enforce_quote_line_lock();

-- ---------------------------------------------------------------------------
-- Enviar, decidir y retirar
-- ---------------------------------------------------------------------------
create or replace function public.submit_approval(p_process uuid, p_record uuid, p_comment text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pr public.approval_processes%rowtype;
  v_row jsonb;
  v_owner uuid;
  v_approver uuid;
  v_name text;
  v_id uuid;
begin
  select * into pr from public.approval_processes where id = p_process and is_active;
  if not found then
    raise exception 'El proceso de aprobación no existe o está inactivo';
  end if;
  execute format('select to_jsonb(t) from public.%I t where id = $1', pr.object) into v_row using p_record;
  if v_row is null then
    raise exception 'Registro no encontrado';
  end if;
  v_owner := nullif(v_row ->> 'owner_id', '')::uuid;
  if not (case when pr.object = 'products' then public.has_perm('products', 'edit')
               else public.can_edit_record(pr.object, v_owner) end) then
    raise exception 'No tienes permiso para enviar este registro a aprobación' using errcode = '42501';
  end if;
  if exists (select 1 from public.approval_requests where object = pr.object and record_id = p_record and status = 'pending') then
    raise exception 'El registro ya tiene una aprobación pendiente';
  end if;

  if pr.approver_type = 'user' then
    v_approver := pr.approver_id;
  else
    select manager_id into v_approver from public.profiles where id = coalesce(v_owner, auth.uid());
    if v_approver is null then
      select manager_id into v_approver from public.profiles where id = auth.uid();
    end if;
  end if;
  if v_approver is null or not exists (select 1 from public.profiles where id = v_approver and is_active) then
    raise exception 'No hay un aprobador activo: asigna un jefe directo al propietario o un aprobador al proceso';
  end if;

  perform public.apply_field_updates(pr.object, p_record, pr.submit_updates);

  v_name := coalesce((v_row ->> 'quote_number') || ' · ' || (v_row ->> 'name'), v_row ->> 'case_number' || ' · ' || (v_row ->> 'subject'),
                     v_row ->> 'name', v_row ->> 'full_name', v_row ->> 'subject', p_record::text);
  insert into public.approval_requests (process_id, process_name, object, record_id, record_name, lock_record,
                                        submitted_by, submit_comment, approver_id)
  values (pr.id, pr.name, pr.object, p_record, left(v_name, 300), pr.lock_record,
          auth.uid(), nullif(trim(p_comment), ''), v_approver)
  returning id into v_id;

  insert into public.notifications (user_id, title, body, link, created_by)
  values (v_approver, left('Aprobación pendiente: ' || pr.name, 200),
          left(v_name || coalesce(' · ' || nullif(trim(p_comment), ''), ''), 1000),
          public.record_path(pr.object) || '/' || p_record, auth.uid());
  return v_id;
end;
$$;
grant execute on function public.submit_approval(uuid, uuid, text) to authenticated;

create or replace function public.decide_approval(p_request uuid, p_approve boolean, p_comment text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.approval_requests%rowtype;
  v_updates jsonb;
begin
  select * into r from public.approval_requests where id = p_request for update;
  if not found or r.status <> 'pending' then
    raise exception 'La solicitud ya no está pendiente';
  end if;
  if not (r.approver_id = auth.uid() or public.has_perm('system', 'manage_users')) then
    raise exception 'Solo el aprobador asignado puede decidir esta solicitud' using errcode = '42501';
  end if;
  if not p_approve and coalesce(trim(p_comment), '') = '' then
    raise exception 'Indica el motivo del rechazo';
  end if;

  update public.approval_requests
    set status = case when p_approve then 'approved' else 'rejected' end,
        decided_by = auth.uid(), decided_at = now(), decision_comment = nullif(trim(p_comment), '')
    where id = p_request;

  select case when p_approve then approve_updates else reject_updates end into v_updates
    from public.approval_processes where id = r.process_id;
  perform public.apply_field_updates(r.object, r.record_id, v_updates);

  if r.submitted_by is not null and r.submitted_by <> auth.uid() then
    insert into public.notifications (user_id, title, body, link, created_by)
    values (r.submitted_by,
            left(case when p_approve then 'Aprobado: ' else 'Rechazado: ' end || r.process_name, 200),
            left(coalesce(r.record_name, '') || coalesce(' · ' || nullif(trim(p_comment), ''), ''), 1000),
            public.record_path(r.object) || '/' || r.record_id, auth.uid());
  end if;
end;
$$;
grant execute on function public.decide_approval(uuid, boolean, text) to authenticated;

-- Quien envió (o administración) puede retirar la solicitud; se aplican las
-- actualizaciones de rechazo para devolver el registro a su estado de trabajo.
create or replace function public.recall_approval(p_request uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.approval_requests%rowtype;
  v_updates jsonb;
begin
  select * into r from public.approval_requests where id = p_request for update;
  if not found or r.status <> 'pending' then
    raise exception 'La solicitud ya no está pendiente';
  end if;
  if not (r.submitted_by = auth.uid() or public.has_perm('system', 'manage_users')) then
    raise exception 'Solo quien envió la solicitud puede retirarla' using errcode = '42501';
  end if;
  update public.approval_requests set status = 'recalled', decided_by = auth.uid(), decided_at = now() where id = p_request;
  select reject_updates into v_updates from public.approval_processes where id = r.process_id;
  perform public.apply_field_updates(r.object, r.record_id, v_updates);
  if r.approver_id is not null and r.approver_id <> auth.uid() then
    insert into public.notifications (user_id, title, body, link, created_by)
    values (r.approver_id, left('Solicitud retirada: ' || r.process_name, 200), r.record_name,
            public.record_path(r.object) || '/' || r.record_id, auth.uid());
  end if;
end;
$$;
grant execute on function public.recall_approval(uuid) to authenticated;
