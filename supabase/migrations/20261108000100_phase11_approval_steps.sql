-- Firplak CRM · Fase 11: aprobaciones en varios pasos y pedidos en automatizaciones
-- programadas.
-- Cada proceso tiene pasos ordenados. Un paso aplica si el registro cumple sus
-- condiciones (si no, se omite) y lo aprueba el jefe directo del propietario, el jefe
-- del aprobador anterior o un usuario específico. La solicitud avanza paso a paso;
-- un rechazo en cualquier paso la termina.

create table public.approval_steps (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.approval_processes (id) on delete cascade,
  step_order int not null,
  name text not null check (length(trim(name)) > 0),
  conditions jsonb not null default '[]'::jsonb,
  approver_type text not null default 'manager' check (approver_type in ('manager', 'previous_manager', 'user')),
  approver_id uuid references public.profiles (id) on delete set null,
  unique (process_id, step_order)
);
alter table public.approval_steps enable row level security;
create policy "pasos de aprobación: lectura" on public.approval_steps for select to authenticated using (true);
create policy "pasos de aprobación: personalización" on public.approval_steps for all to authenticated
  using (public.has_perm('system', 'customize')) with check (public.has_perm('system', 'customize'));

-- Los procesos existentes pasan a tener un paso con su aprobador actual.
insert into public.approval_steps (process_id, step_order, name, approver_type, approver_id)
select id, 1, case approver_type when 'user' then 'Aprobación' else 'Jefe directo' end, approver_type, approver_id
from public.approval_processes;
alter table public.approval_processes drop column approver_type, drop column approver_id;

alter table public.approval_requests
  add column current_step int,
  add column current_step_name text;
update public.approval_requests set current_step = 1, current_step_name = 'Jefe directo' where status = 'pending';

-- Historial de cada paso de una solicitud.
create table public.approval_request_steps (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.approval_requests (id) on delete cascade,
  step_order int not null,
  step_name text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'skipped', 'recalled')),
  approver_id uuid references public.profiles (id) on delete set null,
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  comment text,
  created_at timestamptz not null default now()
);
create index approval_request_steps_request_idx on public.approval_request_steps (request_id, step_order);
alter table public.approval_request_steps enable row level security;
create policy "pasos de solicitudes: ver" on public.approval_request_steps for select to authenticated
  using (exists (select 1 from public.approval_requests r where r.id = request_id));

-- Historial de las solicitudes que ya existían.
insert into public.approval_request_steps (request_id, step_order, step_name, status, approver_id, decided_by, decided_at, comment, created_at)
select id, 1, 'Jefe directo', status, approver_id, decided_by, decided_at, decision_comment, submitted_at
from public.approval_requests;

-- ---------------------------------------------------------------------------
-- Avance de una solicitud: busca el siguiente paso que aplica (registrando los
-- omitidos), resuelve su aprobador y lo notifica. Devuelve false si no quedan pasos.
-- ---------------------------------------------------------------------------
create or replace function public.advance_approval(p_request uuid, p_previous_approver uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.approval_requests%rowtype;
  s public.approval_steps%rowtype;
  v_row jsonb;
  v_owner uuid;
  v_approver uuid;
begin
  select * into r from public.approval_requests where id = p_request;
  execute format('select to_jsonb(t) from public.%I t where id = $1', r.object) into v_row using r.record_id;
  v_owner := nullif(v_row ->> 'owner_id', '')::uuid;

  for s in
    select * from public.approval_steps
    where process_id = r.process_id and step_order > coalesce(r.current_step, 0)
    order by step_order
  loop
    if not public.conditions_match(v_row, s.conditions) then
      insert into public.approval_request_steps (request_id, step_order, step_name, status)
      values (r.id, s.step_order, s.name, 'skipped');
      continue;
    end if;

    v_approver := case s.approver_type
      when 'user' then s.approver_id
      when 'previous_manager' then (select manager_id from public.profiles where id = p_previous_approver)
      else coalesce((select manager_id from public.profiles where id = v_owner),
                    (select manager_id from public.profiles where id = r.submitted_by))
    end;
    if v_approver is null or not exists (select 1 from public.profiles where id = v_approver and is_active) then
      raise exception 'El paso «%» no tiene un aprobador activo: revisa el jefe directo o el aprobador del proceso', s.name;
    end if;

    update public.approval_requests
      set current_step = s.step_order, current_step_name = s.name, approver_id = v_approver
      where id = r.id;
    insert into public.approval_request_steps (request_id, step_order, step_name, approver_id)
    values (r.id, s.step_order, s.name, v_approver);
    insert into public.notifications (user_id, title, body, link, created_by)
    values (v_approver, left('Aprobación pendiente: ' || r.process_name || ' · ' || s.name, 200),
            left(coalesce(r.record_name, '') || coalesce(' · ' || r.submit_comment, ''), 1000),
            public.record_path(r.object) || '/' || r.record_id, auth.uid());
    return true;
  end loop;
  return false;
end;
$$;
revoke execute on function public.advance_approval(uuid, uuid) from public, anon, authenticated;

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

  -- Las actualizaciones al enviar se aplican antes de crear la solicitud (después el
  -- registro queda bloqueado); si algo falla, la transacción completa se revierte.
  perform public.apply_field_updates(pr.object, p_record, pr.submit_updates);
  execute format('select to_jsonb(t) from public.%I t where id = $1', pr.object) into v_row using p_record;

  insert into public.approval_requests (process_id, process_name, object, record_id, record_name, lock_record,
                                        submitted_by, submit_comment)
  values (pr.id, pr.name, pr.object, p_record, left(public.record_label(v_row), 300), pr.lock_record,
          auth.uid(), nullif(trim(p_comment), ''))
  returning id into v_id;

  if not public.advance_approval(v_id, auth.uid()) then
    raise exception 'Ningún paso del proceso aplica a este registro';
  end if;
  return v_id;
end;
$$;

create or replace function public.decide_approval(p_request uuid, p_approve boolean, p_comment text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.approval_requests%rowtype;
  v_updates jsonb;
  v_final boolean := true;
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

  update public.approval_request_steps
    set status = case when p_approve then 'approved' else 'rejected' end,
        decided_by = auth.uid(), decided_at = now(), comment = nullif(trim(p_comment), '')
    where request_id = r.id and step_order = r.current_step and status = 'pending';

  if p_approve then
    v_final := not public.advance_approval(r.id, r.approver_id);
  end if;
  if not v_final then
    return;
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
  update public.approval_request_steps set status = 'recalled', decided_by = auth.uid(), decided_at = now()
    where request_id = r.id and status = 'pending';
  select reject_updates into v_updates from public.approval_processes where id = r.process_id;
  perform public.apply_field_updates(r.object, r.record_id, v_updates);
  if r.approver_id is not null and r.approver_id <> auth.uid() then
    insert into public.notifications (user_id, title, body, link, created_by)
    values (r.approver_id, left('Solicitud retirada: ' || r.process_name, 200), r.record_name,
            public.record_path(r.object) || '/' || r.record_id, auth.uid());
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pedidos en las automatizaciones programadas
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
                      when 'orders' then nullif(p_row ->> 'account_id', '')::uuid
                      when 'cases' then nullif(p_row ->> 'account_id', '')::uuid end,
                    case p_rule.object when 'contacts' then v_id end,
                    case p_rule.object when 'opportunities' then v_id
                      when 'quotes' then nullif(p_row ->> 'opportunity_id', '')::uuid
                      when 'orders' then nullif(p_row ->> 'opportunity_id', '')::uuid end,
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
      and object in ('accounts', 'contacts', 'opportunities', 'leads', 'quotes', 'cases', 'campaigns', 'orders')
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
