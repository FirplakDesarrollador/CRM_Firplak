-- Kits: una referencia de venta formada por varios componentes (p. ej. «Kit Lvm Oslo con mueble elev 63cm» =
-- lavamanos + mueble). El kit es lo que se cotiza, se vende y se valoriza; sus componentes quedan para los informes
-- de producción y logística, que despliegan cada componente con su cantidad bajo el kit.
--
-- Reglas (decisiones de Luis, 13 nov 2026):
--   · Un producto es Kit o es componente (no kit). Un kit no puede ser componente de otro kit.
--   · La planta de un kit es siempre «KIT»: sus componentes vienen de plantas distintas.
--   · Planta y Grupo de Artículo dependen de Familia (si el administrador configura esa dependencia en
--     Configuración → Listas de valores), salvo en los kits, que tienen sus propios grupos.

alter table public.products add column is_kit boolean not null default false;
comment on column public.products.is_kit is 'Kit: referencia de venta formada por componentes (product_kit_components). Su planta es siempre «KIT».';

create table public.product_kit_components (
  id uuid primary key default gen_random_uuid(),
  kit_id uuid not null,
  component_id uuid not null,
  quantity numeric(12, 3) not null default 1 check (quantity > 0),
  sort_order integer not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint product_kit_components_kit_id_fkey foreign key (kit_id) references public.products (id) on delete cascade,
  -- Un componente no se puede borrar mientras esté en un kit.
  constraint product_kit_components_component_id_fkey foreign key (component_id) references public.products (id) on delete restrict,
  constraint product_kit_components_created_by_fkey foreign key (created_by) references public.profiles (id) on delete set null,
  constraint product_kit_components_unique unique (kit_id, component_id),
  constraint product_kit_components_not_self check (kit_id <> component_id)
);
comment on table public.product_kit_components is 'Componentes de cada kit, con su cantidad por kit.';
create index product_kit_components_component_idx on public.product_kit_components (component_id);

alter table public.product_kit_components enable row level security;
create policy "componentes de kit: ver" on public.product_kit_components for select to authenticated
  using (public.has_perm('products', 'read'));
create policy "componentes de kit: gestionar" on public.product_kit_components for all to authenticated
  using (public.has_perm('products', 'edit')) with check (public.has_perm('products', 'edit'));

-- El kit tiene que ser un kit y el componente no puede serlo.
create function public.kit_component_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.products p where p.id = new.kit_id and p.is_kit) then
    raise exception 'Solo un producto marcado como Kit puede tener componentes.' using errcode = '23514';
  end if;
  if exists (select 1 from public.products p where p.id = new.component_id and p.is_kit) then
    raise exception 'Un kit no puede ser componente de otro kit.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function public.kit_component_rules() from public, anon, authenticated;
create trigger product_kit_components_rules before insert or update on public.product_kit_components
  for each row execute function public.kit_component_rules();

-- Planta de los kits y cambios de tipo. El nombre del disparador lo ordena antes del de dependencias de listas.
create function public.product_kit_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_kit then
    new.plant := 'KIT';
    if tg_op = 'UPDATE' and not old.is_kit
       and exists (select 1 from public.product_kit_components c where c.component_id = new.id) then
      raise exception 'Este producto es componente de un kit: quítalo de esos kits antes de marcarlo como Kit.' using errcode = '23514';
    end if;
  else
    if tg_op = 'UPDATE' and old.is_kit then
      if exists (select 1 from public.product_kit_components c where c.kit_id = new.id) then
        raise exception 'Quita primero los componentes de este kit.' using errcode = '23514';
      end if;
      -- Al dejar de ser kit, la planta «KIT» ya no aplica y queda por definir.
      if new.plant = 'KIT' then
        new.plant := null;
      end if;
    elsif new.plant = 'KIT' then
      raise exception 'La planta «KIT» es solo para productos marcados como Kit.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.product_kit_rules() from public, anon, authenticated;
create trigger products_kit_rules before insert or update on public.products
  for each row execute function public.product_kit_rules();

-- En un kit, Planta y Grupo de Artículo no dependen de Familia.
create or replace function public.enforce_picklist_dependencies()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.picklist_dependencies%rowtype;
  v_new jsonb := to_jsonb(new);
  v_old jsonb;
  v_value text;
  v_control text;
  v_shared constant text[] := array['market', 'industry', 'segment'];
  v_is_kit constant boolean := tg_table_name = 'products' and coalesce((to_jsonb(new) ->> 'is_kit')::boolean, false);
begin
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
  end if;
  for d in
    select * from public.picklist_dependencies pd
    where pd.object = tg_table_name
       or (tg_table_name = 'leads' and pd.object = 'accounts' and pd.field = any (v_shared) and pd.controlling_field = any (v_shared))
    order by pd.controlling_field
  loop
    continue when v_is_kit and d.field in ('plant', 'item_group');
    v_value := public.record_field_text(v_new, d.field);
    v_control := public.record_field_text(v_new, d.controlling_field);
    -- Sin cambios en ninguno de los dos campos: se respeta lo que ya había.
    continue when tg_op = 'UPDATE'
      and v_value is not distinct from public.record_field_text(v_old, d.field)
      and v_control is not distinct from public.record_field_text(v_old, d.controlling_field);
    continue when v_value is null;
    if v_control is null then
      raise exception 'Elige primero el valor del que depende «%».', v_value using errcode = '23514';
    end if;
    if not exists (
      select 1 from public.picklist_values pv
      where pv.object = d.object and pv.field = d.field and pv.value = v_value
        and coalesce(pv.controlling_map -> d.controlling_field, '[]'::jsonb) ? v_control
    ) then
      raise exception '«%» no corresponde a «%».', v_value, v_control using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;
