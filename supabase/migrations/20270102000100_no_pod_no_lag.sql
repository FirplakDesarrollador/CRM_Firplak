-- Pronóstico real: los pedidos nacionales «Sin POD» no suman días de despacho (regla de Luis, 2026-11-27).
--
-- POD (proof of delivery) es la remisión de entrega. Un pedido con Tipo de facturación «Sin POD» se factura apenas se
-- despacha, sin esperar la remisión: su fecha de facturación es la fecha plan de despacho, sin los 4 días.
-- «POD Parcial» y «POD Total» siguen con los 4 días. Si la fecha ya pasó, sigue contando hoy (y, con más de 30 días de
-- atraso, va en «Atrasado por revisar»), como todo lo vencido. Las entregas sin facturar no cambian.
-- El dato es el campo de usuario U_TipoFacturacion de la cabecera del pedido de venta en SAP.

alter table public.sap_backlog add column billing_type text;
comment on column public.sap_backlog.billing_type is
  'Tipo de facturación del pedido en SAP (U_TipoFacturacion): «Sin POD», «POD Parcial» o «POD Total». «Sin POD» se factura al despachar.';

-- Filas: [tipo, DocEntry, línea, DocNum, CardCode, cliente, vendedor, fecha, valor, tipo de facturación].
create or replace function public.sap_agent_backlog_load(p_batch uuid, p_rows jsonb, p_last boolean)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
begin
  if not public.is_sap_agent() then raise exception 'Solo el agente de SAP' using errcode = '42501'; end if;
  if p_batch is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then
    raise exception 'Lote no válido' using errcode = '22023';
  end if;
  insert into public.sap_backlog (batch, kind, doc_entry, line_num, doc_num, card_code, customer_name, seller, base_date, amount, billing_type)
  select p_batch, r ->> 0, (r ->> 1)::bigint, coalesce((r ->> 2)::int, 0), nullif(r ->> 3, ''),
         upper(regexp_replace(r ->> 4, '\s', '', 'g')), nullif(r ->> 5, ''), nullif(trim(r ->> 6), ''),
         nullif(r ->> 7, '')::date, round((r ->> 8)::numeric, 2), nullif(trim(r ->> 9), '')
  from jsonb_array_elements(p_rows) r
  where r ->> 0 in ('order', 'delivery') and coalesce(r ->> 4, '') <> '' and (r ->> 8)::numeric > 0
  on conflict (batch, kind, doc_entry, line_num) do update set
    doc_num = excluded.doc_num, card_code = excluded.card_code, customer_name = excluded.customer_name,
    seller = excluded.seller, base_date = excluded.base_date, amount = excluded.amount, billing_type = excluded.billing_type;
  get diagnostics v_n = row_count;
  if p_last then
    update public.sap_backlog_state set batch = p_batch, loaded_at = now(),
      row_count = (select count(*) from public.sap_backlog b where b.batch = p_batch)
    where id;
    delete from public.sap_backlog b where b.batch <> p_batch;
    insert into public.sap_sellers (seller, user_id)
    select s.seller, public.sap_match_seller(s.seller)
    from (select distinct b.seller from public.sap_backlog b where b.batch = p_batch and b.seller is not null) s
    on conflict (seller) do nothing;
  end if;
  return v_n;
end;
$$;
revoke execute on function public.sap_agent_backlog_load(uuid, jsonb, boolean) from public, anon;
grant execute on function public.sap_agent_backlog_load(uuid, jsonb, boolean) to authenticated;

create or replace function public.sap_backlog_lines()
returns table (kind text, card_code text, doc_num text, forecast_date date, amount numeric, seller text,
               overdue_days int, customer_name text, base_date date)
language sql
stable
security definer
set search_path = ''
as $$
  with t as (select (now() at time zone 'America/Bogota')::date as today),
  ext as (select c.card_code, public.sap_is_export(c.card_code) as export
          from (select distinct b.card_code from public.sap_backlog b
                where b.batch = (select s.batch from public.sap_backlog_state s where s.id)) c),
  l as (select b.*, t.today,
               -- Sin días: Exterior, y los pedidos «Sin POD» (se facturan al despachar).
               coalesce(b.base_date, t.today)
                 + case when e.export or (b.kind = 'order' and lower(regexp_replace(coalesce(b.billing_type, ''), '\s', '', 'g')) = 'sinpod')
                        then 0 else public.sap_dispatch_lag_days() end as due
        from public.sap_backlog b
        join ext e on e.card_code = b.card_code
        cross join t
        where b.batch = (select s.batch from public.sap_backlog_state s where s.id))
  select l.kind, l.card_code, l.doc_num, greatest(l.due, l.today), l.amount, l.seller,
         greatest(l.today - l.due, 0), l.customer_name, l.base_date
  from l;
$$;
revoke execute on function public.sap_backlog_lines() from public, anon, authenticated;
