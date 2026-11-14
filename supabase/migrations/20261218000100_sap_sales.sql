-- Firplak CRM · SAP por agente, fase 4: ventas reales (facturación neta) para metas e indicadores.
-- El agente sube los CSV mensuales de ventas netas de SAP (facturas menos notas crédito, ya calculadas
-- por el script de ventas de Firplak). Se guardan a lo sumo dos años: el año en curso y el anterior.
-- Cada venta se le cuenta al usuario del CRM relacionado con su «Vendedor Senior» de SAP. Las
-- sucursales de un mismo cliente (CN + NIT + «-01», «-02»…) se agrupan por la raíz de su código.
-- Nadie lee la tabla directamente: las consultas de abajo aplican quién puede ver qué (lo suyo y lo de
-- quienes le reportan; la dirección, todo), igual que las metas.

create table public.sap_sales (
  id bigint generated always as identity primary key,
  sale_date date not null,
  invoice text,
  sale_type text,
  zone text,
  territory text,
  channel text,
  seller text,
  card_code text not null,
  customer_name text,
  amount numeric(16, 2) not null
);
create index sap_sales_date_idx on public.sap_sales (sale_date);
create index sap_sales_card_idx on public.sap_sales (card_code, sale_date);
create index sap_sales_seller_idx on public.sap_sales (seller, sale_date);

-- Meses cargados (para que el agente solo vuelva a subir los archivos que cambiaron).
create table public.sap_sales_months (
  month date primary key,
  file_hash text not null,
  row_count int not null default 0,
  loaded_at timestamptz not null default now()
);

-- Vendedor de SAP ↔ usuario del CRM.
create table public.sap_sellers (
  seller text primary key,
  user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.sap_sales enable row level security;
alter table public.sap_sales_months enable row level security;
alter table public.sap_sellers enable row level security;
create policy "sap meses de ventas: leer" on public.sap_sales_months for select to authenticated
  using (public.has_perm('system', 'customize'));
create policy "sap vendedores: leer" on public.sap_sellers for select to authenticated
  using (public.has_perm('system', 'customize'));
create policy "sap vendedores: relacionar" on public.sap_sellers for update to authenticated
  using (public.has_perm('system', 'customize')) with check (public.has_perm('system', 'customize'));
-- sap_sales no tiene políticas: se lee solo por las funciones de este archivo.

-- Raíz del código de cliente: agrupa las sucursales («CN900100200-67» → «CN900100200»).
create or replace function public.sap_customer_root(p_card_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_card_code ~ '-[0-9]+$' then regexp_replace(p_card_code, '-[0-9]+$', '') else p_card_code end;
$$;
create index sap_sales_root_idx on public.sap_sales (public.sap_customer_root(card_code), sale_date);

create or replace function public.sap_norm(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(translate(coalesce(p_text, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'), '\s+', ' ', 'g'));
$$;

-- Usuario cuyo nombre coincide con el de un vendedor de SAP (primer y último nombre); nulo si no hay uno solo.
create or replace function public.sap_match_seller(p_seller text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case when count(*) = 1 then (array_agg(p.id))[1] end
  from public.profiles p
  cross join lateral (select string_to_array(trim(public.sap_norm(p.full_name)), ' ') as w) t
  where p.is_active and coalesce(array_length(t.w, 1), 0) >= 2
    and (' ' || public.sap_norm(p_seller) || ' ') like '% ' || t.w[1] || ' %'
    and (' ' || public.sap_norm(p_seller) || ' ') like '% ' || t.w[array_length(t.w, 1)] || ' %';
$$;
revoke execute on function public.sap_match_seller(text) from public, anon, authenticated;

-- ¿La persona ve todas las ventas (dirección y administración)?
create or replace function public.sap_sales_sees_all()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or public.has_perm('opportunities', 'view_all');
$$;
revoke execute on function public.sap_sales_sees_all() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Agente: meses cargados y carga de un mes (reemplaza el mes completo, por lotes).
-- Filas: [[fecha, factura, tipo, zona, territorio, canal, vendedor, código, nombre, valor], …].
-- ---------------------------------------------------------------------------
create or replace function public.sap_agent_sales_months()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_sap_agent() then raise exception 'Solo el agente de SAP' using errcode = '42501'; end if;
  return coalesce((select jsonb_object_agg(to_char(month, 'YYYY-MM'), file_hash) from public.sap_sales_months), '{}'::jsonb);
end;
$$;

create or replace function public.sap_agent_sales_load(p_month date, p_hash text, p_rows jsonb, p_first boolean, p_last boolean)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_keep_from constant date := make_date(extract(year from (now() at time zone 'America/Bogota'))::int - 1, 1, 1);
  v_n int;
begin
  if not public.is_sap_agent() then raise exception 'Solo el agente de SAP' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then
    raise exception 'Lote no válido' using errcode = '22023';
  end if;
  if v_month < v_keep_from then
    raise exception 'Solo se guardan el año en curso y el anterior.' using errcode = '22023';
  end if;
  if p_first then
    delete from public.sap_sales where sale_date >= v_month and sale_date < v_month + interval '1 month';
  end if;
  insert into public.sap_sales (sale_date, invoice, sale_type, zone, territory, channel, seller, card_code, customer_name, amount)
  select (r ->> 0)::date, nullif(r ->> 1, ''), nullif(r ->> 2, ''), nullif(r ->> 3, ''), nullif(r ->> 4, ''), nullif(r ->> 5, ''),
         nullif(trim(r ->> 6), ''), upper(regexp_replace(r ->> 7, '\s', '', 'g')), nullif(r ->> 8, ''), (r ->> 9)::numeric
  from jsonb_array_elements(p_rows) r
  where coalesce(r ->> 7, '') <> '' and (r ->> 0)::date >= v_month and (r ->> 0)::date < v_month + interval '1 month';
  get diagnostics v_n = row_count;
  if p_last then
    insert into public.sap_sales_months (month, file_hash, row_count, loaded_at)
    values (v_month, p_hash, (select count(*) from public.sap_sales where sale_date >= v_month and sale_date < v_month + interval '1 month'), now())
    on conflict (month) do update set file_hash = excluded.file_hash, row_count = excluded.row_count, loaded_at = excluded.loaded_at;
    -- Vendedores nuevos: se relacionan solos con el usuario del mismo nombre, si hay uno solo.
    insert into public.sap_sellers (seller, user_id)
    select s.seller, public.sap_match_seller(s.seller)
    from (select distinct seller from public.sap_sales where seller is not null and sale_date >= v_month and sale_date < v_month + interval '1 month') s
    on conflict (seller) do nothing;
    -- Solo dos años: lo anterior al 1 de enero del año pasado se borra.
    delete from public.sap_sales where sale_date < v_keep_from;
    delete from public.sap_sales_months where month < v_keep_from;
  end if;
  return v_n;
end;
$$;

revoke execute on function public.sap_agent_sales_months() from public, anon;
revoke execute on function public.sap_agent_sales_load(date, text, jsonb, boolean, boolean) from public, anon;
grant execute on function public.sap_agent_sales_months() to authenticated;
grant execute on function public.sap_agent_sales_load(date, text, jsonb, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Consultas (con la visibilidad aplicada).
-- ---------------------------------------------------------------------------
-- Resumen del periodo: total, por mes, por canal, por zona y los clientes que más compraron,
-- agrupando las sucursales de un mismo cliente.
-- p_owner: solo las ventas de los vendedores de SAP relacionados con ese usuario (filtro «asesor» de Indicadores).
create or replace function public.sap_sales_summary(p_from date, p_to date, p_top int default 15, p_owner uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with v as (
    select s.* from public.sap_sales s
    where s.sale_date between p_from and p_to
      and (p_owner is null or s.seller in (select x.seller from public.sap_sellers x where x.user_id = p_owner))
      and (public.sap_sales_sees_all()
        or s.seller in (select x.seller from public.sap_sellers x where x.user_id is not null and public.can_access_owner(x.user_id)))
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

-- Detalle de un grupo de clientes: cada sucursal con su venta y su vendedor.
create or replace function public.sap_sales_group(p_key text, p_from date, p_to date, p_owner uuid default null)
returns table (card_code text, customer_name text, seller text, amount numeric, account_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select s.card_code, max(s.customer_name), max(s.seller), sum(s.amount),
         (select a.id from public.accounts a where a.sap_card_code = s.card_code and public.can_read_record('accounts', a.owner_id) limit 1)
  from public.sap_sales s
  where public.sap_customer_root(s.card_code) = p_key and s.sale_date between p_from and p_to
    and (p_owner is null or s.seller in (select x.seller from public.sap_sellers x where x.user_id = p_owner))
    and (public.sap_sales_sees_all()
      or s.seller in (select x.seller from public.sap_sellers x where x.user_id is not null and public.can_access_owner(x.user_id)))
  group by s.card_code
  order by 4 desc;
$$;

-- Ventas de una cuenta en los últimos doce meses, por mes. Una cuenta principal suma las de sus sucursales.
create or replace function public.sap_account_sales(p_account uuid)
returns table (month text, amount numeric, branches bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with codes as (
    select a.sap_card_code as code from public.accounts a
    where (a.id = p_account or a.parent_account_id = p_account) and a.sap_card_code is not null
      and exists (select 1 from public.accounts me where me.id = p_account and public.can_read_record('accounts', me.owner_id))
  )
  select to_char(date_trunc('month', s.sale_date), 'YYYY-MM'), sum(s.amount), count(distinct s.card_code)
  from public.sap_sales s
  where s.card_code in (select code from codes)
    and s.sale_date >= (date_trunc('month', (now() at time zone 'America/Bogota')) - interval '11 months')::date
  group by 1 order by 1;
$$;

revoke execute on function public.sap_sales_summary(date, date, int, uuid) from public, anon;
revoke execute on function public.sap_sales_group(text, date, date, uuid) from public, anon;
revoke execute on function public.sap_account_sales(uuid) from public, anon;
grant execute on function public.sap_sales_summary(date, date, int, uuid) to authenticated;
grant execute on function public.sap_sales_group(text, date, date, uuid) to authenticated;
grant execute on function public.sap_account_sales(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Metas: métrica nueva «Ventas facturadas (SAP)».
-- ---------------------------------------------------------------------------
alter table public.sales_goals drop constraint sales_goals_metric_check;
alter table public.sales_goals add constraint sales_goals_metric_check
  check (metric in ('won_amount', 'won_count', 'new_opportunities', 'new_leads', 'activities_completed', 'invoiced_amount'));

create or replace function public.goal_progress(p_period_type text, p_period_start date)
returns table (goal_id uuid, user_id uuid, user_name text, metric text, target numeric, actual numeric, period_end date)
language sql
stable
security definer
set search_path = ''
as $$
  with g as (
    select sg.*, public.goal_period_end(sg.period_type, sg.period_start) as pend
    from public.sales_goals sg
    where sg.period_type = p_period_type and sg.period_start = p_period_start and public.can_see_goal(sg.user_id)
  )
  select g.id, g.user_id, coalesce(nullif(p.full_name, ''), p.email, 'Compañía'), g.metric, g.target,
    case g.metric
      when 'won_amount' then
        case when g.user_id is null then
          coalesce((select sum(o.amount) from public.opportunities o
            where o.is_won and o.close_date between g.period_start and g.pend), 0)
        else
          coalesce((select sum(o.amount * c.percent / 100) from public.opportunities o
            join public.opportunity_credit c on c.opportunity_id = o.id and c.user_id = g.user_id
            where o.is_won and o.close_date between g.period_start and g.pend), 0)
        end
      -- Facturación neta de SAP: la de los vendedores de SAP relacionados con la persona; la de la compañía, toda.
      when 'invoiced_amount' then coalesce((select sum(s.amount) from public.sap_sales s
        where s.sale_date between g.period_start and g.pend
          and (g.user_id is null or s.seller in (select x.seller from public.sap_sellers x where x.user_id = g.user_id))), 0)
      when 'won_count' then (select count(distinct o.id) from public.opportunities o
        left join public.opportunity_credit c on c.opportunity_id = o.id
        where o.is_won and o.close_date between g.period_start and g.pend and (g.user_id is null or c.user_id = g.user_id))
      when 'new_opportunities' then (select count(*) from public.opportunities o
        where (o.created_at at time zone 'America/Bogota')::date between g.period_start and g.pend and (g.user_id is null or o.owner_id = g.user_id))
      when 'new_leads' then (select count(*) from public.leads l
        where (l.created_at at time zone 'America/Bogota')::date between g.period_start and g.pend and (g.user_id is null or l.owner_id = g.user_id))
      else (select count(*) from public.activities a
        where a.status = 'completed' and (a.completed_at at time zone 'America/Bogota')::date between g.period_start and g.pend
          and (g.user_id is null or a.owner_id = g.user_id))
    end::numeric,
    g.pend
  from g
  left join public.profiles p on p.id = g.user_id
  order by g.user_id nulls first, g.metric;
$$;
