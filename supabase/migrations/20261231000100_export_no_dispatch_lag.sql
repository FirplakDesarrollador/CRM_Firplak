-- Pronóstico real: lo del mercado internacional (zona Exterior) no suma días de despacho (condición de Luis, 2026-11-27).
--
-- Lo de exportación se factura dentro del mismo mes de su fecha de despacho: la fecha del pedido o de la entrega es la
-- del pronóstico, sin los 4 días del mercado nacional. Lo vencido se sigue contando hoy.
--
-- Un cliente es de Exterior si su código de SAP es de cliente del exterior (empieza por «CE») o si su venta más
-- reciente en SAP tiene zona EXTERIOR. Así cubre también a un cliente nuevo que todavía no tiene facturas.

create function public.sap_is_export(p_card_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select upper(coalesce(p_card_code, '')) like 'CE%'
      or coalesce((select upper(trim(s.zone)) = 'EXTERIOR' from public.sap_sales s
                   where s.card_code = p_card_code order by s.sale_date desc limit 1), false);
$$;
revoke execute on function public.sap_is_export(text) from public, anon, authenticated;

create or replace function public.sap_backlog_lines()
returns table (kind text, card_code text, doc_num text, forecast_date date, amount numeric, seller text)
language sql
stable
security definer
set search_path = ''
as $$
  with t as (select (now() at time zone 'America/Bogota')::date as today),
  -- Una sola consulta por cliente, no por línea.
  ext as (select c.card_code, public.sap_is_export(c.card_code) as export
          from (select distinct b.card_code from public.sap_backlog b
                where b.batch = (select s.batch from public.sap_backlog_state s where s.id)) c)
  select b.kind, b.card_code, b.doc_num,
         greatest(coalesce(b.base_date, t.today) + case when e.export then 0 else public.sap_dispatch_lag_days() end, t.today),
         b.amount, b.seller
  from public.sap_backlog b
  join ext e on e.card_code = b.card_code
  cross join t
  where b.batch = (select s.batch from public.sap_backlog_state s where s.id);
$$;
revoke execute on function public.sap_backlog_lines() from public, anon, authenticated;
