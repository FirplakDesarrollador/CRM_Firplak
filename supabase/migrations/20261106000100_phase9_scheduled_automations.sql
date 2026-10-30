-- Firplak CRM · Fase 9: automatizaciones programadas por fecha.
-- Una regla «programada» se dispara N días antes o después de una fecha del registro
-- (p. ej. 3 días antes del cierre, 1 día después del vencimiento de una cotización),
-- si el registro cumple las condiciones. Corre a diario con pg_cron o con «Ejecutar ahora».

alter table public.automation_rules drop constraint automation_rules_trigger_on_check;
alter table public.automation_rules add constraint automation_rules_trigger_on_check
  check (trigger_on in ('create', 'update', 'create_or_update', 'scheduled'));
alter table public.automation_rules
  add column schedule_field text,
  add column schedule_offset_days int not null default 0 check (schedule_offset_days between -365 and 365),
  add constraint automation_rules_schedule_check check (trigger_on <> 'scheduled' or schedule_field is not null);

-- Una ejecución por regla, registro y fecha objetivo: si la fecha del registro cambia,
-- la regla vuelve a dispararse para la nueva fecha.
create table public.automation_runs (
  rule_id uuid not null references public.automation_rules (id) on delete cascade,
  record_id uuid not null,
  target_date date not null,
  executed_at timestamptz not null default now(),
  primary key (rule_id, record_id, target_date)
);
alter table public.automation_runs enable row level security;
create policy "ejecuciones: lectura para personalización" on public.automation_runs for select to authenticated
  using (public.has_perm('system', 'customize'));

-- ---------------------------------------------------------------------------
-- Evaluación de condiciones en SQL (mismos operadores que los filtros de lista y
-- que src/lib/rules/evaluate.ts) sobre un registro en jsonb.
-- ---------------------------------------------------------------------------
create or replace function public.try_numeric(p text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when p ~ '^\s*-?\d+(\.\d+)?\s*$' then trim(p)::numeric end;
$$;

-- Fecha (zona Bogotá) de un valor jsonb: 'YYYY-MM-DD' o marca de tiempo ISO.
create or replace function public.jsonb_to_date(p jsonb)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  s text;
begin
  if p is null or jsonb_typeof(p) <> 'string' then
    return null;
  end if;
  s := p #>> '{}';
  if s ~ '^\d{4}-\d{2}-\d{2}$' then
    return s::date;
  elsif s ~ '^\d{4}-\d{2}-\d{2}[T ]\d' then
    return (s::timestamptz at time zone 'America/Bogota')::date;
  end if;
  return null;
exception when others then
  return null;
end;
$$;

create or replace function public.condition_matches(p_row jsonb, c jsonb)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  f text := c ->> 'field';
  op text := c ->> 'op';
  target text := coalesce(c ->> 'value', '');
  v jsonb;
  s text;
  t text;
  is_empty boolean;
  d date;
  a numeric;
  b numeric;
  today date := (now() at time zone 'America/Bogota')::date;
  r_from date;
  r_to date;
begin
  if f is null or op is null then
    return false;
  end if;
  v := case when left(f, 3) = 'cf.' then p_row -> 'custom_fields' -> substr(f, 4) else p_row -> f end;
  t := coalesce(jsonb_typeof(v), 'null');
  is_empty := t = 'null' or (t = 'string' and v #>> '{}' = '') or (t = 'array' and jsonb_array_length(v) = 0);
  s := case when is_empty then null else v #>> '{}' end;
  d := public.jsonb_to_date(v);

  case op
    when 'empty' then return is_empty;
    when 'not_empty' then return not is_empty;
    when 'me' then return false;
    when 'eq' then
      if t = 'boolean' then return (v::text = 'true') = (target = 'true'); end if;
      if t = 'number' then return v::text::numeric = public.try_numeric(target); end if;
      if d is not null and target ~ '^\d{4}-\d{2}-\d{2}$' then return d = target::date; end if;
      return lower(coalesce(s, '')) = lower(target);
    when 'neq' then
      if t = 'boolean' then return (v::text = 'true') <> (target = 'true'); end if;
      if t = 'number' then return v::text::numeric is distinct from public.try_numeric(target); end if;
      if is_empty and public.try_numeric(target) is not null then return true; end if;
      return lower(coalesce(s, '')) <> lower(target);
    when 'contains' then
      if t = 'array' then return v ? target; end if;
      return position(lower(target) in lower(coalesce(s, ''))) > 0;
    when 'starts' then
      return left(lower(coalesce(s, '')), length(target)) = lower(target);
    when 'gt', 'gte', 'lt', 'lte' then
      if d is not null or (is_empty and target ~ '^\d{4}-\d{2}-\d{2}$') then
        if d is null or target !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
        return case op when 'gt' then d > target::date when 'gte' then d >= target::date
                       when 'lt' then d < target::date else d <= target::date end;
      end if;
      b := public.try_numeric(target);
      if b is null then return false; end if;
      a := case when is_empty then 0 when t = 'number' then v::text::numeric else public.try_numeric(s) end;
      if a is null then return false; end if;
      return case op when 'gt' then a > b when 'gte' then a >= b when 'lt' then a < b else a <= b end;
    when 'overdue' then
      return d is not null and d < today;
    else
      case op
        when 'today' then r_from := today; r_to := today;
        when 'this_week' then r_from := date_trunc('week', today)::date; r_to := r_from + 6;
        when 'this_month' then r_from := date_trunc('month', today)::date; r_to := (r_from + interval '1 month')::date - 1;
        when 'this_quarter' then r_from := date_trunc('quarter', today)::date; r_to := (r_from + interval '3 months')::date - 1;
        when 'this_year' then r_from := date_trunc('year', today)::date; r_to := (r_from + interval '1 year')::date - 1;
        when 'last_n_days' then r_from := today - greatest(1, coalesce(public.try_numeric(target)::int, 30)); r_to := today;
        when 'next_n_days' then r_from := today; r_to := today + greatest(1, coalesce(public.try_numeric(target)::int, 30));
        else return false;
      end case;
      return d is not null and d between r_from and r_to;
  end case;
end;
$$;

-- true si el registro cumple TODAS las condiciones (lista vacía = siempre).
create or replace function public.conditions_match(p_row jsonb, p_conditions jsonb)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(bool_and(public.condition_matches(p_row, c)), true)
  from jsonb_array_elements(case when jsonb_typeof(p_conditions) = 'array' then p_conditions else '[]'::jsonb end) c;
$$;

-- Nombre legible de un registro en jsonb.
create or replace function public.record_label(p_row jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce((p_row ->> 'quote_number') || ' · ' || (p_row ->> 'name'),
                  (p_row ->> 'case_number') || ' · ' || (p_row ->> 'subject'),
                  p_row ->> 'name', p_row ->> 'full_name', p_row ->> 'subject', p_row ->> 'id');
$$;

-- ---------------------------------------------------------------------------
-- Acciones (mismas que las automatizaciones al guardar). Una acción que falle no
-- detiene las demás.
-- ---------------------------------------------------------------------------
create or replace function public.execute_automation_actions(p_rule public.automation_rules, p_row jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a jsonb;
  v_id uuid := (p_row ->> 'id')::uuid;
  v_owner uuid := nullif(p_row ->> 'owner_id', '')::uuid;
  v_to uuid;
  v_label text := public.record_label(p_row);
  v_link text := public.record_path(p_rule.object) || '/' || (p_row ->> 'id');
  v_uuid constant text := '^[0-9a-fA-F-]{36}$';
begin
  for a in select * from jsonb_array_elements(coalesce(p_rule.actions, '[]'::jsonb)) loop
    begin
      case a ->> 'type'
        when 'assign_owner' then
          if p_row ? 'owner_id' and a ->> 'user_id' ~ v_uuid then
            execute format('update public.%I set owner_id = $1 where id = $2', p_rule.object) using (a ->> 'user_id')::uuid, v_id;
          end if;
        when 'set_field' then
          perform public.apply_field_updates(p_rule.object, v_id, jsonb_build_array(a));
        when 'create_task' then
          v_to := case when a ->> 'assign_to' ~ v_uuid then (a ->> 'assign_to')::uuid else v_owner end;
          if v_to is not null and coalesce(a ->> 'subject', '') <> '' then
            insert into public.activities (activity_type, subject, description, status, priority, due_date, owner_id,
                                           account_id, contact_id, opportunity_id, lead_id, case_id)
            values ('task', left(a ->> 'subject', 200), 'Creada automáticamente por la regla «' || p_rule.name || '».', 'pending',
                    case when a ->> 'priority' in ('high', 'normal', 'low') then a ->> 'priority' else 'normal' end,
                    (now() at time zone 'America/Bogota')::date + coalesce(public.try_numeric(a ->> 'due_in_days')::int, 1),
                    v_to,
                    case p_rule.object when 'accounts' then v_id
                      when 'opportunities' then nullif(p_row ->> 'account_id', '')::uuid
                      when 'contacts' then nullif(p_row ->> 'account_id', '')::uuid
                      when 'quotes' then nullif(p_row ->> 'account_id', '')::uuid
                      when 'cases' then nullif(p_row ->> 'account_id', '')::uuid end,
                    case p_rule.object when 'contacts' then v_id end,
                    case p_rule.object when 'opportunities' then v_id
                      when 'quotes' then nullif(p_row ->> 'opportunity_id', '')::uuid end,
                    case p_rule.object when 'leads' then v_id end,
                    case p_rule.object when 'cases' then v_id end);
          end if;
        when 'notify' then
          v_to := case
            when a ->> 'to' = 'owner' then v_owner
            when a ->> 'to' = 'manager' then (select manager_id from public.profiles where id = v_owner)
            when a ->> 'to' ~ v_uuid then (a ->> 'to')::uuid end;
          if v_to is not null and coalesce(a ->> 'title', '') <> ''
             and exists (select 1 from public.profiles where id = v_to and is_active) then
            insert into public.notifications (user_id, title, body, link)
            values (v_to, left(a ->> 'title', 200), left(v_label || coalesce(' · ' || nullif(a ->> 'body', ''), ''), 1000), v_link);
          end if;
        else
          null;
      end case;
    exception when others then
      raise notice 'Automatización «%»: acción % falló: %', p_rule.name, a ->> 'type', sqlerrm;
    end;
  end loop;
end;
$$;
revoke execute on function public.execute_automation_actions(public.automation_rules, jsonb) from public, anon, authenticated;

-- Ejecuta las reglas programadas cuya fecha objetivo (fecha del registro + desfase)
-- cayó entre los últimos 7 días y hoy, sin repetir. No dispara fechas anteriores a
-- la creación de la regla. La ejecuta pg_cron sin usuario o un administrador.
create or replace function public.run_scheduled_automations()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.automation_rules%rowtype;
  rec jsonb;
  v_today date := (now() at time zone 'America/Bogota')::date;
  v_from date;
  v_target date;
  v_rule_count int;
  v_total int := 0;
  v_n int;
begin
  if auth.uid() is not null and not public.has_perm('system', 'customize') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  for r in
    select * from public.automation_rules
    where is_active and trigger_on = 'scheduled' and schedule_field is not null
      and object in ('accounts', 'contacts', 'opportunities', 'leads', 'quotes', 'cases', 'campaigns')
    order by sort_order, created_at
  loop
    v_from := greatest(v_today - 7, (r.created_at at time zone 'America/Bogota')::date);
    v_rule_count := 0;
    for rec in execute format('select to_jsonb(t) from public.%I t', r.object) loop
      v_target := public.jsonb_to_date(case when left(r.schedule_field, 3) = 'cf.'
                                            then rec -> 'custom_fields' -> substr(r.schedule_field, 4)
                                            else rec -> r.schedule_field end) + r.schedule_offset_days;
      continue when v_target is null or v_target > v_today or v_target < v_from;
      continue when not public.conditions_match(rec, r.conditions);
      insert into public.automation_runs (rule_id, record_id, target_date)
      values (r.id, (rec ->> 'id')::uuid, v_target)
      on conflict do nothing;
      get diagnostics v_n = row_count;
      continue when v_n = 0;
      perform public.execute_automation_actions(r, rec);
      v_rule_count := v_rule_count + 1;
    end loop;
    if v_rule_count > 0 then
      update public.automation_rules set last_run_at = now(), run_count = run_count + v_rule_count where id = r.id;
      v_total := v_total + v_rule_count;
    end if;
  end loop;
  return v_total;
end;
$$;
grant execute on function public.run_scheduled_automations() to authenticated;

-- Programación diaria (6:30 a. m. Bogotá = 11:30 UTC) si pg_cron está disponible.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron no disponible: las automatizaciones programadas se ejecutarán desde Configuración';
    return;
  end if;
  begin
    execute $cron$select cron.schedule('firplak-automatizaciones-programadas', '30 11 * * *', 'select public.run_scheduled_automations()')$cron$;
  exception when others then
    raise notice 'No se pudo programar la tarea de pg_cron: %', sqlerrm;
  end;
end
$$;
