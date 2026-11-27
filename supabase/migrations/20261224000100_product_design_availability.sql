-- Productos: diseño y disponible real (pedidos de Luis, 2026-11-27).
--
--   · Diseño del producto (p. ej. «Honolulu»): agrupa todas las versiones de un mismo diseño para filtrar e informar.
--     Su lista se administra en Configuración → Listas de valores y puede depender de Familia y Grupo de Artículo.
--   · Disponible real de la bodega de producto terminado: En inventario − Comprometido. Sale de la copia de SAP que
--     deja el agente (sap_items) y se guarda en el producto para poder filtrar y ordenar la lista por él.
--   · Un kit no tiene inventario propio: su disponible es cuántos kits completos salen con el disponible de sus
--     componentes (el componente que menos alcanza manda; si uno no alcanza, 0).

alter table public.products
  add column design text,
  add column available_qty numeric(14, 3),
  add column available_at timestamptz;
comment on column public.products.design is 'Diseño del producto (p. ej. Honolulu): agrupa sus versiones para filtros e informes.';
comment on column public.products.available_qty is 'Disponible real en la bodega de producto terminado: En inventario − Comprometido (de SAP). En un kit, kits completos que salen con sus componentes. Vacío: SAP aún no lo ha informado.';
comment on column public.products.available_at is 'Cuándo trajo el agente de SAP el dato con el que se calculó el disponible.';
create index products_design_idx on public.products (design) where design is not null;
create index products_available_idx on public.products (available_qty) where available_qty > 0;

-- La bodega de producto terminado cuyo disponible ven los asesores.
create function public.sap_stock_warehouse()
returns text
language sql
immutable
set search_path = ''
as $$ select 'PT-01'::text $$;
revoke execute on function public.sap_stock_warehouse() from public, anon;
grant execute on function public.sap_stock_warehouse() to authenticated;

-- Disponible real de un artículo en esa bodega. Nulo: el agente todavía no trajo el artículo (o no existe en SAP).
create function public.sap_item_available(p_code text)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select sum(coalesce(nullif(w ->> 'InStock', '')::numeric, 0) - coalesce(nullif(w ->> 'Committed', '')::numeric, 0))
    from jsonb_array_elements(case when jsonb_typeof(i.data -> 'ItemWarehouseInfoCollection') = 'array'
                                   then i.data -> 'ItemWarehouseInfoCollection' else '[]'::jsonb end) w
    where w ->> 'WarehouseCode' = public.sap_stock_warehouse()), 0)
  from public.sap_items i
  where i.item_code = p_code and i.data is not null;
$$;
revoke execute on function public.sap_item_available(text) from public, anon, authenticated;

-- Recalcula el disponible de un producto y, si es componente, el de los kits que lo llevan.
create function public.refresh_product_availability(p_product uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.products%rowtype;
  v_qty numeric;
  v_at timestamptz;
begin
  select * into p from public.products where id = p_product;
  if not found then
    return;
  end if;
  if p.is_kit then
    select case when count(*) = 0 or bool_or(c.available_qty is null) then null
                else greatest(0, min(floor(c.available_qty / k.quantity))) end,
           min(c.available_at)
      into v_qty, v_at
      from public.product_kit_components k join public.products c on c.id = k.component_id
      where k.kit_id = p.id;
  else
    v_qty := public.sap_item_available(p.product_code);
    select i.synced_at into v_at from public.sap_items i where i.item_code = p.product_code and i.data is not null;
  end if;
  update public.products set available_qty = v_qty, available_at = v_at
    where id = p.id and (available_qty is distinct from v_qty or available_at is distinct from v_at);
  if not p.is_kit then
    perform public.refresh_product_availability(k.kit_id) from public.product_kit_components k where k.component_id = p.id;
  end if;
end;
$$;
revoke execute on function public.refresh_product_availability(uuid) from public, anon, authenticated;

create function public.availability_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'sap_items' then
    perform public.refresh_product_availability(p.id) from public.products p where p.product_code = new.item_code;
  elsif tg_table_name = 'product_kit_components' then
    perform public.refresh_product_availability(coalesce(new.kit_id, old.kit_id));
    if tg_op = 'UPDATE' and old.kit_id <> new.kit_id then
      perform public.refresh_product_availability(old.kit_id);
    end if;
  else
    perform public.refresh_product_availability(new.id);
  end if;
  return null;
end;
$$;
revoke execute on function public.availability_changed() from public, anon, authenticated;
create trigger sap_items_availability after insert or update on public.sap_items
  for each row execute function public.availability_changed();
create trigger product_kit_components_availability after insert or update or delete on public.product_kit_components
  for each row execute function public.availability_changed();
create trigger products_availability after insert or update of product_code, is_kit on public.products
  for each row execute function public.availability_changed();

-- El disponible cambia varias veces al día: no cuenta como modificación del producto ni va a su historial.
create function public.products_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'available_qty' - 'available_at' - 'updated_at') is distinct from (to_jsonb(old) - 'available_qty' - 'available_at' - 'updated_at') then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;
revoke execute on function public.products_set_updated_at() from public, anon, authenticated;
drop trigger products_updated_at on public.products;
create trigger products_updated_at before update on public.products
  for each row execute function public.products_set_updated_at();

create or replace function public.audit_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_key text;
  v_ignore text[] := array['updated_at', 'created_at', 'full_name', 'expected_revenue', 'stage_changed_at',
                           'subtotal', 'discount_total', 'net_total', 'tax', 'grand_total', 'line_total',
                           'is_closed', 'is_won', 'closed_at', 'completed_at', 'has_responded',
                           'available_qty', 'available_at'];
begin
  if tg_op = 'INSERT' then
    insert into public.field_history (object, record_id, field, operation, changed_by)
    values (tg_table_name, new.id, '*', 'insert', auth.uid());
    return null;
  elsif tg_op = 'DELETE' then
    insert into public.field_history (object, record_id, field, old_value, operation, changed_by)
    values (tg_table_name, old.id, '*', to_jsonb(old) ->> (case when tg_table_name in ('contacts', 'leads') then 'full_name'
                                                               when tg_table_name = 'cases' then 'subject' else 'name' end),
            'delete', auth.uid());
    return null;
  end if;

  v_old := to_jsonb(old);
  v_new := to_jsonb(new);
  for v_key in select jsonb_object_keys(v_new) loop
    continue when v_key = any(v_ignore);
    if v_key = 'custom_fields' then
      -- Un registro por cada campo personalizado modificado.
      insert into public.field_history (object, record_id, field, old_value, new_value, changed_by)
      select tg_table_name, new.id, 'cf.' || k, (v_old -> 'custom_fields') ->> k, (v_new -> 'custom_fields') ->> k, auth.uid()
      from (
        select jsonb_object_keys(coalesce(v_old -> 'custom_fields', '{}'::jsonb)) as k
        union
        select jsonb_object_keys(coalesce(v_new -> 'custom_fields', '{}'::jsonb))
      ) keys
      where (v_old -> 'custom_fields' -> k) is distinct from (v_new -> 'custom_fields' -> k);
    elsif (v_old -> v_key) is distinct from (v_new -> v_key) then
      insert into public.field_history (object, record_id, field, old_value, new_value, changed_by)
      values (tg_table_name, new.id, v_key, v_old ->> v_key, v_new ->> v_key, auth.uid());
    end if;
  end loop;
  return null;
end;
$$;

-- Lo que el agente ya había traído.
do $$
declare
  r record;
begin
  for r in select id from public.products where not is_kit loop
    perform public.refresh_product_availability(r.id);
  end loop;
  for r in select id from public.products where is_kit loop
    perform public.refresh_product_availability(r.id);
  end loop;
end
$$;
