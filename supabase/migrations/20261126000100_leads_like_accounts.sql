-- Firplak CRM · Prospectos alineados con las cuentas.
--   · Los prospectos tienen Mercado y Segmento, y usan las MISMAS listas de Cuentas para Mercado, Canal y
--     Segmento (con sus dependencias): al convertir, la cuenta recibe valores válidos de su lista.
--   · Convertir un prospecto crea la cuenta como «Prospecto» (antes «Cliente», sin NIT), con su Mercado,
--     Canal y Segmento.
--   · La regla «Cliente requiere NIT» no aplica a clientes del mercado Internacional.
--   · Al fusionar duplicados, Mercado, Canal y Segmento se conservan juntos.

alter table public.leads add column market text, add column segment text;

-- Dependencias: los prospectos aplican las de Cuentas entre Mercado, Canal y Segmento.
create or replace function public.enforce_picklist_dependencies()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.picklist_dependencies%rowtype;
  v_new jsonb := to_jsonb(new);
  v_old jsonb;
  v_value text;
  v_control text;
  v_shared constant text[] := array['market', 'industry', 'segment'];
begin
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
  end if;
  for d in
    select * from public.picklist_dependencies pd
    where pd.object = tg_table_name
       or (tg_table_name = 'leads' and pd.object = 'accounts' and pd.field = any (v_shared) and pd.controlling_field = any (v_shared))
    order by pd.controlling_field
  loop
    v_value := public.record_field_text(v_new, d.field);
    v_control := public.record_field_text(v_new, d.controlling_field);
    -- Sin cambios en ninguno de los dos campos: se respeta lo que ya había.
    continue when tg_op = 'UPDATE'
      and v_value is not distinct from public.record_field_text(v_old, d.field)
      and v_control is not distinct from public.record_field_text(v_old, d.controlling_field);
    continue when v_value is null;
    if v_control is null then
      raise exception 'Elige primero el valor del que depende «%».', v_value using errcode = '23514';
    end if;
    if not exists (
      select 1 from public.picklist_values pv
      where pv.object = d.object and pv.field = d.field and pv.value = v_value
        and coalesce(pv.controlling_map -> d.controlling_field, '[]'::jsonb) ? v_control
    ) then
      raise exception '«%» no corresponde a «%».', v_value, v_control using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;

create or replace function public.convert_lead(
  p_lead uuid,
  p_account_id uuid default null,
  p_account_name text default null,
  p_create_opportunity boolean default true,
  p_opportunity_name text default null,
  p_stage_id uuid default null,
  p_amount numeric default 0,
  p_close_date date default null,
  p_owner uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lead public.leads%rowtype;
  v_account uuid := p_account_id;
  v_contact uuid;
  v_opp uuid;
  v_stage uuid := p_stage_id;
  v_owner uuid;
begin
  select * into v_lead from public.leads where id = p_lead for update;
  if not found then
    raise exception 'El prospecto no existe o no tienes acceso';
  end if;
  if v_lead.is_converted then
    raise exception 'El prospecto ya fue convertido';
  end if;
  v_owner := coalesce(p_owner, v_lead.owner_id, auth.uid());

  if v_account is null then
    -- La cuenta nueva nace como Prospecto: pasa a Cliente cuando compra (y ahí se le exige el NIT).
    insert into public.accounts (name, account_type, market, industry, segment, phone, website, billing_street, billing_city,
                                 billing_state, billing_country, annual_revenue, employees, rating, description, owner_id)
    values (coalesce(nullif(trim(p_account_name), ''), v_lead.company), 'Prospecto', v_lead.market, v_lead.industry,
            v_lead.segment, v_lead.phone,
            v_lead.website, v_lead.street, v_lead.city, v_lead.state, v_lead.country, v_lead.annual_revenue,
            v_lead.employees, v_lead.rating, v_lead.description, v_owner)
    returning id into v_account;
  end if;

  insert into public.contacts (account_id, salutation, first_name, last_name, title, email, phone, mobile,
                               lead_source, mailing_street, mailing_city, mailing_state, mailing_country, owner_id)
  values (v_account, v_lead.salutation, v_lead.first_name, v_lead.last_name, v_lead.title, v_lead.email,
          v_lead.phone, v_lead.mobile, v_lead.lead_source, v_lead.street, v_lead.city, v_lead.state,
          v_lead.country, v_owner)
  returning id into v_contact;

  if p_create_opportunity then
    if v_stage is null then
      select s.id into v_stage
      from public.pipeline_stages s
      join public.pipelines p on p.id = s.pipeline_id
      where p.is_default and s.category = 'open'
      order by s.sort_order limit 1;
    end if;
    insert into public.opportunities (name, account_id, contact_id, pipeline_id, stage_id, amount, close_date,
                                      lead_source, campaign_id, opportunity_type, owner_id)
    values (coalesce(nullif(trim(p_opportunity_name), ''), v_lead.company || ' · Nueva oportunidad'), v_account,
            v_contact, (select pipeline_id from public.pipeline_stages where id = v_stage), v_stage,
            coalesce(p_amount, 0), coalesce(p_close_date, current_date + 30), v_lead.lead_source,
            v_lead.campaign_id, 'Nuevo negocio', v_owner)
    returning id into v_opp;
  end if;

  update public.leads
     set status = 'Convertido', is_converted = true, converted_at = now(),
         converted_account_id = v_account, converted_contact_id = v_contact, converted_opportunity_id = v_opp
   where id = p_lead;

  -- Las actividades y campañas del prospecto pasan al nuevo contacto.
  update public.activities
     set contact_id = v_contact, account_id = v_account, opportunity_id = coalesce(opportunity_id, v_opp)
   where lead_id = p_lead;
  update public.campaign_members cm
     set contact_id = v_contact, lead_id = null
   where cm.lead_id = p_lead
     and not exists (select 1 from public.campaign_members x where x.campaign_id = cm.campaign_id and x.contact_id = v_contact);

  return jsonb_build_object('account_id', v_account, 'contact_id', v_contact, 'opportunity_id', v_opp);
end;
$$;

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
      website = coalesce(m.website, d.website),
      -- Mercado, Canal y Segmento van juntos (Segmento depende de los otros dos): si el principal no tiene
      -- ninguno, se toman los tres del duplicado.
      market = case when coalesce(m.market, m.industry, m.segment) is null then d.market else m.market end,
      industry = case when coalesce(m.market, m.industry, m.segment) is null then d.industry else m.industry end,
      segment = case when coalesce(m.market, m.industry, m.segment) is null then d.segment else m.segment end,
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
    update public.orders set account_id = p_master where account_id = p_duplicate;
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
    update public.orders set contact_id = p_master where contact_id = p_duplicate;
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
      market = case when coalesce(m.market, m.industry, m.segment) is null then d.market else m.market end,
      industry = case when coalesce(m.market, m.industry, m.segment) is null then d.industry else m.industry end,
      segment = case when coalesce(m.market, m.industry, m.segment) is null then d.segment else m.segment end,
      city = coalesce(m.city, d.city), campaign_id = coalesce(m.campaign_id, d.campaign_id),
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

-- «Cliente requiere NIT»: los clientes del exterior no tienen NIT colombiano.
update public.validation_rules
set conditions = conditions || '[{"field":"market","op":"neq","value":"Internacional"}]'::jsonb,
    description = 'Las cuentas de tipo Cliente deben tener NIT para facturar (salvo las del mercado Internacional).'
where object = 'accounts' and name = 'Cliente requiere NIT'
  and not conditions @> '[{"field":"market"}]'::jsonb;
