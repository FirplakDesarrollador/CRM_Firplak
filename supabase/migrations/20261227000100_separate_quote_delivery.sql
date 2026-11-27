-- Separar una entrega de una cotización partida (decisiones de Luis, 2026-11-27).
--
-- Caso: la cotización está partida en entregas y el cliente aprueba solo la primera. El asesor pulsa «El cliente
-- aceptó esta entrega» y el CRM pasa las líneas de esa entrega a una cotización propia (mismos datos, precios y
-- descuentos; enlazada a la original) y la marca Aceptada. La original sigue abierta con lo que falta. De ahí en
-- adelante aplica lo de siempre: la parte aceptada se vuelve oportunidad ganada y de ella sale el pedido.
--   · La parte separada HEREDA la aprobación de descuento de la original (mismos precios y descuentos; solo cambia
--     la cantidad). Si la original necesitaba aprobación y no la tenía, la parte tampoco se puede aceptar.
--   · Opción secundaria: separar sin aceptar; la nueva queda en el mismo estado de la original.

alter table public.quotes
  add column split_from_id uuid,
  add constraint quotes_split_from_id_fkey foreign key (split_from_id) references public.quotes (id) on delete set null;
create index quotes_split_from_idx on public.quotes (split_from_id) where split_from_id is not null;
comment on column public.quotes.split_from_id is 'Cotización de la que se separó esta entrega (entregas parciales).';

create function public.separate_quote_delivery(p_quote uuid, p_date date, p_accept boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.quotes%rowtype;
  v_id uuid;
  v_rest int;
  v_dates int;
  v_next date;
begin
  select * into q from public.quotes where id = p_quote for update;
  -- Corre con privilegios para poder copiar la aprobación: exige lo mismo que editar y crear una cotización.
  if not found or not public.can_edit_record('quotes', q.owner_id) or not public.has_perm('quotes', 'create') then
    raise exception 'Cotización no encontrada o sin permiso para editarla' using errcode = '42501';
  end if;
  if q.status not in ('Borrador', 'Aprobada', 'Presentada') then
    raise exception 'Solo se separan entregas de cotizaciones en Borrador, Aprobada o Presentada (esta está «%»).', q.status using errcode = '23514';
  end if;
  if public.is_record_locked('quotes', q.id) then
    raise exception 'La cotización está en aprobación: espera la decisión antes de separar una entrega.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.quote_line_items where quote_id = p_quote and delivery_date = p_date) then
    raise exception 'La cotización no tiene una entrega con esa fecha.' using errcode = '23514';
  end if;
  select count(*) into v_rest from public.quote_line_items where quote_id = p_quote and delivery_date is distinct from p_date;
  if v_rest = 0 then
    raise exception 'Es la única entrega de la cotización: no hay nada que separar. Marca la cotización completa como Aceptada.' using errcode = '23514';
  end if;

  -- Mover líneas cambia los totales de las dos cotizaciones: no es un cambio de precios ni de descuento, así que no
  -- debe pedir aprobación de nuevo ni invalidar la que ya había.
  perform set_config('firplak.approval_engine', 'on', true);

  insert into public.quotes (name, opportunity_id, account_id, contact_id, price_book_id, status, validity_days, tax_rate, shipping,
                             shipping_manual, shipping_address, payment_terms_manual, payment_terms, delivery_terms, incoterm,
                             description, owner_id, project_segment, sale_type, end_customer_name, end_customer_tax_id,
                             delivery_city, custom_fields, delivery_date, split_from_id, approval_basis_at, created_at)
  values (q.name || ' · ' || to_char(p_date, 'DD/MM/YYYY'), q.opportunity_id, q.account_id, q.contact_id, q.price_book_id, q.status,
          q.validity_days, q.tax_rate, 0,
          q.shipping_manual, q.shipping_address, q.payment_terms_manual, q.payment_terms, q.delivery_terms, q.incoterm,
          q.description, q.owner_id, q.project_segment, q.sale_type, q.end_customer_name, q.end_customer_tax_id,
          q.delivery_city, q.custom_fields, p_date, q.id, q.approval_basis_at,
          -- La misma fecha de la original: conserva su «Válida hasta».
          q.created_at)
  returning id into v_id;

  update public.quote_line_items set quote_id = v_id, delivery_date = null where quote_id = p_quote and delivery_date = p_date;
  perform public.recalc_quote(p_quote);
  perform public.recalc_quote(v_id);

  -- La original queda con lo que falta: su entrega estimada pasa a la siguiente y, si ya es una sola, deja de estar partida.
  select count(distinct delivery_date), min(delivery_date) into v_dates, v_next
    from public.quote_line_items where quote_id = p_quote and delivery_date is not null;
  if v_next is not null then
    update public.quotes set delivery_date = v_next where id = p_quote and delivery_date is distinct from v_next;
  end if;
  if v_dates = 1 and not exists (select 1 from public.quote_line_items where quote_id = p_quote and delivery_date is null) then
    update public.quote_line_items set delivery_date = null where quote_id = p_quote;
  end if;

  -- Hereda las aprobaciones vigentes de la original.
  insert into public.approval_requests (process_id, process_name, object, record_id, record_name, status, lock_record,
                                        submitted_by, submitted_at, submit_comment, approver_id, decided_by, decided_at, decision_comment)
  select r.process_id, r.process_name, r.object, v_id, q.name || ' · ' || to_char(p_date, 'DD/MM/YYYY'), r.status, false,
         r.submitted_by, r.submitted_at, r.submit_comment, r.approver_id, r.decided_by, r.decided_at,
         concat_ws(' · ', nullif(r.decision_comment, ''), 'Heredada de ' || q.quote_number || ' al separar la entrega')
  from public.approval_requests r
  where r.object = 'quotes' and r.record_id = p_quote and r.status = 'approved'
    and r.decided_at >= coalesce(q.approval_basis_at, '-infinity'::timestamptz);

  -- Aceptar sí pasa por todas las reglas: aprobación (la heredada), vigencia, segmento y ciudad.
  perform set_config('firplak.approval_engine', 'off', true);
  if p_accept then
    update public.quotes set status = 'Aceptada' where id = v_id;
  end if;
  return v_id;
end;
$$;
revoke execute on function public.separate_quote_delivery(uuid, date, boolean) from public, anon;
grant execute on function public.separate_quote_delivery(uuid, date, boolean) to authenticated;
