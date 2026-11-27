-- Ajuste masivo de precios (decisión de Luis, 2026-11-27: los precios los manda el CRM).
--
-- Administración filtra productos, indica cuánto sube o baja cada lista (%) y aplica. Cada ajuste queda guardado como
-- un lote, con el precio anterior y el nuevo de cada producto, para saber quién cambió qué y poder deshacerlo completo.
-- Solo administradores: las funciones lo exigen y las tablas no admiten escritura directa.

create table public.price_adjustments (
  id uuid primary key default gen_random_uuid(),
  note text,
  -- Cómo se eligieron los productos (búsqueda y filtros de la lista), para leerlo después.
  filter jsonb not null default '{}'::jsonb,
  -- Por lista: [{ price_book_id, name, percent }].
  changes jsonb not null,
  rounding numeric(10, 2) not null default 0 check (rounding >= 0),
  product_count int not null default 0,
  price_count int not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  reverted_by uuid,
  reverted_at timestamptz,
  reverted_count int,
  constraint price_adjustments_created_by_fkey foreign key (created_by) references public.profiles (id) on delete set null,
  constraint price_adjustments_reverted_by_fkey foreign key (reverted_by) references public.profiles (id) on delete set null
);
create table public.price_adjustment_items (
  adjustment_id uuid not null,
  price_book_id uuid not null,
  product_id uuid not null,
  old_price numeric(18, 2) not null,
  new_price numeric(18, 2) not null,
  primary key (adjustment_id, price_book_id, product_id),
  constraint price_adjustment_items_adjustment_id_fkey foreign key (adjustment_id) references public.price_adjustments (id) on delete cascade,
  constraint price_adjustment_items_price_book_id_fkey foreign key (price_book_id) references public.price_books (id) on delete cascade,
  constraint price_adjustment_items_product_id_fkey foreign key (product_id) references public.products (id) on delete cascade
);
create index price_adjustment_items_product_idx on public.price_adjustment_items (product_id);
create index price_adjustments_created_idx on public.price_adjustments (created_at desc);

alter table public.price_adjustments enable row level security;
alter table public.price_adjustment_items enable row level security;
create policy "ajustes de precios: ver" on public.price_adjustments for select to authenticated using (public.is_admin());
create policy "ajustes de precios: ver detalle" on public.price_adjustment_items for select to authenticated using (public.is_admin());
-- Sin políticas de escritura: solo escriben las funciones de abajo.

-- Precio ajustado: sube o baja el porcentaje y, si se pide, se redondea al múltiplo más cercano (p. ej. 1.000).
create function public.adjusted_price(p_price numeric, p_percent numeric, p_rounding numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when coalesce(p_rounding, 0) > 0
    then greatest(round(p_price * (1 + p_percent / 100.0) / p_rounding) * p_rounding, 0)
    else greatest(round(p_price * (1 + p_percent / 100.0), 2), 0) end;
$$;
revoke execute on function public.adjusted_price(numeric, numeric, numeric) from public, anon;
grant execute on function public.adjusted_price(numeric, numeric, numeric) to authenticated;

-- Lo que cambiaría, sin guardar: por lista, cuántos precios, la suma antes y después, y unos ejemplos.
-- p_changes: [{ "price_book_id": "...", "percent": 8 }]. El redondeo solo aplica a las listas en pesos.
create function public.preview_price_adjustment(p_products uuid[], p_changes jsonb, p_rounding numeric default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede ajustar precios' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'price_book_id', b.id, 'name', b.name, 'currency', b.currency, 'percent', c.percent,
      'prices', x.n, 'before', x.before, 'after', x.after, 'samples', x.samples) order by b.market, b.name)
    from jsonb_to_recordset(p_changes) as c(price_book_id uuid, percent numeric)
    join public.price_books b on b.id = c.price_book_id
    cross join lateral (
      select count(*) n, coalesce(sum(e.unit_price), 0) before,
             coalesce(sum(public.adjusted_price(e.unit_price, c.percent, case when b.currency = 'COP' then p_rounding else 0 end)), 0) after,
             coalesce((select jsonb_agg(s) from (
               select jsonb_build_object('name', p.name, 'code', p.product_code, 'before', e2.unit_price,
                        'after', public.adjusted_price(e2.unit_price, c.percent, case when b.currency = 'COP' then p_rounding else 0 end)) s
               from public.price_book_entries e2 join public.products p on p.id = e2.product_id
               where e2.price_book_id = b.id and e2.product_id = any (p_products)
               order by p.name limit 5) q), '[]'::jsonb) samples
      from public.price_book_entries e
      where e.price_book_id = b.id and e.product_id = any (p_products)
    ) x), '[]'::jsonb);
end;
$$;
revoke execute on function public.preview_price_adjustment(uuid[], jsonb, numeric) from public, anon;
grant execute on function public.preview_price_adjustment(uuid[], jsonb, numeric) to authenticated;

create function public.apply_price_adjustment(p_products uuid[], p_changes jsonb, p_rounding numeric default 0,
                                             p_note text default null, p_filter jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_prices int;
  v_products int;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede ajustar precios' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_products), 0) = 0 then
    raise exception 'No hay productos elegidos' using errcode = '22023';
  end if;
  if jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) = 0 then
    raise exception 'Indica el porcentaje de al menos una lista' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_changes) as c(price_book_id uuid, percent numeric)
             where c.percent is null or c.percent = 0 or c.percent < -90 or c.percent > 200) then
    raise exception 'Cada porcentaje debe estar entre -90 y 200, y no ser 0' using errcode = '22023';
  end if;
  if coalesce(p_rounding, 0) < 0 then
    raise exception 'Redondeo no válido' using errcode = '22023';
  end if;

  insert into public.price_adjustments (note, filter, rounding, changes)
  values (nullif(trim(p_note), ''), coalesce(p_filter, '{}'::jsonb), coalesce(p_rounding, 0),
          (select jsonb_agg(jsonb_build_object('price_book_id', b.id, 'name', b.name, 'percent', c.percent) order by b.name)
           from jsonb_to_recordset(p_changes) as c(price_book_id uuid, percent numeric)
           join public.price_books b on b.id = c.price_book_id))
  returning id into v_id;

  insert into public.price_adjustment_items (adjustment_id, price_book_id, product_id, old_price, new_price)
  select v_id, e.price_book_id, e.product_id, e.unit_price,
         public.adjusted_price(e.unit_price, c.percent, case when b.currency = 'COP' then coalesce(p_rounding, 0) else 0 end)
  from jsonb_to_recordset(p_changes) as c(price_book_id uuid, percent numeric)
  join public.price_books b on b.id = c.price_book_id
  join public.price_book_entries e on e.price_book_id = b.id and e.product_id = any (p_products);

  update public.price_book_entries e set unit_price = i.new_price
  from public.price_adjustment_items i
  where i.adjustment_id = v_id and e.price_book_id = i.price_book_id and e.product_id = i.product_id
    and e.unit_price is distinct from i.new_price;

  select count(*), count(distinct product_id) into v_prices, v_products from public.price_adjustment_items where adjustment_id = v_id;
  if v_prices = 0 then
    raise exception 'Ninguno de los productos elegidos tiene precio en esas listas' using errcode = '22023';
  end if;
  update public.price_adjustments set price_count = v_prices, product_count = v_products where id = v_id;
  return v_id;
end;
$$;
revoke execute on function public.apply_price_adjustment(uuid[], jsonb, numeric, text, jsonb) from public, anon;
grant execute on function public.apply_price_adjustment(uuid[], jsonb, numeric, text, jsonb) to authenticated;

-- Deshace un ajuste: cada precio vuelve al anterior, salvo los que alguien cambió después (esos se respetan).
-- Devuelve cuántos precios volvieron.
create function public.revert_price_adjustment(p_adjustment uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede deshacer un ajuste de precios' using errcode = '42501';
  end if;
  perform 1 from public.price_adjustments where id = p_adjustment and reverted_at is null for update;
  if not found then
    raise exception 'Ese ajuste no existe o ya se deshizo' using errcode = '22023';
  end if;
  update public.price_book_entries e set unit_price = i.old_price
  from public.price_adjustment_items i
  where i.adjustment_id = p_adjustment and e.price_book_id = i.price_book_id and e.product_id = i.product_id
    and e.unit_price = i.new_price;
  get diagnostics v_n = row_count;
  update public.price_adjustments set reverted_at = now(), reverted_by = auth.uid(), reverted_count = v_n where id = p_adjustment;
  return v_n;
end;
$$;
revoke execute on function public.revert_price_adjustment(uuid) from public, anon;
grant execute on function public.revert_price_adjustment(uuid) to authenticated;
