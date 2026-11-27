-- Pronóstico real: lo vencido hace más de 30 días sale del pronóstico y se muestra aparte (decisión de Luis, 2026-11-27).
--
-- Lo que ya debía haberse facturado se cuenta hoy. Pero en SAP quedan pedidos y entregas abiertos con meses de atraso
-- (saldos pequeños, documentos sin cerrar) que inflan el mes en curso sin que vayan a facturarse. Regla:
--   · Hasta 30 días de atraso: es pendiente real, cuenta hoy.
--   · Más de 30 días: no suma al pronóstico. Se lista en «Atrasado por revisar» para cerrarlo o facturarlo en SAP.
-- El atraso se mide contra la fecha en que debía facturarse (despacho o entrega + días de despacho; Exterior, sin días).

create function public.sap_stale_days()
returns int
language sql
immutable
set search_path = ''
as $$ select 30 $$;
revoke execute on function public.sap_stale_days() from public, anon;
grant execute on function public.sap_stale_days() to authenticated;

drop function public.sap_backlog_lines();
create function public.sap_backlog_lines()
returns table (kind text, card_code text, doc_num text, forecast_date date, amount numeric, seller text,
               overdue_days int, customer_name text, base_date date)
language sql
stable
security definer
set search_path = ''
as $$
  with t as (select (now() at time zone 'America/Bogota')::date as today),
  -- Una sola consulta por cliente, no por línea.
  ext as (select c.card_code, public.sap_is_export(c.card_code) as export
          from (select distinct b.card_code from public.sap_backlog b
                where b.batch = (select s.batch from public.sap_backlog_state s where s.id)) c),
  l as (select b.*, t.today,
               coalesce(b.base_date, t.today) + case when e.export then 0 else public.sap_dispatch_lag_days() end as due
        from public.sap_backlog b
        join ext e on e.card_code = b.card_code
        cross join t
        where b.batch = (select s.batch from public.sap_backlog_state s where s.id))
  select l.kind, l.card_code, l.doc_num, greatest(l.due, l.today), l.amount, l.seller,
         greatest(l.today - l.due, 0), l.customer_name, l.base_date
  from l;
$$;
revoke execute on function public.sap_backlog_lines() from public, anon, authenticated;

-- ¿La línea es de la persona? Su vendedor de SAP o, si ese vendedor no está relacionado con nadie, el propietario de la cuenta.
create function public.sap_backlog_is_of(p_user uuid, p_seller text, p_card_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_seller in (select z.seller from public.sap_sellers z where z.user_id = p_user)
      or (not exists (select 1 from public.sap_sellers z where z.seller = p_seller and z.user_id is not null)
          and exists (select 1 from public.accounts a where a.sap_card_code = p_card_code and a.owner_id = p_user));
$$;
revoke execute on function public.sap_backlog_is_of(uuid, text, text) from public, anon, authenticated;

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

-- «Atrasado por revisar»: pedidos y entregas vencidos hace más de 30 días, por documento. Misma visibilidad que el
-- pronóstico real: sin p_user, la compañía (solo quien ve todas las ventas); con p_user, lo de esa persona.
create function public.forecast_stale_backlog(p_user uuid default null)
returns table (kind text, doc_num text, customer_name text, seller text, amount numeric, overdue_days int, due_date date)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_user is null and not public.sap_sales_sees_all() then
    return;
  end if;
  if p_user is not null and not public.can_see_goal(p_user) then
    return;
  end if;
  return query
  select b.kind, b.doc_num, max(b.customer_name), max(b.seller), sum(b.amount), max(b.overdue_days), min(b.base_date)
  from public.sap_backlog_lines() b
  where b.amount > 0 and b.overdue_days > public.sap_stale_days()
    and (p_user is null or public.sap_backlog_is_of(p_user, b.seller, b.card_code))
  group by b.kind, b.doc_num
  order by sum(b.amount) desc, b.doc_num;
end;
$$;
revoke execute on function public.forecast_stale_backlog(uuid) from public, anon;
grant execute on function public.forecast_stale_backlog(uuid) to authenticated;
