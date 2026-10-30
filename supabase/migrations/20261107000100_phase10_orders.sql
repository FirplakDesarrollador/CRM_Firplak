-- Firplak CRM · Fase 10: pedidos (órdenes de venta) generados desde cotizaciones aceptadas.
-- Un pedido nace en «Borrador» con los productos de la cotización; al activarse sus
-- productos quedan fijos y avanza por producción, despacho y entrega.

create sequence public.order_number_seq start 1001;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('PED-' || nextval('public.order_number_seq')::text),
  name text not null check (length(trim(name)) > 0),
  account_id uuid not null,
  opportunity_id uuid,
  quote_id uuid unique,
  contact_id uuid,
  price_book_id uuid,
  status text not null default 'Borrador'
    check (status in ('Borrador', 'Activado', 'En producción', 'Despachado', 'Entregado', 'Cancelado')),
  order_date date not null default ((now() at time zone 'America/Bogota')::date),
  requested_delivery_date date,
  customer_po text,
  activated_at timestamptz,
  delivered_at timestamptz,
  subtotal numeric(18, 2) not null default 0,
  discount_total numeric(18, 2) not null default 0,
  net_total numeric(18, 2) not null default 0,
  tax_rate numeric(5, 2) not null default 19 check (tax_rate between 0 and 100),
  tax numeric(18, 2) not null default 0,
  shipping numeric(18, 2) not null default 0 check (shipping >= 0),
  grand_total numeric(18, 2) not null default 0,
  bill_to_name text,
  billing_address text,
  shipping_address text,
  payment_terms text,
  delivery_terms text,
  description text,
  owner_id uuid,
  created_by uuid,
  custom_fields jsonb not null default '{}'::jsonb,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_account_id_fkey foreign key (account_id) references public.accounts (id) on delete restrict,
  constraint orders_opportunity_id_fkey foreign key (opportunity_id) references public.opportunities (id) on delete set null,
  constraint orders_quote_id_fkey foreign key (quote_id) references public.quotes (id) on delete set null,
  constraint orders_contact_id_fkey foreign key (contact_id) references public.contacts (id) on delete set null,
  constraint orders_price_book_id_fkey foreign key (price_book_id) references public.price_books (id) on delete set null,
  constraint orders_owner_id_fkey foreign key (owner_id) references public.profiles (id) on delete set null,
  constraint orders_created_by_fkey foreign key (created_by) references public.profiles (id) on delete set null
);
create index orders_account_idx on public.orders (account_id);
create index orders_opportunity_idx on public.orders (opportunity_id);
create index orders_owner_idx on public.orders (owner_id);
create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();
create trigger orders_owner before insert on public.orders
  for each row execute function public.set_record_owner();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  product_id uuid,
  description text,
  quantity numeric(12, 2) not null default 1 check (quantity > 0),
  unit_price numeric(18, 2) not null default 0 check (unit_price >= 0),
  discount numeric(5, 2) not null default 0 check (discount between 0 and 100),
  line_total numeric(18, 2) generated always as (round(quantity * unit_price * (1 - discount / 100.0), 2)) stored,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint order_items_order_id_fkey foreign key (order_id) references public.orders (id) on delete cascade,
  constraint order_items_product_id_fkey foreign key (product_id) references public.products (id) on delete set null
);
create index order_items_order_idx on public.order_items (order_id, sort_order);

-- Valores por defecto y reglas de estado del pedido.
create or replace function public.order_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_opp public.opportunities%rowtype;
begin
  if new.opportunity_id is not null then
    select * into v_opp from public.opportunities where id = new.opportunity_id;
    if new.account_id is null then new.account_id := v_opp.account_id; end if;
    if new.contact_id is null then new.contact_id := v_opp.contact_id; end if;
    if new.price_book_id is null then new.price_book_id := v_opp.price_book_id; end if;
  end if;
  if new.price_book_id is null then
    new.price_book_id := (select id from public.price_books where is_standard limit 1);
  end if;
  if new.bill_to_name is null and new.account_id is not null then
    select name into new.bill_to_name from public.accounts where id = new.account_id;
  end if;
  if tg_op = 'UPDATE' and (new.tax_rate is distinct from old.tax_rate or new.shipping is distinct from old.shipping) then
    new.tax := round(new.net_total * new.tax_rate / 100.0, 2);
    new.grand_total := new.net_total + new.tax + new.shipping;
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if old.status = 'Borrador' and new.status not in ('Borrador', 'Cancelado')
       and not exists (select 1 from public.order_items where order_id = new.id) then
      raise exception 'Agrega productos antes de activar el pedido';
    end if;
    if new.status <> 'Borrador' and new.status <> 'Cancelado' and new.activated_at is null then
      new.activated_at := now();
    end if;
    if new.status = 'Borrador' and old.status <> 'Borrador' then
      raise exception 'Un pedido activado no puede volver a borrador';
    end if;
    if new.status = 'Entregado' then
      new.delivered_at := coalesce(new.delivered_at, now());
    else
      new.delivered_at := null;
    end if;
  end if;
  return new;
end;
$$;
create trigger orders_defaults before insert or update on public.orders
  for each row execute function public.order_defaults();

create or replace function public.recalc_order(p_order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub numeric;
  v_net numeric;
begin
  select coalesce(sum(quantity * unit_price), 0), coalesce(sum(line_total), 0)
    into v_sub, v_net
    from public.order_items where order_id = p_order;
  update public.orders o
    set subtotal = round(v_sub, 2),
        discount_total = round(v_sub - v_net, 2),
        net_total = v_net,
        tax = round(v_net * o.tax_rate / 100.0, 2),
        grand_total = v_net + round(v_net * o.tax_rate / 100.0, 2) + o.shipping
    where o.id = p_order;
end;
$$;
revoke execute on function public.recalc_order(uuid) from public, anon, authenticated;

create or replace function public.order_items_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.recalc_order(coalesce(new.order_id, old.order_id));
  return null;
end;
$$;
create trigger order_items_recalc
  after insert or update or delete on public.order_items
  for each row execute function public.order_items_changed();

-- Los productos solo cambian mientras el pedido está en borrador (el borrado en
-- cascada al eliminar un pedido sí se permite).
create or replace function public.enforce_order_items_draft()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_order uuid;
begin
  if pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then v_order := old.order_id; else v_order := new.order_id; end if;
  if exists (select 1 from public.orders where id = v_order and status <> 'Borrador') then
    raise exception 'Solo se pueden cambiar los productos de un pedido en borrador';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger order_items_draft_only before insert or update or delete on public.order_items
  for each row execute function public.enforce_order_items_draft();

-- ---------------------------------------------------------------------------
-- Seguridad
-- ---------------------------------------------------------------------------
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
create policy "pedidos: ver" on public.orders for select to authenticated using (public.can_read_record('orders', owner_id));
create policy "pedidos: crear" on public.orders for insert to authenticated with check (public.has_perm('orders', 'create'));
create policy "pedidos: editar" on public.orders for update to authenticated
  using (public.can_edit_record('orders', owner_id)) with check (public.has_perm('orders', 'edit'));
-- Solo se eliminan pedidos en borrador o cancelados.
create policy "pedidos: eliminar" on public.orders for delete to authenticated
  using (public.can_delete_record('orders', owner_id) and status in ('Borrador', 'Cancelado'));

create policy "productos del pedido: ver" on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy "productos del pedido: gestionar" on public.order_items for all to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and public.can_edit_record('orders', o.owner_id)))
  with check (exists (select 1 from public.orders o where o.id = order_id and public.can_edit_record('orders', o.owner_id)));

-- Permisos por defecto en los perfiles existentes (solo si aún no los tienen).
update public.permission_profiles p
set permissions = jsonb_build_object('orders', v.perms::jsonb) || p.permissions
from (values
  ('Gerente comercial', '{"read":true,"create":true,"edit":true,"delete":true,"view_all":true,"modify_all":true}'),
  ('Asesor comercial', '{"read":true,"create":true,"edit":true,"delete":false,"view_all":false,"modify_all":false}'),
  ('Servicio al cliente', '{"read":true,"view_all":true}'),
  ('Solo lectura', '{"read":true,"view_all":true}')
) as v(name, perms)
where p.name = v.name and not (p.permissions ? 'orders');

insert into public.sharing_settings (object, access) values ('orders', 'private') on conflict (object) do nothing;

alter table public.custom_field_definitions drop constraint custom_field_definitions_object_check;
alter table public.custom_field_definitions add constraint custom_field_definitions_object_check
  check (object in ('accounts', 'contacts', 'opportunities', 'activities', 'leads', 'products', 'quotes', 'cases', 'campaigns', 'orders'));
alter table public.list_views drop constraint list_views_object_check;
alter table public.list_views add constraint list_views_object_check
  check (object in ('accounts', 'contacts', 'opportunities', 'activities', 'leads', 'products', 'quotes', 'cases', 'campaigns', 'orders'));

-- Auditoría de cambios y bloqueo por aprobación también para pedidos.
create trigger orders_audit after insert or update or delete on public.orders
  for each row execute function public.audit_changes();
create or replace function public.can_see_record(p_object text, p_id uuid)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  if p_object not in ('accounts', 'contacts', 'opportunities', 'leads', 'quotes', 'cases', 'campaigns', 'products', 'orders') then
    return false;
  end if;
  execute format('select exists (select 1 from public.%I where id = $1)', p_object) into v_ok using p_id;
  return v_ok;
end;
$$;

alter table public.approval_processes drop constraint approval_processes_object_check;
alter table public.approval_processes add constraint approval_processes_object_check
  check (object in ('accounts', 'contacts', 'opportunities', 'leads', 'quotes', 'cases', 'campaigns', 'products', 'orders'));
create trigger orders_approval_lock before update or delete on public.orders
  for each row execute function public.enforce_approval_lock();
create or replace function public.record_path(p_object text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_object
    when 'accounts' then '/cuentas' when 'contacts' then '/contactos' when 'opportunities' then '/oportunidades'
    when 'leads' then '/prospectos' when 'quotes' then '/cotizaciones' when 'cases' then '/casos'
    when 'campaigns' then '/campanas' when 'products' then '/productos' when 'orders' then '/pedidos' end;
$$;

-- ---------------------------------------------------------------------------
-- Crear un pedido desde una cotización aceptada (con los permisos del usuario).
-- ---------------------------------------------------------------------------
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
                             description, owner_id)
  values (q.name, q.account_id, q.opportunity_id, q.id, q.contact_id, q.price_book_id, q.bill_to_name,
          q.billing_address, q.shipping_address, q.payment_terms, q.delivery_terms, q.tax_rate, q.shipping,
          q.description, coalesce(q.owner_id, auth.uid()))
  returning id into v_id;

  insert into public.order_items (order_id, product_id, description, quantity, unit_price, discount, sort_order)
  select v_id, product_id, description, quantity, unit_price, discount, sort_order
  from public.quote_line_items where quote_id = p_quote;
  return v_id;
end;
$$;
grant execute on function public.create_order_from_quote(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Funciones existentes ampliadas con pedidos
-- ---------------------------------------------------------------------------
create or replace function public.merge_records(p_object text, p_master uuid, p_duplicate uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_master jsonb;
  v_dup jsonb;
begin
  if p_object not in ('accounts', 'contacts', 'leads') then
    raise exception 'Objeto no admitido para fusión';
  end if;
  if p_master = p_duplicate then
    raise exception 'Elige dos registros distintos';
  end if;
  execute format('select to_jsonb(t) from public.%I t where id = $1', p_object) into v_master using p_master;
  execute format('select to_jsonb(t) from public.%I t where id = $1', p_object) into v_dup using p_duplicate;
  if v_master is null or v_dup is null then
    raise exception 'Registro no encontrado';
  end if;
  if not public.can_edit_record(p_object, (v_master ->> 'owner_id')::uuid)
     or not public.can_delete_record(p_object, (v_dup ->> 'owner_id')::uuid) then
    raise exception 'No tienes permiso para fusionar estos registros' using errcode = '42501';
  end if;

  if p_object = 'accounts' then
    update public.accounts m set
      tax_id = coalesce(m.tax_id, d.tax_id), phone = coalesce(m.phone, d.phone), email = coalesce(m.email, d.email),
      website = coalesce(m.website, d.website), industry = coalesce(m.industry, d.industry), segment = coalesce(m.segment, d.segment),
      rating = coalesce(m.rating, d.rating), annual_revenue = coalesce(m.annual_revenue, d.annual_revenue),
      employees = coalesce(m.employees, d.employees), billing_street = coalesce(m.billing_street, d.billing_street),
      billing_city = coalesce(m.billing_city, d.billing_city), billing_state = coalesce(m.billing_state, d.billing_state),
      shipping_street = coalesce(m.shipping_street, d.shipping_street), shipping_city = coalesce(m.shipping_city, d.shipping_city),
      description = coalesce(m.description, d.description), custom_fields = d.custom_fields || m.custom_fields
    from public.accounts d where m.id = p_master and d.id = p_duplicate;
    update public.contacts set account_id = p_master where account_id = p_duplicate;
    update public.opportunities set account_id = p_master where account_id = p_duplicate;
    update public.activities set account_id = p_master where account_id = p_duplicate;
    update public.quotes set account_id = p_master where account_id = p_duplicate;
    update public.cases set account_id = p_master where account_id = p_duplicate;
    update public.orders set account_id = p_master where account_id = p_duplicate;
    update public.accounts set parent_account_id = p_master where parent_account_id = p_duplicate and id <> p_master;
    update public.leads set converted_account_id = p_master where converted_account_id = p_duplicate;
    delete from public.accounts where id = p_duplicate;
  elsif p_object = 'contacts' then
    update public.contacts m set
      account_id = coalesce(m.account_id, d.account_id), first_name = coalesce(m.first_name, d.first_name),
      title = coalesce(m.title, d.title), department = coalesce(m.department, d.department), email = coalesce(m.email, d.email),
      phone = coalesce(m.phone, d.phone), mobile = coalesce(m.mobile, d.mobile), birthdate = coalesce(m.birthdate, d.birthdate),
      lead_source = coalesce(m.lead_source, d.lead_source), mailing_city = coalesce(m.mailing_city, d.mailing_city),
      description = coalesce(m.description, d.description), custom_fields = d.custom_fields || m.custom_fields
    from public.contacts d where m.id = p_master and d.id = p_duplicate;
    update public.opportunities set contact_id = p_master where contact_id = p_duplicate;
    update public.activities set contact_id = p_master where contact_id = p_duplicate;
    update public.quotes set contact_id = p_master where contact_id = p_duplicate;
    update public.cases set contact_id = p_master where contact_id = p_duplicate;
    update public.orders set contact_id = p_master where contact_id = p_duplicate;
    update public.contacts set reports_to_id = p_master where reports_to_id = p_duplicate and id <> p_master;
    delete from public.campaign_members cm where cm.contact_id = p_duplicate
      and exists (select 1 from public.campaign_members x where x.campaign_id = cm.campaign_id and x.contact_id = p_master);
    update public.campaign_members set contact_id = p_master where contact_id = p_duplicate;
    update public.leads set converted_contact_id = p_master where converted_contact_id = p_duplicate;
    delete from public.contacts where id = p_duplicate;
  else
    update public.leads m set
      first_name = coalesce(m.first_name, d.first_name), title = coalesce(m.title, d.title), email = coalesce(m.email, d.email),
      phone = coalesce(m.phone, d.phone), mobile = coalesce(m.mobile, d.mobile), website = coalesce(m.website, d.website),
      industry = coalesce(m.industry, d.industry), city = coalesce(m.city, d.city), campaign_id = coalesce(m.campaign_id, d.campaign_id),
      description = coalesce(m.description, d.description), custom_fields = d.custom_fields || m.custom_fields
    from public.leads d where m.id = p_master and d.id = p_duplicate;
    update public.activities set lead_id = p_master where lead_id = p_duplicate;
    delete from public.campaign_members cm where cm.lead_id = p_duplicate
      and exists (select 1 from public.campaign_members x where x.campaign_id = cm.campaign_id and x.lead_id = p_master);
    update public.campaign_members set lead_id = p_master where lead_id = p_duplicate;
    delete from public.leads where id = p_duplicate;
  end if;
  return p_master;
end;
$$;

create or replace function public.global_search(p_query text, p_limit int default 8)
returns table (object text, id uuid, title text, subtitle text)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (select '%' || replace(replace(trim(p_query), '%', ''), '_', '') || '%' as pattern)
  (select 'accounts'::text, a.id, a.name, concat_ws(' · ', a.account_type, a.billing_city)
     from public.accounts a, q
     where a.name ilike q.pattern or a.tax_id ilike q.pattern or a.account_number ilike q.pattern
     order by a.name limit p_limit)
  union all
  (select 'contacts'::text, c.id, c.full_name, concat_ws(' · ', c.title, c.email)
     from public.contacts c, q
     where c.full_name ilike q.pattern or c.email ilike q.pattern or c.phone ilike q.pattern or c.mobile ilike q.pattern
     order by c.full_name limit p_limit)
  union all
  (select 'leads'::text, l.id, l.full_name, concat_ws(' · ', l.company, l.status)
     from public.leads l, q
     where (l.full_name ilike q.pattern or l.company ilike q.pattern or l.email ilike q.pattern) and not l.is_converted
     order by l.full_name limit p_limit)
  union all
  (select 'opportunities'::text, o.id, o.name, concat_ws(' · ', s.name, o.close_date::text)
     from public.opportunities o
     join public.pipeline_stages s on s.id = o.stage_id, q
     where o.name ilike q.pattern
     order by o.close_date limit p_limit)
  union all
  (select 'quotes'::text, x.id, x.name, concat_ws(' · ', x.quote_number, x.status)
     from public.quotes x, q
     where x.name ilike q.pattern or x.quote_number ilike q.pattern
     order by x.created_at desc limit p_limit)
  union all
  (select 'orders'::text, x.id, x.name, concat_ws(' · ', x.order_number, x.status)
     from public.orders x, q
     where x.name ilike q.pattern or x.order_number ilike q.pattern or x.customer_po ilike q.pattern
     order by x.created_at desc limit p_limit)
  union all
  (select 'cases'::text, c.id, c.subject, concat_ws(' · ', c.case_number, c.status)
     from public.cases c, q
     where c.subject ilike q.pattern or c.case_number ilike q.pattern
     order by c.created_at desc limit p_limit)
  union all
  (select 'products'::text, p.id, p.name, concat_ws(' · ', p.product_code, p.family)
     from public.products p, q
     where p.name ilike q.pattern or p.product_code ilike q.pattern
     order by p.name limit p_limit);
$$;

create or replace function public.claim_demo_records(p_owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.accounts set owner_id = p_owner, created_by = p_owner where is_demo and owner_id is null;
  update public.contacts set owner_id = p_owner, created_by = p_owner where is_demo and owner_id is null;
  update public.opportunities set owner_id = p_owner, created_by = p_owner where is_demo and owner_id is null;
  update public.activities set owner_id = p_owner, created_by = p_owner where is_demo and owner_id is null;
  update public.campaigns set owner_id = p_owner, created_by = p_owner where is_demo and owner_id is null;
  update public.leads set owner_id = p_owner, created_by = p_owner where is_demo and owner_id is null;
  update public.quotes set owner_id = p_owner, created_by = p_owner where is_demo and owner_id is null;
  update public.cases set owner_id = p_owner, created_by = p_owner where is_demo and owner_id is null;
  update public.orders set owner_id = p_owner, created_by = p_owner where is_demo and owner_id is null;
end;
$$;
revoke execute on function public.claim_demo_records(uuid) from public, anon, authenticated;

create or replace function public.crm_dashboard_extra(p_from date, p_to date, p_owner uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with
  l as (select * from public.leads where p_owner is null or owner_id = p_owner),
  c as (select * from public.cases where p_owner is null or owner_id = p_owner),
  qt as (select * from public.quotes where p_owner is null or owner_id = p_owner),
  od as (select * from public.orders where p_owner is null or owner_id = p_owner)
  select jsonb_build_object(
    'leads_new', (select count(*) from l where created_at::date between p_from and p_to),
    'leads_converted', (select count(*) from l where is_converted and converted_at::date between p_from and p_to),
    'leads_open', (select count(*) from l where not is_converted and status <> 'No calificado'),
    'lead_conversion_rate', (
      select case when count(*) = 0 then null
                  else round(count(*) filter (where is_converted) * 100.0 / count(*), 1) end
      from l where created_at::date between p_from and p_to),
    'leads_by_status', coalesce((select jsonb_agg(row_to_json(s)) from (
        select status, count(*) as count from l group by status order by count(*) desc) s), '[]'::jsonb),
    'cases_open', (select count(*) from c where not is_closed),
    'cases_high', (select count(*) from c where not is_closed and priority = 'Alta'),
    'cases_closed', (select count(*) from c where is_closed and closed_at::date between p_from and p_to),
    'avg_resolution_days', (select round(avg(extract(epoch from (closed_at - created_at)) / 86400)::numeric, 1)
                             from c where is_closed and closed_at::date between p_from and p_to),
    'quotes_open', (select count(*) from qt where status in ('Borrador', 'En revisión', 'Aprobada', 'Presentada')),
    'quotes_open_amount', coalesce((select sum(net_total) from qt where status in ('Borrador', 'En revisión', 'Aprobada', 'Presentada')), 0),
    'quotes_accepted', (select count(*) from qt where status = 'Aceptada' and updated_at::date between p_from and p_to),
    'orders_in_progress', (select count(*) from od where status in ('Activado', 'En producción', 'Despachado')),
    'orders_in_progress_amount', coalesce((select sum(net_total) from od where status in ('Activado', 'En producción', 'Despachado')), 0),
    'orders_delivered', (select count(*) from od where status = 'Entregado' and delivered_at::date between p_from and p_to)
  );
$$;
