-- Pronóstico real: las facturas del día, directo de SAP (decisión de Luis, 2026-11-27).
--
-- «Facturado» sale del archivo mensual de ventas netas (sap_sales), que va hasta el día anterior. «Pedidos y entregas
-- abiertos» viene en vivo de SAP. Lo que se factura hoy sale de los abiertos pero no entra a «Facturado» hasta que se
-- regenera el archivo: el pronóstico bajaba cada vez que se facturaba algo.
-- Ahora el agente trae, en el mismo lote que los abiertos, las facturas y notas crédito de SAP posteriores a la última
-- fecha del archivo de ventas. El pronóstico las suma a «Facturado» solo mientras el archivo no cubra esa fecha.
-- Metas e Indicadores no cambian: siguen con el archivo de ventas netas.

alter table public.sap_backlog drop constraint sap_backlog_kind_check;
alter table public.sap_backlog add constraint sap_backlog_kind_check check (kind in ('order', 'delivery', 'invoice', 'credit'));
comment on table public.sap_backlog is
  'Lote vigente traído de SAP por el agente: líneas de pedido abiertas y entregas sin facturar de toda la compañía, y las facturas y notas crédito posteriores al archivo de ventas (kind invoice/credit, valor en positivo).';

-- Última fecha con ventas cargadas: desde ahí pide el agente las facturas a SAP.
create function public.sap_agent_sales_last_date()
returns date
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_sap_agent() then raise exception 'Solo el agente de SAP' using errcode = '42501'; end if;
  return (select max(s.sale_date) from public.sap_sales s);
end;
$$;
revoke execute on function public.sap_agent_sales_last_date() from public, anon;
grant execute on function public.sap_agent_sales_last_date() to authenticated;

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
  where r ->> 0 in ('order', 'delivery', 'invoice', 'credit') and coalesce(r ->> 4, '') <> '' and (r ->> 8)::numeric > 0
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

-- Solo pedidos y entregas: las facturas del lote no son pendiente por facturar.
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
                where b.kind in ('order', 'delivery')
                  and b.batch = (select s.batch from public.sap_backlog_state s where s.id)) c),
  l as (select b.*, t.today,
               -- Sin días: Exterior, y los pedidos «Sin POD» (se facturan al despachar).
               coalesce(b.base_date, t.today)
                 + case when e.export or (b.kind = 'order' and lower(regexp_replace(coalesce(b.billing_type, ''), '\s', '', 'g')) = 'sinpod')
                        then 0 else public.sap_dispatch_lag_days() end as due
        from public.sap_backlog b
        join ext e on e.card_code = b.card_code
        cross join t
        where b.kind in ('order', 'delivery')
          and b.batch = (select s.batch from public.sap_backlog_state s where s.id))
  select l.kind, l.card_code, l.doc_num, greatest(l.due, l.today), l.amount, l.seller,
         greatest(l.today - l.due, 0), l.customer_name, l.base_date
  from l;
$$;
revoke execute on function public.sap_backlog_lines() from public, anon, authenticated;

create or replace function public.forecast_real_days(p_period_type text, p_period_start date, p_user uuid default null)
returns table (day date, invoiced numeric, orders numeric, deliveries numeric, opportunities numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_end date := public.goal_period_end(p_period_type, p_period_start);
  v_today date := (now() at time zone 'America/Bogota')::date;
  -- Hasta qué día llega el archivo de ventas: lo posterior se toma de las facturas de SAP.
  v_sales_until date := coalesce((select max(s.sale_date) from public.sap_sales s), '-infinity'::date);
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
    select f.base_date, case when f.kind = 'credit' then -f.amount else f.amount end, 0, 0, 0
    from public.sap_backlog f
    where f.kind in ('invoice', 'credit')
      and f.batch = (select st.batch from public.sap_backlog_state st where st.id)
      and f.base_date > v_sales_until and f.base_date between p_period_start and v_end
      and (p_user is null or f.seller in (select z.seller from public.sap_sellers z where z.user_id = p_user))
    union all
    select b.forecast_date, 0, case when b.kind = 'order' then b.amount else 0 end, case when b.kind = 'delivery' then b.amount else 0 end, 0
    from public.sap_backlog_lines() b
    where b.forecast_date between p_period_start and v_end and b.amount > 0
      -- Lo vencido hace más de 30 días no suma: va en «Atrasado por revisar».
      and b.overdue_days <= public.sap_stale_days()
      and (p_user is null or public.sap_backlog_is_of(p_user, b.seller, b.card_code))
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
