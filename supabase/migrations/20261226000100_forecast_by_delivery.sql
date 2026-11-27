-- Pronóstico por mes de entrega y facturación (decisión de Luis, 2026-11-27).
--
-- Hasta ahora cada negocio caía completo en el mes de su fecha de cierre. Una cotización de 100 unidades con 50 para
-- diciembre y 50 para enero inflaba diciembre. Ahora:
--   · La cotización tiene una «Entrega estimada» y cada línea puede tener la suya (si no, usa la de la cotización).
--   · El pronóstico reparte el valor de la oportunidad entre los meses de esas entregas, en proporción al valor de
--     cada línea. En una oportunidad abierta cuentan sus cotizaciones abiertas; en una ganada, las aceptadas.
--   · Si la cuenta tiene «Cierre de facturación» y la entrega cae ese día o después, se factura el mes siguiente:
--     ese es el mes del pronóstico.
--   · Sin cotizaciones con fecha, el negocio sigue cayendo en su fecha de cierre.
-- Metas e Indicadores no cambian: siguen por fecha de cierre (y por ventas reales de SAP donde aplica).

alter table public.quotes add column delivery_date date;
alter table public.quote_line_items add column delivery_date date;
comment on column public.quotes.delivery_date is 'Entrega estimada de la cotización: ubica el negocio en el pronóstico. Cada línea puede tener otra.';
comment on column public.quote_line_items.delivery_date is 'Entrega estimada de esta línea (entregas por partes). Vacía: la de la cotización.';

-- Fecha en que se factura una entrega: la misma, o el primer día del mes siguiente si cae en el cierre de
-- facturación del cliente o después.
create function public.billing_date(p_delivery date, p_cutoff_day int)
returns date
language sql
immutable
set search_path = ''
as $$
  select case
    when p_delivery is null then null
    when p_cutoff_day is not null and extract(day from p_delivery) >= p_cutoff_day
      then (date_trunc('month', p_delivery) + interval '1 month')::date
    else p_delivery end;
$$;
revoke execute on function public.billing_date(date, int) from public, anon;
grant execute on function public.billing_date(date, int) to authenticated;

-- En qué fechas cae cada oportunidad para el pronóstico y con qué parte de su valor (las partes de cada oportunidad
-- suman 1). Solo para las funciones del pronóstico: no respeta la visibilidad por sí misma.
create function public.opportunity_schedule()
returns table (opportunity_id uuid, forecast_date date, share numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with lines as (
    select q.opportunity_id,
           coalesce(public.billing_date(coalesce(l.delivery_date, q.delivery_date), a.billing_cutoff_day), o.close_date) as d,
           l.line_total as total
    from public.quotes q
    join public.opportunities o on o.id = q.opportunity_id
    join public.quote_line_items l on l.quote_id = q.id
    left join public.accounts a on a.id = q.account_id
    where l.line_total > 0 and q.currency = o.currency
      and case when o.is_won then q.status = 'Aceptada'
               when o.is_closed then false
               else public.quote_is_open_part(q.status) end
  ),
  by_date as (
    select l.opportunity_id, l.d, sum(l.total) as total, sum(sum(l.total)) over (partition by l.opportunity_id) as whole
    from lines l group by l.opportunity_id, l.d
  )
  select o.id, coalesce(b.d, o.close_date), coalesce(b.total / nullif(b.whole, 0), 1)
  from public.opportunities o
  left join by_date b on b.opportunity_id = o.id;
$$;
revoke execute on function public.opportunity_schedule() from public, anon, authenticated;

create or replace function public.forecast_summary(p_period_type text, p_period_start date)
returns table (
  user_id uuid, user_name text, closed numeric, commit_amount numeric, best_case numeric, pipeline numeric,
  open_count bigint, quota numeric, adjustment numeric, adjustment_note text, can_adjust boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with bounds as (select p_period_start as s, public.goal_period_end(p_period_type, p_period_start) as e),
  people as (
    select p.id, coalesce(nullif(p.full_name, ''), p.email) as name
    from public.profiles p
    where p.is_active and public.can_see_goal(p.id)
  ),
  -- Cada negocio cae en el mes en que se entrega y factura (opportunity_schedule), repartido si tiene varias entregas.
  opps as (
    select o.id, c.user_id as owner_id, o.amount * s.share * c.percent / 100 as amount, o.is_won, o.is_closed, o.forecast_category
    from public.opportunities o
    join public.opportunity_schedule() s on s.opportunity_id = o.id
    join public.opportunity_credit c on c.opportunity_id = o.id, bounds b
    where s.forecast_date between b.s and b.e and c.user_id in (select id from people)
  )
  select pe.id, pe.name,
    coalesce(sum(o.amount) filter (where o.is_won), 0),
    coalesce(sum(o.amount) filter (where not o.is_closed and o.forecast_category = 'commit'), 0),
    coalesce(sum(o.amount) filter (where not o.is_closed and o.forecast_category = 'best_case'), 0),
    coalesce(sum(o.amount) filter (where not o.is_closed and o.forecast_category = 'pipeline'), 0),
    count(distinct o.id) filter (where not o.is_closed),
    (select g.target from public.sales_goals g
      where g.user_id = pe.id and g.metric = 'won_amount' and g.period_type = p_period_type and g.period_start = p_period_start),
    (select a.amount from public.forecast_adjustments a
      where a.user_id = pe.id and a.period_type = p_period_type and a.period_start = p_period_start),
    (select a.note from public.forecast_adjustments a
      where a.user_id = pe.id and a.period_type = p_period_type and a.period_start = p_period_start),
    public.can_manage_goal(pe.id)
  from people pe
  left join opps o on o.owner_id = pe.id
  group by pe.id, pe.name
  having count(o.*) > 0
      or exists (select 1 from public.sales_goals g where g.user_id = pe.id and g.metric = 'won_amount'
                  and g.period_type = p_period_type and g.period_start = p_period_start)
  order by pe.name;
$$;

create or replace function public.take_forecast_snapshot()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/Bogota')::date;
  v_type text;
  v_start date;
  v_end date;
  v_rows int := 0;
  v_n int;
begin
  if auth.uid() is not null and not (public.has_perm('system', 'customize') or public.has_perm('system', 'manage_users')) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  foreach v_type in array array['month', 'quarter', 'year'] loop
    v_start := date_trunc(v_type, v_today)::date;
    v_end := public.goal_period_end(v_type, v_start);
    insert into public.forecast_snapshots (taken_on, period_type, period_start, user_id, closed, commit_amount,
                                           best_case, pipeline, open_count, quota, adjustment)
    select v_today, v_type, v_start, p.id,
      coalesce(sum(o.amount * c.percent / 100) filter (where o.is_won), 0),
      coalesce(sum(o.amount * c.percent / 100) filter (where not o.is_closed and o.forecast_category = 'commit'), 0),
      coalesce(sum(o.amount * c.percent / 100) filter (where not o.is_closed and o.forecast_category = 'best_case'), 0),
      coalesce(sum(o.amount * c.percent / 100) filter (where not o.is_closed and o.forecast_category = 'pipeline'), 0),
      count(distinct o.id) filter (where not o.is_closed),
      (select g.target from public.sales_goals g
        where g.user_id = p.id and g.metric = 'won_amount' and g.period_type = v_type and g.period_start = v_start),
      (select a.amount from public.forecast_adjustments a
        where a.user_id = p.id and a.period_type = v_type and a.period_start = v_start)
    from public.profiles p
    left join public.opportunity_credit c on c.user_id = p.id
    -- Por mes de entrega y facturación, igual que forecast_summary.
    left join (select x.id, x.amount * s.share as amount, x.is_won, x.is_closed, x.forecast_category
               from public.opportunities x join public.opportunity_schedule() s on s.opportunity_id = x.id
               where s.forecast_date between v_start and v_end) o on o.id = c.opportunity_id
    where p.is_active
    group by p.id
    having count(o.*) > 0
        or exists (select 1 from public.sales_goals g where g.user_id = p.id and g.metric = 'won_amount'
                    and g.period_type = v_type and g.period_start = v_start)
    on conflict (taken_on, period_type, period_start, user_id) do update set
      taken_at = now(), closed = excluded.closed, commit_amount = excluded.commit_amount, best_case = excluded.best_case,
      pipeline = excluded.pipeline, open_count = excluded.open_count, quota = excluded.quota, adjustment = excluded.adjustment;
    get diagnostics v_n = row_count;
    v_rows := v_rows + v_n;
  end loop;

  insert into public.opportunity_snapshots (taken_on, opportunity_id, owner_id, amount, close_date, stage_id,
                                            forecast_category, is_closed, is_won)
  select v_today, o.id, o.owner_id, o.amount, o.close_date, o.stage_id, o.forecast_category, o.is_closed, o.is_won
  from public.opportunities o
  where o.close_date >= date_trunc('year', v_today)::date or not o.is_closed
  on conflict (taken_on, opportunity_id) do update set
    owner_id = excluded.owner_id, amount = excluded.amount, close_date = excluded.close_date, stage_id = excluded.stage_id,
    forecast_category = excluded.forecast_category, is_closed = excluded.is_closed, is_won = excluded.is_won;

  return v_rows;
end;
$$;

-- Detalle de una cifra del pronóstico: qué negocios la forman, con la parte que cae en el periodo y su entrega.
create function public.forecast_items(p_period_type text, p_period_start date, p_user uuid)
returns table (
  opportunity_id uuid, opportunity_name text, account_name text, bucket text, amount numeric, total numeric,
  first_date date, last_date date, close_date date
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.name, a.name,
         case when o.is_won then 'closed' else o.forecast_category end,
         sum(o.amount * s.share * c.percent / 100), max(o.amount * c.percent / 100),
         min(s.forecast_date), max(s.forecast_date), o.close_date
  from public.opportunities o
  join public.opportunity_schedule() s on s.opportunity_id = o.id
  join public.opportunity_credit c on c.opportunity_id = o.id and c.user_id = p_user
  left join public.accounts a on a.id = o.account_id
  where public.can_see_goal(p_user)
    and s.forecast_date between p_period_start and public.goal_period_end(p_period_type, p_period_start)
    and (o.is_won or not o.is_closed)
  group by o.id, o.name, a.name, o.is_won, o.forecast_category, o.close_date
  order by 5 desc;
$$;
revoke execute on function public.forecast_items(text, date, uuid) from public, anon;
grant execute on function public.forecast_items(text, date, uuid) to authenticated;

-- El pedido toma como entrega solicitada la primera entrega estimada de la cotización.
create or replace function public.create_order_from_quote(p_quote uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  q public.quotes%rowtype;
  v_id uuid;
begin
  select * into q from public.quotes where id = p_quote;
  if not found then
    raise exception 'Cotización no encontrada';
  end if;
  if q.status <> 'Aceptada' then
    raise exception 'Solo las cotizaciones aceptadas se convierten en pedido';
  end if;
  if q.account_id is null then
    raise exception 'La cotización no tiene una cuenta asociada';
  end if;
  if exists (select 1 from public.orders where quote_id = p_quote) then
    raise exception 'Esta cotización ya tiene un pedido';
  end if;
  if not exists (select 1 from public.quote_line_items where quote_id = p_quote) then
    raise exception 'La cotización no tiene productos';
  end if;

  insert into public.orders (name, account_id, opportunity_id, quote_id, contact_id, price_book_id, bill_to_name,
                             billing_address, shipping_address, payment_terms, delivery_terms, tax_rate, shipping,
                             description, owner_id, project_segment, sale_type, end_customer_name, end_customer_tax_id,
                             delivery_city, requested_delivery_date)
  values (q.name, q.account_id, q.opportunity_id, q.id, q.contact_id, q.price_book_id, q.bill_to_name,
          q.billing_address, q.shipping_address, q.payment_terms, q.delivery_terms, q.tax_rate, q.shipping,
          q.description, coalesce(q.owner_id, auth.uid()), q.project_segment, q.sale_type, q.end_customer_name,
          q.end_customer_tax_id, q.delivery_city,
          -- La primera entrega estimada de la cotización (la de sus líneas o la general).
          (select min(coalesce(l.delivery_date, q.delivery_date)) from public.quote_line_items l where l.quote_id = q.id))
  returning id into v_id;

  insert into public.order_items (order_id, product_id, description, quantity, unit_price, discount, sort_order)
  select v_id, product_id, description, quantity, unit_price, discount, sort_order
  from public.quote_line_items where quote_id = p_quote;
  return v_id;
end;
$$;

-- Al renovar, las entregas estimadas que ya pasaron no se copian.
create or replace function public.renew_quote(p_quote uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  q public.quotes%rowtype;
  v_id uuid;
  v_today date := (now() at time zone 'America/Bogota')::date;
begin
  select * into q from public.quotes where id = p_quote;
  if not found then
    raise exception 'Cotización no encontrada';
  end if;
  if q.status not in ('Borrador', 'Aprobada', 'Presentada') then
    raise exception 'Solo se renuevan cotizaciones en Borrador, Aprobada o Presentada (esta está «%»).', q.status using errcode = '23514';
  end if;
  if q.expiration_date >= v_today then
    raise exception 'La cotización % sigue vigente hasta el %.', q.quote_number, to_char(q.expiration_date, 'DD/MM/YYYY') using errcode = '23514';
  end if;

  insert into public.quotes (name, opportunity_id, account_id, contact_id, status, validity_days, tax_rate, shipping,
                             shipping_manual, shipping_address, payment_terms_manual, payment_terms, delivery_terms,
                             incoterm, description, owner_id, project_segment, sale_type, end_customer_name,
                             end_customer_tax_id, delivery_city, custom_fields, renewed_from_id, delivery_date)
  values (q.name, q.opportunity_id, q.account_id, q.contact_id, 'Borrador', q.validity_days, q.tax_rate, q.shipping,
          q.shipping_manual, q.shipping_address, q.payment_terms_manual, q.payment_terms, q.delivery_terms,
          q.incoterm, q.description, coalesce(q.owner_id, auth.uid()), q.project_segment, q.sale_type, q.end_customer_name,
          q.end_customer_tax_id, q.delivery_city, q.custom_fields, q.id,
          -- Una entrega estimada que ya pasó no sirve: la renovada parte de hoy más su validez.
          case when q.delivery_date >= v_today then q.delivery_date else v_today + q.validity_days end)
  returning id into v_id;

  insert into public.quote_line_items (quote_id, product_id, description, quantity, unit_price, discount, sort_order, delivery_date)
  select v_id, l.product_id, l.description, l.quantity,
         case when l.product_id is null then l.unit_price
              else coalesce((public.quote_line_price(v_id, l.product_id) ->> 'unit_price')::numeric, l.unit_price) end,
         l.discount, l.sort_order, case when l.delivery_date >= v_today then l.delivery_date end
  from public.quote_line_items l where l.quote_id = p_quote
  order by l.sort_order;

  update public.quotes set status = 'Reemplazada' where id = p_quote;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Entregas parciales (pedido de Luis: poner la fecha línea por línea es ineficiente)
-- ---------------------------------------------------------------------------
-- El asesor cotiza las cantidades completas y, si el despacho va por partes, parte toda la cotización de una vez en
-- 2, 3 o 4 entregas: cada producto queda en una línea por entrega, con la cantidad repartida (lo que sobra va a la
-- última: 100 en 3 = 33, 33 y 34) y las fechas una cada 30 días desde la «Entrega estimada» de la cotización. Después
-- puede cambiar fechas y cantidades. Con 1 parte, vuelve a una sola entrega (une las líneas y quita las fechas).
create function public.split_quote_deliveries(p_quote uuid, p_parts int, p_gap_days int default 30)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  q public.quotes%rowtype;
  r record;
  v_base numeric;
  v_qty numeric;
  v_first boolean;
  v_lines int;
begin
  if p_parts is null or p_parts < 1 or p_parts > 12 then
    raise exception 'Las entregas van de 1 a 12' using errcode = '22023';
  end if;
  if p_gap_days is null or p_gap_days < 1 or p_gap_days > 365 then
    raise exception 'Los días entre entregas van de 1 a 365' using errcode = '22023';
  end if;
  select * into q from public.quotes where id = p_quote;
  if not found then
    raise exception 'Cotización no encontrada';
  end if;
  if p_parts > 1 and q.delivery_date is null then
    raise exception 'Pon primero la «Entrega estimada» de la cotización: es la fecha de la primera entrega.' using errcode = '23514';
  end if;

  -- 1. Una sola línea por producto (mismo precio y descuento), con toda su cantidad y sin fecha propia.
  for r in
    select (array_agg(l.id order by l.sort_order, l.created_at))[1] as keep, sum(l.quantity) as quantity, count(*) as n,
           array_agg(l.id) as ids
    from public.quote_line_items l where l.quote_id = p_quote
    group by l.product_id, l.description, l.unit_price, l.discount
  loop
    if r.n > 1 then
      delete from public.quote_line_items where id = any (r.ids) and id <> r.keep;
    end if;
    update public.quote_line_items set quantity = r.quantity, delivery_date = null
      where id = r.keep and (quantity <> r.quantity or delivery_date is not null);
  end loop;
  -- Orden limpio, con espacio para las líneas de cada entrega.
  update public.quote_line_items l set sort_order = x.rn * 100
  from (select id, row_number() over (order by sort_order, created_at) rn from public.quote_line_items where quote_id = p_quote) x
  where x.id = l.id;

  -- 2. Una línea por entrega.
  if p_parts > 1 then
    for r in select * from public.quote_line_items where quote_id = p_quote order by sort_order loop
      v_base := floor(r.quantity / p_parts);
      v_first := true;
      for k in 1..p_parts loop
        v_qty := case when k < p_parts then v_base else r.quantity - v_base * (p_parts - 1) end;
        continue when v_qty <= 0;
        if v_first then
          update public.quote_line_items
            set quantity = v_qty, delivery_date = q.delivery_date + (k - 1) * p_gap_days, sort_order = r.sort_order + k
            where id = r.id;
          v_first := false;
        else
          insert into public.quote_line_items (quote_id, product_id, description, quantity, unit_price, discount, sort_order, delivery_date)
          values (r.quote_id, r.product_id, r.description, v_qty, r.unit_price, r.discount, r.sort_order + k,
                  q.delivery_date + (k - 1) * p_gap_days);
        end if;
      end loop;
    end loop;
  end if;
  select count(*) into v_lines from public.quote_line_items where quote_id = p_quote;
  return v_lines;
end;
$$;
revoke execute on function public.split_quote_deliveries(uuid, int, int) from public, anon;
grant execute on function public.split_quote_deliveries(uuid, int, int) to authenticated;
