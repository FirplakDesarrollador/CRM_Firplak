-- Productos: Planta y Grupo de Artículo, para informes de ventas más detallados.
-- Son listas de valores que el administrador define en Configuración → Listas de valores (objeto «products»,
-- campos «plant» e «item_group»); la base no restringe el valor, igual que Familia.

alter table public.products
  add column plant text,
  add column item_group text;

comment on column public.products.plant is 'Planta que fabrica el producto (lista de valores editable).';
comment on column public.products.item_group is 'Grupo de Artículo (lista de valores editable; en SAP Business One, el grupo de artículos).';

-- Los informes agrupan y filtran por estos campos.
create index products_plant_idx on public.products (plant) where plant is not null;
create index products_item_group_idx on public.products (item_group) where item_group is not null;
