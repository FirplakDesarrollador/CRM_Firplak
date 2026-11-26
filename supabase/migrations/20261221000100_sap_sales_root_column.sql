-- Firplak CRM · Ventas reales de SAP: el cliente principal de cada línea se guarda ya calculado.
-- El resumen de ventas (Indicadores) agrupaba las líneas por sap_customer_root(card_code): una expresión
-- regular por cada línea. Con el año completo (unas 42 mil líneas, más las del año de comparación) eso
-- era más de la mitad del tiempo de la consulta (medido en producción: ~480 ms de ~830 ms).
-- La raíz pasa a ser una columna generada de sap_sales: se calcula sola al cargar cada línea y las
-- consultas solo la leen. Los resultados no cambian; las cargas del agente tampoco (no la mencionan).

alter table public.sap_sales
  add column customer_root text generated always as (public.sap_customer_root(card_code)) stored;

-- El índice por raíz pasa de la expresión a la columna.
drop index public.sap_sales_root_idx;
create index sap_sales_root_idx on public.sap_sales (customer_root, sale_date);

-- Mismas funciones de 20261220000100, leyendo la columna. Se reemplazan sin cambiar la firma:
-- conservan sus permisos (solo usuarios con sesión).
create or replace function public.sap_sales_summary(
  p_from date, p_to date, p_top int default 15, p_owner uuid default null,
  p_channels text[] default null, p_zones text[] default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with ctx as materialized (
    -- Los permisos y el periodo de comparación se resuelven una sola vez, no por cada línea de venta.
    select public.sap_sales_sees_all() as sees_all,
           coalesce((select array_agg(x.seller) from public.sap_sellers x where x.user_id is not null and public.can_access_owner(x.user_id)), '{}'::text[]) as mine,
           case when p_owner is null then null
                else coalesce((select array_agg(x.seller) from public.sap_sellers x where x.user_id = p_owner), '{}'::text[]) end as of_owner,
           r.mode, r.r_from, r.r_to, greatest(r.months, 1) as months, r.available, r.d_from, r.d_to
    from public.sap_sales_reference(p_from, p_to) r
  ), v as materialized (
    select s.amount, s.invoice, s.card_code, s.customer_root, s.customer_name, s.sale_date,
           coalesce(s.channel, 'Sin canal') as channel, coalesce(s.zone, 'Sin zona') as zone,
           s.sale_date between p_from and p_to as is_cur,
           -- En el promedio de los meses anteriores cuentan los mismos días del mes que abarca el periodo.
           ctx.available and s.sale_date between ctx.r_from and ctx.r_to
             and (ctx.mode = 'year' or extract(day from s.sale_date) between ctx.d_from and ctx.d_to) as is_ref
    from public.sap_sales s cross join ctx
    where (s.sale_date between p_from and p_to or (ctx.available and s.sale_date between ctx.r_from and ctx.r_to))
      and (ctx.of_owner is null or s.seller = any (ctx.of_owner))
      and (ctx.sees_all or s.seller = any (ctx.mine))
  ), f as materialized (
    -- Con la selección de canales y de zonas aplicada.
    select * from v
    where (p_channels is null or cardinality(p_channels) = 0 or v.channel = any (p_channels))
      and (p_zones is null or cardinality(p_zones) = 0 or v.zone = any (p_zones))
  ), grupos as (
    select f.customer_root as key,
           sum(f.amount) filter (where f.is_cur) as amount,
           sum(f.amount) filter (where f.is_ref) as ref_amount,
           count(distinct f.card_code) filter (where f.is_cur) as branches,
           (array_agg(distinct f.customer_name) filter (where f.is_cur and f.customer_name is not null))[1:40] as names
    from f group by 1
    having count(*) filter (where f.is_cur) > 0
  ), top as (
    select g.*,
      -- Nombre del grupo en el CRM: la cuenta principal de alguna de sus sucursales, o la cuenta misma si es una sola.
      (select coalesce(max(pa.name), case when count(*) = 1 then max(a.name) end)
       from public.accounts a left join public.accounts pa on pa.id = a.parent_account_id
       where public.sap_customer_root(a.sap_card_code) = g.key) as crm_name
    from grupos g order by g.amount desc limit greatest(1, least(coalesce(p_top, 15), 100))
  )
  select jsonb_build_object(
    'total', coalesce((select sum(amount) from f where is_cur), 0),
    'total_prev', (select case when ctx.available then coalesce((select sum(amount) from f where is_ref), 0) / ctx.months end from ctx),
    'invoices', (select count(distinct invoice) from f where is_cur),
    'customers', (select count(*) from grupos),
    'compare', (select jsonb_build_object('mode', ctx.mode, 'from', ctx.r_from, 'to', ctx.r_to, 'months', ctx.months, 'available', ctx.available,
                                           'day_from', ctx.d_from, 'day_to', ctx.d_to) from ctx),
    'by_month', coalesce((select jsonb_agg(jsonb_build_object('month', m.month, 'amount', m.amount) order by m.month)
                          from (select to_char(date_trunc('month', sale_date), 'YYYY-MM') as month, sum(amount) as amount from f where is_cur group by 1) m), '[]'::jsonb),
    -- Cada gráfico se filtra por la selección del otro, no por la suya.
    'by_channel', coalesce((select jsonb_agg(jsonb_build_object('key', c.k, 'amount', c.amount) order by c.amount desc)
                            from (select v.channel as k, sum(v.amount) as amount from v
                                  where v.is_cur and (p_zones is null or cardinality(p_zones) = 0 or v.zone = any (p_zones)) group by 1) c), '[]'::jsonb),
    'by_zone', coalesce((select jsonb_agg(jsonb_build_object('key', z.k, 'amount', z.amount) order by z.amount desc)
                         from (select v.zone as k, sum(v.amount) as amount from v
                               where v.is_cur and (p_channels is null or cardinality(p_channels) = 0 or v.channel = any (p_channels)) group by 1) z), '[]'::jsonb),
    'top', coalesce((select jsonb_agg(jsonb_build_object('key', t.key, 'amount', t.amount, 'branches', t.branches, 'names', to_jsonb(t.names), 'crm_name', t.crm_name,
                                                         'prev', (select case when ctx.available then coalesce(t.ref_amount, 0) / ctx.months end from ctx))
                                      order by t.amount desc) from top t), '[]'::jsonb),
    'loaded_at', (select max(loaded_at) from public.sap_sales_months)
  );
$$;

-- Detalle de un grupo de clientes: cada sucursal con su venta, su comparación y su vendedor.
create or replace function public.sap_sales_group(
  p_key text, p_from date, p_to date, p_owner uuid default null,
  p_channels text[] default null, p_zones text[] default null)
returns table (card_code text, customer_name text, seller text, amount numeric, prev numeric, account_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with ctx as materialized (
    select public.sap_sales_sees_all() as sees_all,
           coalesce((select array_agg(x.seller) from public.sap_sellers x where x.user_id is not null and public.can_access_owner(x.user_id)), '{}'::text[]) as mine,
           case when p_owner is null then null
                else coalesce((select array_agg(x.seller) from public.sap_sellers x where x.user_id = p_owner), '{}'::text[]) end as of_owner,
           r.mode, r.r_from, r.r_to, greatest(r.months, 1) as months, r.available, r.d_from, r.d_to
    from public.sap_sales_reference(p_from, p_to) r
  ), b as (
    select s.card_code,
           max(s.customer_name) filter (where s.sale_date between p_from and p_to) as customer_name,
           max(s.seller) filter (where s.sale_date between p_from and p_to) as seller,
           sum(s.amount) filter (where s.sale_date between p_from and p_to) as amount,
           sum(s.amount) filter (where ctx.available and s.sale_date between ctx.r_from and ctx.r_to
             and (ctx.mode = 'year' or extract(day from s.sale_date) between ctx.d_from and ctx.d_to)) as ref_amount
    from public.sap_sales s cross join ctx
    where s.customer_root = p_key
      and (s.sale_date between p_from and p_to or (ctx.available and s.sale_date between ctx.r_from and ctx.r_to))
      and (ctx.of_owner is null or s.seller = any (ctx.of_owner))
      and (ctx.sees_all or s.seller = any (ctx.mine))
      and (p_channels is null or cardinality(p_channels) = 0 or coalesce(s.channel, 'Sin canal') = any (p_channels))
      and (p_zones is null or cardinality(p_zones) = 0 or coalesce(s.zone, 'Sin zona') = any (p_zones))
    group by s.card_code
    having count(*) filter (where s.sale_date between p_from and p_to) > 0
  )
  -- La cuenta del CRM se busca una vez por sucursal, no por línea.
  select b.card_code, b.customer_name, b.seller, b.amount,
         (select case when ctx.available then coalesce(b.ref_amount, 0) / ctx.months end from ctx),
         (select a.id from public.accounts a where a.sap_card_code = b.card_code and public.can_read_record('accounts', a.owner_id) limit 1)
  from b order by b.amount desc;
$$;
