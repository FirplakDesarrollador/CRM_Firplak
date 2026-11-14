-- Firplak CRM · Importar productos de SAP con Familia, Planta y Grupo de Artículo.
-- Al importar, la persona elige la Familia y la Planta (de las listas del CRM) para los artículos que
-- marcó, y el Grupo de Artículo viene de SAP. Un grupo que no esté en la lista de valores se crea
-- solo, atado a la familia elegida (lista dependiente de Familia), para que el producto entre completo.

drop function public.sap_agent_import_products(jsonb);

-- Filas: [{ "code", "name", "custom": {…}, "item_group": "…" | null }].
create or replace function public.sap_agent_import_products(p_rows jsonb, p_family text default null, p_plant text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created int; v_total int; v_groups int := 0;
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
           nullif(trim(r ->> 'item_group'), '') as item_group
    from jsonb_array_elements(p_rows) r
    where coalesce(r ->> 'code', '') <> ''
  ), escritas as (
    insert into public.products (name, product_code, unit, is_active, custom_fields, family, plant, item_group)
    select f.name, f.code, 'Unidad', true, f.custom, v_family, v_plant, f.item_group from filas f
    on conflict (product_code) do update
      set name = excluded.name,
          custom_fields = public.products.custom_fields || excluded.custom_fields,
          -- Solo se cambia lo que viene en esta importación; lo demás se conserva.
          family = coalesce(excluded.family, public.products.family),
          plant = case when public.products.is_kit then public.products.plant else coalesce(excluded.plant, public.products.plant) end,
          item_group = coalesce(excluded.item_group, public.products.item_group)
    returning (xmax = 0) as nueva
  )
  select count(*) filter (where nueva), count(*) into v_created, v_total from escritas;
  return jsonb_build_object('created', v_created, 'updated', v_total - v_created, 'groups_created', v_groups);
end;
$$;

revoke execute on function public.sap_agent_import_products(jsonb, text, text) from public, anon;
grant execute on function public.sap_agent_import_products(jsonb, text, text) to authenticated;
