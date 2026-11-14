-- Firplak CRM · Importar kits de SAP con sus componentes, y planta elegida por artículo.
-- Un kit de SAP (lista de materiales de venta) entra marcado como Kit, con planta «KIT», y con sus
-- componentes enlazados y su cantidad; los componentes entran también como productos. La planta nunca
-- se toma de SAP: la elige la persona, una para lo marcado y una por cada componente de un kit, y un
-- artículo que no sea kit no entra sin ella.
-- Filas: [{ "code", "name", "custom", "item_group", "plant", "is_kit", "components": [{ "code", "quantity" }] }].

create or replace function public.sap_agent_import_products(p_rows jsonb, p_family text default null, p_plant text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created int; v_total int; v_groups int := 0; v_kits int := 0;
  v_text text; v_kit_id uuid; k record;
  v_has_plants constant boolean := exists (select 1 from public.picklist_values where object = 'products' and field = 'plant' and value <> 'KIT');
  v_family text := nullif(trim(p_family), '');
  v_plant text := nullif(trim(p_plant), '');
begin
  if not public.is_sap_agent() then raise exception 'Solo el agente de SAP' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'Lote no válido' using errcode = '22023';
  end if;
  -- Una lista sin filas en la tabla usa los valores de fábrica de la aplicación: ahí no hay contra qué validar.
  if v_family is not null and exists (select 1 from public.picklist_values where object = 'products' and field = 'family')
     and not exists (select 1 from public.picklist_values where object = 'products' and field = 'family' and value = v_family) then
    raise exception 'La familia «%» no está en la lista de valores.', v_family using errcode = '23514';
  end if;
  if v_plant is not null and (v_plant = 'KIT' or (exists (select 1 from public.picklist_values where object = 'products' and field = 'plant')
     and not exists (select 1 from public.picklist_values where object = 'products' and field = 'plant' and value = v_plant))) then
    raise exception 'La planta «%» no está en la lista de valores.', v_plant using errcode = '23514';
  end if;

  -- Planta por artículo (la de cada componente de un kit se elige aparte): tiene que ser de la lista.
  if v_has_plants then
    select string_agg(distinct trim(r ->> 'plant'), ', ') into v_text from jsonb_array_elements(p_rows) r
    where nullif(trim(r ->> 'plant'), '') is not null
      and (trim(r ->> 'plant') = 'KIT' or not exists (select 1 from public.picklist_values pv where pv.object = 'products' and pv.field = 'plant' and pv.value = trim(r ->> 'plant')));
    if v_text is not null then
      raise exception 'La planta «%» no está en la lista de valores.', v_text using errcode = '23514';
    end if;
    -- La planta siempre la elige la persona: no entra un artículo sin ella (los kits llevan «KIT»).
    select string_agg(x.code, ', ') into v_text from (
      select r ->> 'code' as code from jsonb_array_elements(p_rows) r
      where not coalesce((r ->> 'is_kit')::boolean, false)
        and coalesce(nullif(trim(r ->> 'plant'), ''), v_plant) is null
        and not exists (select 1 from public.products p where p.product_code = r ->> 'code' and (p.plant is not null or p.is_kit))
      order by 1 limit 5) x;
    if v_text is not null then
      raise exception 'Falta elegir la planta de: %.', v_text using errcode = '23514';
    end if;
  end if;

  -- Grupos de artículo que vienen de SAP: se crean en la lista si faltan y quedan atados a la familia.
  if exists (select 1 from jsonb_array_elements(p_rows) r where nullif(trim(r ->> 'item_group'), '') is not null) then
    if v_family is null then
      raise exception 'Para traer el Grupo de Artículo hay que elegir la Familia.' using errcode = '23514';
    end if;
    insert into public.picklist_dependencies (object, field, controlling_field)
    values ('products', 'item_group', 'family') on conflict do nothing;
    with grupos as (
      select distinct trim(r ->> 'item_group') as value from jsonb_array_elements(p_rows) r
      where nullif(trim(r ->> 'item_group'), '') is not null
    ), nuevos as (
      insert into public.picklist_values (object, field, value, sort_order, controlling_map)
      select 'products', 'item_group', g.value,
             coalesce((select max(sort_order) from public.picklist_values where object = 'products' and field = 'item_group'), 0)
               + row_number() over (order by g.value),
             jsonb_build_object('family', jsonb_build_array(v_family))
      from grupos g
      where not exists (select 1 from public.picklist_values pv where pv.object = 'products' and pv.field = 'item_group' and pv.value = g.value)
      returning 1
    )
    select count(*) into v_groups from nuevos;
    -- Un grupo que ya existía se habilita también para esta familia.
    update public.picklist_values pv
       set is_active = true,
           controlling_map = jsonb_set(pv.controlling_map, '{family}', coalesce(pv.controlling_map -> 'family', '[]'::jsonb) || to_jsonb(v_family))
     where pv.object = 'products' and pv.field = 'item_group'
       and pv.value in (select trim(r ->> 'item_group') from jsonb_array_elements(p_rows) r)
       and not coalesce(pv.controlling_map -> 'family', '[]'::jsonb) ? v_family;
  end if;

  with filas as (
    select distinct on (r ->> 'code') r ->> 'code' as code,
           coalesce(nullif(trim(r ->> 'name'), ''), r ->> 'code') as name,
           case when jsonb_typeof(r -> 'custom') = 'object' then r -> 'custom' else '{}'::jsonb end as custom,
           nullif(trim(r ->> 'item_group'), '') as item_group,
           nullif(trim(r ->> 'plant'), '') as plant,
           coalesce((r ->> 'is_kit')::boolean, false) as is_kit
    from jsonb_array_elements(p_rows) r
    where coalesce(r ->> 'code', '') <> ''
  ), escritas as (
    insert into public.products (name, product_code, unit, is_active, custom_fields, family, plant, item_group, is_kit)
    select f.name, f.code, 'Unidad', true, f.custom, v_family,
           case when f.is_kit then null else coalesce(f.plant, v_plant) end, f.item_group, f.is_kit
    from filas f
    on conflict (product_code) do update
      set name = excluded.name,
          custom_fields = public.products.custom_fields || excluded.custom_fields,
          -- Solo se cambia lo que viene en esta importación; lo demás se conserva.
          family = coalesce(excluded.family, public.products.family),
          -- Un kit en SAP queda como kit en el CRM (su planta la pone la regla de kits); nunca deja de serlo por importar.
          is_kit = public.products.is_kit or excluded.is_kit,
          plant = case when public.products.is_kit or excluded.is_kit then public.products.plant
                       else coalesce(excluded.plant, public.products.plant) end,
          item_group = coalesce(excluded.item_group, public.products.item_group)
    returning (xmax = 0) as nueva
  )
  select count(*) filter (where nueva), count(*) into v_created, v_total from escritas;

  -- Componentes de cada kit, como están en SAP: se enlazan los que ya son productos del CRM (el agente
  -- los envía antes que el kit) y se quitan los que SAP ya no trae.
  for k in
    select r ->> 'code' as code, r -> 'components' as comps from jsonb_array_elements(p_rows) r
    where coalesce((r ->> 'is_kit')::boolean, false) and jsonb_typeof(r -> 'components') = 'array'
  loop
    select id into v_kit_id from public.products where product_code = k.code and is_kit;
    continue when v_kit_id is null;
    delete from public.product_kit_components kc
     where kc.kit_id = v_kit_id
       and kc.component_id not in (select p.id from public.products p join jsonb_array_elements(k.comps) c on p.product_code = c ->> 'code');
    insert into public.product_kit_components (kit_id, component_id, quantity, sort_order)
    select v_kit_id, p.id, sum((c.c ->> 'quantity')::numeric), min(c.ord)::int
    from jsonb_array_elements(k.comps) with ordinality c(c, ord)
    join public.products p on p.product_code = c.c ->> 'code'
    where not p.is_kit and (c.c ->> 'quantity')::numeric > 0
    group by p.id
    on conflict (kit_id, component_id) do update set quantity = excluded.quantity, sort_order = excluded.sort_order;
    v_kits := v_kits + 1;
  end loop;

  return jsonb_build_object('created', v_created, 'updated', v_total - v_created, 'groups_created', v_groups, 'kits', v_kits);
end;
$$;

revoke execute on function public.sap_agent_import_products(jsonb, text, text) from public, anon;
grant execute on function public.sap_agent_import_products(jsonb, text, text) to authenticated;
