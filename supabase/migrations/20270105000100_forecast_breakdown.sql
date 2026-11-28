-- Pronóstico real por zona, canal, subgrupo o segmento, vendedor y país (pedido de Luis, 2026-11-28).
--
-- Los pedidos y entregas abiertos de SAP no traen zona, canal ni país: eso es del cliente. Hasta ahora solo se podía
-- deducir del historial de ventas, y los clientes sin ventas (nuevos) quedaban sin clasificar.
--   · sap_customers: el maestro de clientes de SAP que trae el agente (canal = grupo de cliente, territorio y su zona,
--     y subgrupo). Sirve para clasificar lo que el archivo de ventas no cubre.
--   · sap_backlog.segment: el «Segmento del Pedido» de SAP (U_Segmentacion), que vive en el pedido, no en el cliente.
--   · forecast_real_breakdown: las tres capas del pronóstico real repartidas por cada corte. En el corte de subgrupo,
--     los constructores del mercado nacional salen por segmento (decisión de Luis); el país, solo para Exterior.

create table public.sap_customers (
  card_code text primary key,
  name text,
  channel text,
  zone text,
  territory text,
  subgroup_code text,
  subgroup text,
  batch uuid not null,
  synced_at timestamptz not null default now()
);
alter table public.sap_customers enable row level security;
comment on table public.sap_customers is
  'Maestro de clientes de SAP traído por el agente: canal (grupo de cliente), zona, territorio y subgrupo. Solo lo leen las funciones de ventas y pronóstico.';

-- Carga por lotes del agente. Filas: [CardCode, nombre, canal, zona, territorio, código de subgrupo, subgrupo].
-- La última parte (p_last) borra los clientes que ya no vinieron.
create function public.sap_agent_customers_load(p_batch uuid, p_rows jsonb, p_last boolean)
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
  insert into public.sap_customers (card_code, name, channel, zone, territory, subgroup_code, subgroup, batch, synced_at)
  select distinct on (upper(regexp_replace(r ->> 0, '\s', '', 'g')))
         upper(regexp_replace(r ->> 0, '\s', '', 'g')), nullif(trim(r ->> 1), ''), nullif(trim(r ->> 2), ''), nullif(trim(r ->> 3), ''),
         nullif(trim(r ->> 4), ''), nullif(trim(r ->> 5), ''), nullif(trim(r ->> 6), ''), p_batch, now()
  from jsonb_array_elements(p_rows) r
  where coalesce(trim(r ->> 0), '') <> ''
  on conflict (card_code) do update set
    name = excluded.name, channel = excluded.channel, zone = excluded.zone, territory = excluded.territory,
    subgroup_code = excluded.subgroup_code, subgroup = excluded.subgroup, batch = excluded.batch, synced_at = excluded.synced_at;
  get diagnostics v_n = row_count;
  if p_last then
    delete from public.sap_customers c where c.batch <> p_batch;
  end if;
  return v_n;
end;
$$;
revoke execute on function public.sap_agent_customers_load(uuid, jsonb, boolean) from public, anon;
grant execute on function public.sap_agent_customers_load(uuid, jsonb, boolean) to authenticated;

alter table public.sap_backlog add column segment text;
comment on column public.sap_backlog.segment is 'Segmento del pedido en SAP (U_Segmentacion). Para el corte por segmento de los constructores del mercado nacional.';

-- Filas del agente: [tipo, DocEntry, línea, DocNum, CardCode, cliente, vendedor, fecha, valor, tipo de facturación, segmento].
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
  insert into public.sap_backlog (batch, kind, doc_entry, line_num, doc_num, card_code, customer_name, seller, base_date, amount, billing_type, segment)
  select p_batch, r ->> 0, (r ->> 1)::bigint, coalesce((r ->> 2)::int, 0), nullif(r ->> 3, ''),
         upper(regexp_replace(r ->> 4, '\s', '', 'g')), nullif(r ->> 5, ''), nullif(trim(r ->> 6), ''),
         nullif(r ->> 7, '')::date, round((r ->> 8)::numeric, 2), nullif(trim(r ->> 9), ''), nullif(trim(r ->> 10), '')
  from jsonb_array_elements(p_rows) r
  where r ->> 0 in ('order', 'delivery', 'invoice', 'credit') and coalesce(r ->> 4, '') <> '' and (r ->> 8)::numeric > 0
  on conflict (batch, kind, doc_entry, line_num) do update set
    doc_num = excluded.doc_num, card_code = excluded.card_code, customer_name = excluded.customer_name,
    seller = excluded.seller, base_date = excluded.base_date, amount = excluded.amount, billing_type = excluded.billing_type, segment = excluded.segment;
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

-- Cambia lo que devuelve (segmento): se quita y se vuelve a crear.
drop function public.sap_backlog_lines();
create function public.sap_backlog_lines()
returns table (kind text, card_code text, doc_num text, forecast_date date, amount numeric, seller text,
               overdue_days int, customer_name text, base_date date, segment text)
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
         greatest(l.today - l.due, 0), l.customer_name, l.base_date, l.segment
  from l;
$$;
revoke execute on function public.sap_backlog_lines() from public, anon, authenticated;

-- Las tres capas del pronóstico real de un periodo, repartidas por cada corte. Misma visibilidad que forecast_real_days:
-- sin p_user, la compañía (solo quien ve todas las ventas); con p_user, lo de esa persona.
-- Cortes: zone, channel, seller, group (subgrupo; segmento en constructores nacional) y country (solo Exterior).
create function public.forecast_real_breakdown(p_period_type text, p_period_start date, p_user uuid default null)
returns table (dimension text, key text, invoiced numeric, backlog numeric, opportunities numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_end date := public.goal_period_end(p_period_type, p_period_start);
  v_today date := (now() at time zone 'America/Bogota')::date;
  v_sales_until date := coalesce((select max(s.sale_date) from public.sap_sales s), '-infinity'::date);
begin
  if p_user is null and not public.sap_sales_sees_all() then
    return;
  end if;
  if p_user is not null and not public.can_see_goal(p_user) then
    return;
  end if;
  return query
  with mine as (select z.seller from public.sap_sellers z where z.user_id = p_user),
  x as (
    -- Facturado según el archivo de ventas.
    select 'i'::text as layer, s.amount, coalesce(s.zone, c.zone) as zone, coalesce(s.channel, c.channel) as channel, s.seller,
           coalesce(nullif(trim(s.territory), ''), c.territory) as territory, public.sap_is_international(coalesce(s.zone, c.zone), s.card_code) as intl,
           c.subgroup, null::text as segment
    from public.sap_sales s
    left join public.sap_customers c on c.card_code = s.card_code
    where s.sale_date between p_period_start and v_end
      and (p_user is null or s.seller in (select m.seller from mine m))
    union all
    -- Facturado después del archivo de ventas: facturas y notas crédito de SAP.
    select 'i', case when f.kind = 'credit' then -f.amount else f.amount end, coalesce(c.zone, h.zone), coalesce(c.channel, h.channel), f.seller,
           coalesce(c.territory, h.territory), public.sap_is_international(coalesce(c.zone, h.zone), f.card_code), c.subgroup, f.segment
    from public.sap_backlog f
    left join public.sap_customers c on c.card_code = f.card_code
    left join lateral (select s.zone, s.channel, nullif(trim(s.territory), '') as territory from public.sap_sales s
                       where s.card_code = f.card_code order by s.sale_date desc limit 1) h on true
    where f.kind in ('invoice', 'credit')
      and f.batch = (select st.batch from public.sap_backlog_state st where st.id)
      and f.base_date > v_sales_until and f.base_date between p_period_start and v_end
      and (p_user is null or f.seller in (select m.seller from mine m))
    union all
    -- Pedidos y entregas abiertos: clasificados por el maestro de clientes y, si falta, por su última venta.
    select 'b', b.amount, coalesce(c.zone, h.zone), coalesce(c.channel, h.channel), b.seller,
           coalesce(c.territory, h.territory), public.sap_is_international(coalesce(c.zone, h.zone), b.card_code), c.subgroup, b.segment
    from public.sap_backlog_lines() b
    left join public.sap_customers c on c.card_code = b.card_code
    left join lateral (select s.zone, s.channel, nullif(trim(s.territory), '') as territory from public.sap_sales s
                       where s.card_code = b.card_code order by s.sale_date desc limit 1) h on true
    where b.forecast_date between p_period_start and v_end and b.amount > 0
      and b.overdue_days <= public.sap_stale_days()
      and (p_user is null or public.sap_backlog_is_of(p_user, b.seller, b.card_code))
    union all
    -- Oportunidades abiertas del CRM: canal de la cuenta y vendedor de SAP de quien lleva el crédito.
    select 'o', op.amount * sc.share * coalesce(cr.percent, 100) / 100, c.zone, coalesce(c.channel, a.industry),
           coalesce((select z.seller from public.sap_sellers z where z.user_id = coalesce(cr.user_id, op.owner_id) order by z.seller limit 1),
                    (select nullif(p.full_name, '') from public.profiles p where p.id = coalesce(cr.user_id, op.owner_id))),
           c.territory, public.sap_is_international(c.zone, a.sap_card_code), c.subgroup, null
    from public.opportunities op
    join public.opportunity_schedule() sc on sc.opportunity_id = op.id
    left join public.opportunity_credit cr on cr.opportunity_id = op.id and cr.user_id = p_user
    left join public.accounts a on a.id = op.account_id
    left join public.sap_customers c on c.card_code = a.sap_card_code
    where not op.is_closed and greatest(sc.forecast_date, v_today) between p_period_start and v_end
      and (p_user is null or cr.user_id is not null)
  )
  select d.dim, d.k,
         coalesce(sum(x.amount) filter (where x.layer = 'i'), 0),
         coalesce(sum(x.amount) filter (where x.layer = 'b'), 0),
         coalesce(sum(x.amount) filter (where x.layer = 'o'), 0)
  from x
  cross join lateral (values
    ('zone', coalesce(nullif(trim(x.zone), ''), 'Sin zona')),
    ('channel', coalesce(nullif(trim(x.channel), ''), 'Sin canal')),
    ('seller', coalesce(nullif(trim(x.seller), ''), 'Sin vendedor')),
    -- Los constructores del mercado nacional van por el segmento del pedido; los demás, por el subgrupo del cliente.
    -- Las oportunidades del CRM no tienen pedido todavía: van por el subgrupo de su cliente.
    ('group', case when x.layer <> 'o' and x.channel = 'Canal Constructores' and not x.intl
                   then 'Constructores · ' || coalesce(nullif(trim(x.segment), ''), 'Sin segmento')
                   else coalesce(nullif(trim(x.subgroup), ''), 'Sin subgrupo') end),
    ('country', case when x.intl then coalesce(nullif(trim(x.territory), ''), 'Sin país') end)
  ) d(dim, k)
  where d.k is not null
  group by d.dim, d.k
  order by d.dim, sum(x.amount) desc;
end;
$$;
revoke execute on function public.forecast_real_breakdown(text, date, uuid) from public, anon;
grant execute on function public.forecast_real_breakdown(text, date, uuid) to authenticated;
