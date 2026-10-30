-- Firplak CRM · Fase 4: listas de valores editables, reglas de validación,
-- automatizaciones con notificaciones y auditoría de cambios por campo.

-- ---------------------------------------------------------------------------
-- Listas de valores (picklists). Si un campo tiene valores aquí, reemplazan la
-- lista estándar del código. Los valores inactivos no se ofrecen en formularios
-- pero se siguen mostrando en los registros que ya los usan.
-- ---------------------------------------------------------------------------
create table public.picklist_values (
  id uuid primary key default gen_random_uuid(),
  object text not null,
  field text not null,
  value text not null check (length(trim(value)) > 0),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (object, field, value)
);
alter table public.picklist_values enable row level security;
create policy "listas: lectura" on public.picklist_values for select to authenticated using (true);
create policy "listas: personalización" on public.picklist_values for all to authenticated
  using (public.has_perm('system', 'customize')) with check (public.has_perm('system', 'customize'));

-- ---------------------------------------------------------------------------
-- Reglas de validación: si el registro cumple TODAS las condiciones, se
-- rechaza el guardado con el mensaje indicado.
-- conditions = [{"field":"account_type","op":"eq","value":"Cliente"}, ...]
-- ---------------------------------------------------------------------------
create table public.validation_rules (
  id uuid primary key default gen_random_uuid(),
  object text not null,
  name text not null check (length(trim(name)) > 0),
  description text,
  conditions jsonb not null default '[]'::jsonb,
  error_message text not null,
  error_field text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger validation_rules_updated_at before update on public.validation_rules
  for each row execute function public.set_updated_at();
alter table public.validation_rules enable row level security;
create policy "validaciones: lectura" on public.validation_rules for select to authenticated using (true);
create policy "validaciones: personalización" on public.validation_rules for all to authenticated
  using (public.has_perm('system', 'customize')) with check (public.has_perm('system', 'customize'));

-- ---------------------------------------------------------------------------
-- Automatizaciones: al crear o actualizar un registro que cumple las condiciones,
-- ejecutan acciones (asignar propietario, crear tarea, notificar, fijar campo).
-- actions = [{"type":"assign_owner","user_id":"…"},
--            {"type":"create_task","subject":"…","due_in_days":2,"assign_to":"owner|<uuid>","priority":"high"},
--            {"type":"notify","to":"owner|manager|<uuid>","title":"…","body":"…"},
--            {"type":"set_field","field":"rating","value":"Caliente"}]
-- ---------------------------------------------------------------------------
create table public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  object text not null,
  name text not null check (length(trim(name)) > 0),
  description text,
  trigger_on text not null default 'create' check (trigger_on in ('create', 'update', 'create_or_update')),
  watch_field text,
  conditions jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  sort_order int not null default 0,
  is_active boolean not null default true,
  last_run_at timestamptz,
  run_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger automation_rules_updated_at before update on public.automation_rules
  for each row execute function public.set_updated_at();
alter table public.automation_rules enable row level security;
create policy "automatizaciones: lectura" on public.automation_rules for select to authenticated using (true);
create policy "automatizaciones: personalización" on public.automation_rules for all to authenticated
  using (public.has_perm('system', 'customize')) with check (public.has_perm('system', 'customize'));

-- Registro de ejecución (contador) sin dar permiso de edición de reglas.
create or replace function public.mark_automation_run(p_rule uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.automation_rules set last_run_at = now(), run_count = run_count + 1 where id = p_rule;
$$;
grant execute on function public.mark_automation_run(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Notificaciones internas
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text,
  link text,
  is_read boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, is_read, created_at desc);
alter table public.notifications enable row level security;
create policy "notificaciones: propias" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "notificaciones: marcar leídas" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notificaciones: borrar propias" on public.notifications for delete to authenticated using (user_id = auth.uid());

-- Cualquier usuario activo puede notificar a otro usuario activo (p. ej. desde una
-- automatización); el enlace debe ser interno.
create or replace function public.notify_user(p_user uuid, p_title text, p_body text default null, p_link text default null)
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
  if p_link is not null and (left(p_link, 1) <> '/' or left(p_link, 2) = '//') then
    raise exception 'Enlace no válido';
  end if;
  insert into public.notifications (user_id, title, body, link, created_by)
  select p_user, left(p_title, 200), left(p_body, 1000), p_link, auth.uid()
  where exists (select 1 from public.profiles where id = p_user and is_active)
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.notify_user(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Auditoría: historial de cambios por campo (trigger genérico)
-- ---------------------------------------------------------------------------
create table public.field_history (
  id bigint generated always as identity primary key,
  object text not null,
  record_id uuid not null,
  field text not null,
  old_value text,
  new_value text,
  operation text not null default 'update' check (operation in ('insert', 'update', 'delete')),
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);
create index field_history_record_idx on public.field_history (object, record_id, changed_at desc);
create index field_history_changed_at_idx on public.field_history (changed_at desc);

create or replace function public.audit_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_key text;
  v_ignore text[] := array['updated_at', 'created_at', 'full_name', 'expected_revenue', 'stage_changed_at',
                           'subtotal', 'discount_total', 'net_total', 'tax', 'grand_total', 'line_total',
                           'is_closed', 'is_won', 'closed_at', 'completed_at', 'has_responded'];
begin
  if tg_op = 'INSERT' then
    insert into public.field_history (object, record_id, field, operation, changed_by)
    values (tg_table_name, new.id, '*', 'insert', auth.uid());
    return null;
  elsif tg_op = 'DELETE' then
    insert into public.field_history (object, record_id, field, old_value, operation, changed_by)
    values (tg_table_name, old.id, '*', to_jsonb(old) ->> (case when tg_table_name in ('contacts', 'leads') then 'full_name'
                                                               when tg_table_name = 'cases' then 'subject' else 'name' end),
            'delete', auth.uid());
    return null;
  end if;

  v_old := to_jsonb(old);
  v_new := to_jsonb(new);
  for v_key in select jsonb_object_keys(v_new) loop
    continue when v_key = any(v_ignore);
    if v_key = 'custom_fields' then
      -- Un registro por cada campo personalizado modificado.
      insert into public.field_history (object, record_id, field, old_value, new_value, changed_by)
      select tg_table_name, new.id, 'cf.' || k, (v_old -> 'custom_fields') ->> k, (v_new -> 'custom_fields') ->> k, auth.uid()
      from (
        select jsonb_object_keys(coalesce(v_old -> 'custom_fields', '{}'::jsonb)) as k
        union
        select jsonb_object_keys(coalesce(v_new -> 'custom_fields', '{}'::jsonb))
      ) keys
      where (v_old -> 'custom_fields' -> k) is distinct from (v_new -> 'custom_fields' -> k);
    elsif (v_old -> v_key) is distinct from (v_new -> v_key) then
      insert into public.field_history (object, record_id, field, old_value, new_value, changed_by)
      values (tg_table_name, new.id, v_key, v_old ->> v_key, v_new ->> v_key, auth.uid());
    end if;
  end loop;
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['accounts', 'contacts', 'opportunities', 'leads', 'quotes', 'cases', 'campaigns', 'products'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_changes()',
                   t || '_audit', t);
  end loop;
end
$$;

-- El historial de un registro se ve si se puede ver el registro (RLS del objeto).
create or replace function public.can_see_record(p_object text, p_id uuid)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  if p_object not in ('accounts', 'contacts', 'opportunities', 'leads', 'quotes', 'cases', 'campaigns', 'products') then
    return false;
  end if;
  execute format('select exists (select 1 from public.%I where id = $1)', p_object) into v_ok using p_id;
  return v_ok;
end;
$$;

alter table public.field_history enable row level security;
create policy "historial: ver si se ve el registro" on public.field_history for select to authenticated
  using (
    public.has_perm('system', 'manage_users')
    or (operation <> 'delete' and public.can_see_record(object, record_id))
  );
