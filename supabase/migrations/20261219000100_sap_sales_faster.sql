-- Firplak CRM · Ventas reales de SAP: consultas rápidas.
-- Las consultas revisaban los permisos de la persona una vez por cada línea de venta (decenas de miles):
-- el resumen de un año tardaba más de ocho segundos. Ahora los resuelven una sola vez al empezar.
-- Mismo resultado y misma visibilidad.

create or replace function public.sap_sales_summary(p_from date, p_to date, p_top int default 15, p_owner uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with ctx as materialized (
    -- Los permisos se resuelven una sola vez, no por cada línea de venta.
    select public.sap_sales_sees_all() as sees_all,
           coalesce((select array_agg(x.seller) from public.sap_sellers x where x.user_id is not null and public.can_access_owner(x.user_id)), '{}'::text[]) as mine,
           case when p_owner is null then null
                else coalesce((select array_agg(x.seller) from public.sap_sellers x where x.user_id = p_owner), '{}'::text[]) end as of_owner
  ), v as materialized (
    select s.* from public.sap_sales s cross join ctx
    where s.sale_date between p_from and p_to
      and (ctx.of_owner is null or s.seller = any (ctx.of_owner))
      and (ctx.sees_all or s.seller = any (ctx.mine))
  ), grupos as (
    select public.sap_customer_root(v.card_code) as key, sum(v.amount) as amount, count(distinct v.card_code) as branches,
           (array_agg(distinct v.customer_name) filter (where v.customer_name is not null))[1:40] as names
    from v group by 1
  ), top as (
    select g.*,
      -- Nombre del grupo en el CRM: la cuenta principal de alguna de sus sucursales, o la cuenta misma si es una sola.
      (select coalesce(max(pa.name), case when count(*) = 1 then max(a.name) end)
       from public.accounts a left join public.accounts pa on pa.id = a.parent_account_id
       where public.sap_customer_root(a.sap_card_code) = g.key) as crm_name
    from grupos g order by g.amount desc limit greatest(1, least(coalesce(p_top, 15), 100))
  )
  select jsonb_build_object(
    'total', coalesce((select sum(amount) from v), 0),
    'invoices', (select count(distinct invoice) from v),
    'customers', (select count(*) from grupos),
    'by_month', coalesce((select jsonb_agg(jsonb_build_object('month', m.month, 'amount', m.amount) order by m.month)
                          from (select to_char(date_trunc('month', sale_date), 'YYYY-MM') as month, sum(amount) as amount from v group by 1) m), '[]'::jsonb),
    'by_channel', coalesce((select jsonb_agg(jsonb_build_object('key', c.k, 'amount', c.amount) order by c.amount desc)
                            from (select coalesce(channel, 'Sin canal') as k, sum(amount) as amount from v group by 1) c), '[]'::jsonb),
    'by_zone', coalesce((select jsonb_agg(jsonb_build_object('key', z.k, 'amount', z.amount) order by z.amount desc)
                         from (select coalesce(zone, 'Sin zona') as k, sum(amount) as amount from v group by 1) z), '[]'::jsonb),
    'top', coalesce((select jsonb_agg(jsonb_build_object('key', t.key, 'amount', t.amount, 'branches', t.branches, 'names', to_jsonb(t.names), 'crm_name', t.crm_name)
                                      order by t.amount desc) from top t), '[]'::jsonb),
    'loaded_at', (select max(loaded_at) from public.sap_sales_months)
  );
$$;

create or replace function public.sap_sales_group(p_key text, p_from date, p_to date, p_owner uuid default null)
returns table (card_code text, customer_name text, seller text, amount numeric, account_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with ctx as materialized (
    select public.sap_sales_sees_all() as sees_all,
           coalesce((select array_agg(x.seller) from public.sap_sellers x where x.user_id is not null and public.can_access_owner(x.user_id)), '{}'::text[]) as mine,
           case when p_owner is null then null
                else coalesce((select array_agg(x.seller) from public.sap_sellers x where x.user_id = p_owner), '{}'::text[]) end as of_owner
  ), b as (
    select s.card_code, max(s.customer_name) as customer_name, max(s.seller) as seller, sum(s.amount) as amount
    from public.sap_sales s cross join ctx
    where public.sap_customer_root(s.card_code) = p_key and s.sale_date between p_from and p_to
      and (ctx.of_owner is null or s.seller = any (ctx.of_owner))
      and (ctx.sees_all or s.seller = any (ctx.mine))
    group by s.card_code
  )
  -- La cuenta del CRM se busca una vez por sucursal, no por línea.
  select b.card_code, b.customer_name, b.seller, b.amount,
         (select a.id from public.accounts a where a.sap_card_code = b.card_code and public.can_read_record('accounts', a.owner_id) limit 1)
  from b order by b.amount desc;
$$;
