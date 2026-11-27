-- Pronóstico con lo real de SAP, primera fase (definición de Luis, 2026-11-27).
--
-- El pronóstico de un periodo es la suma de tres capas, cada una en la fecha en que se convierte en factura:
--   1. Facturado: las ventas netas de SAP (sap_sales), en su fecha de factura. Es resultado, no estimación.
--   2. Pedidos y entregas abiertos: lo que falta por facturar de los pedidos de venta abiertos (fecha plan de despacho
--      + 4 días) y las entregas sin facturar (fecha de la entrega + 4 días). Los 4 días son una regla general, mientras
--      se define una por ciudad de despacho.
--   3. Oportunidades abiertas del CRM, en el mes de entrega y facturación de sus cotizaciones (opportunity_schedule).
-- Lo que ya debía haberse facturado (fecha vencida) se cuenta hoy: sigue pendiente, no desaparece con el mes.
-- Las oportunidades ganadas no suman aquí: su venta ya está en SAP como pedido, entrega o factura.
--
-- Límite de esta fase: los pedidos y entregas abiertos salen de la copia de SAP por cliente (sap_partners), que el
-- agente solo trae para las cuentas del CRM con Código SAP. La facturación sí está completa.

create function public.sap_dispatch_lag_days()
returns int
language sql
immutable
set search_path = ''
as $$ select 4 $$;
revoke execute on function public.sap_dispatch_lag_days() from public, anon;
grant execute on function public.sap_dispatch_lag_days() to authenticated;

-- Lo que falta por facturar según la copia de SAP: una fila por línea de pedido abierta y por entrega sin facturar.
create function public.sap_backlog_lines()
returns table (kind text, card_code text, doc_num text, forecast_date date, amount numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with t as (select (now() at time zone 'America/Bogota')::date as today)
  select 'order', p.card_code, o ->> 'DocNum',
         greatest(coalesce(nullif(l ->> 'ShipDate', '')::date, nullif(o ->> 'NextShipDate', '')::date, nullif(o ->> 'DocDueDate', '')::date, t.today)
                  + public.sap_dispatch_lag_days(), t.today),
         -- Parte de la línea que aún no se ha despachado, sin IVA.
         round(coalesce(nullif(l ->> 'LineTotal', '')::numeric, 0)
               * greatest(coalesce(nullif(l ->> 'Quantity', '')::numeric, 0) - coalesce(nullif(l ->> 'Invoiced', '')::numeric, 0), 0)
               / nullif(coalesce(nullif(l ->> 'Quantity', '')::numeric, 0), 0), 2)
  from public.sap_partners p
  cross join t
  cross join lateral jsonb_array_elements(case when jsonb_typeof(p.data -> 'orders') = 'array' then p.data -> 'orders' else '[]'::jsonb end) o
  cross join lateral jsonb_array_elements(case when jsonb_typeof(o -> 'Lines') = 'array' then o -> 'Lines' else '[]'::jsonb end) l
  where coalesce(o ->> 'Cancelled', 'tNO') <> 'tYES' and coalesce(l ->> 'Open', 'true') = 'true'
  union all
  select 'delivery', p.card_code, d ->> 'DocNum',
         greatest(coalesce(nullif(d ->> 'DocDate', '')::date, t.today) + public.sap_dispatch_lag_days(), t.today),
         round(coalesce(nullif(d ->> 'DocTotal', '')::numeric, 0) - coalesce(nullif(d ->> 'VatSum', '')::numeric, 0), 2)
  from public.sap_partners p
  cross join t
  cross join lateral jsonb_array_elements(case when jsonb_typeof(p.data -> 'deliveries') = 'array' then p.data -> 'deliveries' else '[]'::jsonb end) d
  where coalesce(d ->> 'Cancelled', 'tNO') <> 'tYES';
$$;
revoke execute on function public.sap_backlog_lines() from public, anon, authenticated;

-- Las tres capas por día del periodo. Sin p_user: la compañía (solo para quien ve todas las ventas). Con p_user: lo
-- de esa persona (su facturación por vendedor de SAP, los pedidos de sus cuentas y su parte de las oportunidades).
create function public.forecast_real_days(p_period_type text, p_period_start date, p_user uuid default null)
returns table (day date, invoiced numeric, orders numeric, deliveries numeric, opportunities numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_end date := public.goal_period_end(p_period_type, p_period_start);
  v_today date := (now() at time zone 'America/Bogota')::date;
begin
  if p_user is null and not public.sap_sales_sees_all() then
    return;
  end if;
  if p_user is not null and not public.can_see_goal(p_user) then
    return;
  end if;
  return query
  select x.d, sum(x.i), sum(x.o), sum(x.e), sum(x.p)
  from (
    select s.sale_date as d, s.amount as i, 0::numeric as o, 0::numeric as e, 0::numeric as p
    from public.sap_sales s
    where s.sale_date between p_period_start and v_end
      and (p_user is null or s.seller in (select z.seller from public.sap_sellers z where z.user_id = p_user))
    union all
    select b.forecast_date, 0, case when b.kind = 'order' then b.amount else 0 end, case when b.kind = 'delivery' then b.amount else 0 end, 0
    from public.sap_backlog_lines() b
    where b.forecast_date between p_period_start and v_end and b.amount > 0
      and (p_user is null or exists (select 1 from public.accounts a where a.sap_card_code = b.card_code and a.owner_id = p_user))
    union all
    select greatest(sc.forecast_date, v_today), 0, 0, 0, op.amount * sc.share * coalesce(c.percent, 100) / 100
    from public.opportunities op
    join public.opportunity_schedule() sc on sc.opportunity_id = op.id
    left join public.opportunity_credit c on c.opportunity_id = op.id and c.user_id = p_user
    where not op.is_closed and greatest(sc.forecast_date, v_today) between p_period_start and v_end
      and (p_user is null or c.user_id is not null)
  ) x
  group by x.d
  order by x.d;
end;
$$;
revoke execute on function public.forecast_real_days(text, date, uuid) from public, anon;
grant execute on function public.forecast_real_days(text, date, uuid) to authenticated;
