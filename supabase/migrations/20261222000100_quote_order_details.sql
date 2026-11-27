-- Cotización corta y pedido completo (decisiones de Luis, 2026-11-26).
--
--   · La cotización pide lo mínimo: cuenta, contacto, ciudad de entrega, validez (15, 30 o 60 días desde su fecha)
--     y, en el Canal Constructores, el segmento de obra y el tipo (Estándar o Carpintería de Obra).
--   · El pedido completa el resto: cliente final, contactos de logística y financiero, tipo de entrega, subida y muestra.
--   · Carpintería de Obra admite líneas sin producto del catálogo (tipologías con valor, descuento y neto).
--   · Una cotización vencida no se acepta: se renueva, y la renovada reemplaza a la anterior con los precios vigentes.
--   · El segmento y el tipo viajan a la oportunidad y al pedido (quien digita en SAP los necesita).
--   · La cuenta guarda el correo de facturación electrónica y el contacto su rol; salen en los documentos impresos.

alter table public.accounts add column einvoice_email text;
comment on column public.accounts.einvoice_email is 'Correo al que el cliente recibe la factura electrónica. Sale impreso en cotizaciones y pedidos.';

alter table public.contacts add column contact_role text;
comment on column public.contacts.contact_role is 'Rol del contacto en su empresa (Compras, Logística, Financiero…). Sale impreso junto a su nombre.';

alter table public.opportunities
  add column project_segment text,
  add column sale_type text not null default 'Estándar' check (sale_type in ('Estándar', 'Carpintería de Obra'));
comment on column public.opportunities.project_segment is 'Segmento de obra (Canal Constructores). Lo trae la cotización.';
comment on column public.opportunities.sale_type is 'Estándar o Carpintería de Obra. Lo trae la cotización.';

alter table public.quotes
  add column project_segment text,
  add column sale_type text not null default 'Estándar' check (sale_type in ('Estándar', 'Carpintería de Obra')),
  add column validity_days smallint not null default 30 check (validity_days in (15, 30, 60)),
  add column end_customer_name text,
  add column end_customer_tax_id text,
  add column delivery_city text,
  add column renewed_from_id uuid,
  add constraint quotes_renewed_from_id_fkey foreign key (renewed_from_id) references public.quotes (id) on delete set null;
create index quotes_renewed_from_idx on public.quotes (renewed_from_id) where renewed_from_id is not null;
comment on column public.quotes.validity_days is 'Validez de la oferta en días calendario desde la fecha de la cotización: 15, 30 o 60. «Válida hasta» se calcula con ella.';
comment on column public.quotes.end_customer_name is 'Cliente final, cuando el despacho va al cliente de nuestro distribuidor.';
comment on column public.quotes.delivery_city is 'Ciudad de entrega. Si se deja vacía, la de la cuenta.';
comment on column public.quotes.renewed_from_id is 'Cotización vencida que esta renueva (la anterior queda Reemplazada).';

alter table public.orders
  add column project_segment text,
  add column sale_type text not null default 'Estándar' check (sale_type in ('Estándar', 'Carpintería de Obra')),
  add column end_customer_name text,
  add column end_customer_tax_id text,
  add column delivery_city text,
  add column logistics_contact_id uuid,
  add column finance_contact_id uuid,
  add column delivery_type text,
  add column lift_service boolean not null default false,
  add column delivery_floor text,
  add column delivery_access text,
  add column is_sample boolean not null default false,
  add constraint orders_logistics_contact_id_fkey foreign key (logistics_contact_id) references public.contacts (id) on delete set null,
  add constraint orders_finance_contact_id_fkey foreign key (finance_contact_id) references public.contacts (id) on delete set null;
comment on column public.orders.logistics_contact_id is 'Contacto que recibe el despacho.';
comment on column public.orders.finance_contact_id is 'Contacto de tesorería o financiero.';
comment on column public.orders.lift_service is 'El pedido incluye servicio de subida (p. ej. hidromasajes).';

-- ---------------------------------------------------------------------------
-- Cotización: validez, ciudad de entrega, segmento y tipo
-- ---------------------------------------------------------------------------
-- Corre después de quotes_defaults (orden alfabético), cuando la cuenta ya está resuelta.
create or replace function public.quote_details()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acc public.accounts%rowtype;
  v_constructor boolean;
  v_today date := (now() at time zone 'America/Bogota')::date;
begin
  select * into v_acc from public.accounts where id = new.account_id;
  v_constructor := coalesce(v_acc.industry = 'Canal Constructores', false);

  -- «Válida hasta» no se escribe: son los días de validez contados desde la fecha de la cotización.
  new.expiration_date := (coalesce(new.created_at, now()) at time zone 'America/Bogota')::date + new.validity_days;

  if nullif(trim(new.delivery_city), '') is null then
    new.delivery_city := coalesce(nullif(trim(v_acc.shipping_city), ''), nullif(trim(v_acc.billing_city), ''));
  end if;

  -- El segmento de obra y la Carpintería de Obra son del Canal Constructores.
  if not v_constructor then
    new.project_segment := null;
    new.sale_type := 'Estándar';
  elsif tg_op = 'INSERT' and new.project_segment is null then
    select o.project_segment into new.project_segment from public.opportunities o where o.id = new.opportunity_id;
  end if;

  if new.sale_type = 'Estándar' and tg_op = 'UPDATE' and old.sale_type <> 'Estándar'
     and exists (select 1 from public.quote_line_items l where l.quote_id = new.id and l.product_id is null) then
    raise exception 'Esta cotización tiene tipologías sin producto del catálogo: quítalas antes de pasarla a Estándar.' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status in ('En revisión', 'Aprobada', 'Presentada', 'Aceptada') and old.status = 'Borrador' then
      if v_constructor and nullif(trim(new.project_segment), '') is null then
        raise exception 'Elige el segmento de obra antes de pasar la cotización a «%».', new.status using errcode = '23514';
      end if;
      if new.delivery_city is null then
        raise exception 'Indica la ciudad de entrega antes de pasar la cotización a «%».', new.status using errcode = '23514';
      end if;
    end if;
    if new.status = 'Aceptada' and new.expiration_date < v_today then
      raise exception 'La cotización % venció el %: renuévala para poder aceptarla.',
        new.quote_number, to_char(new.expiration_date, 'DD/MM/YYYY') using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.quote_details() from public, anon, authenticated;
create trigger quotes_details before insert or update on public.quotes
  for each row execute function public.quote_details();

-- El segmento y el tipo de la cotización pasan a su oportunidad (también a la que recibe una parte separada).
create or replace function public.quote_segment_to_opportunity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.opportunities o
    set project_segment = coalesce(new.project_segment, o.project_segment), sale_type = new.sale_type
    where o.id = new.opportunity_id
      and (o.sale_type is distinct from new.sale_type
           or (new.project_segment is not null and o.project_segment is distinct from new.project_segment));
  return null;
end;
$$;
revoke execute on function public.quote_segment_to_opportunity() from public, anon, authenticated;
create trigger quotes_segment_to_opportunity after insert or update of project_segment, sale_type, opportunity_id on public.quotes
  for each row execute function public.quote_segment_to_opportunity();

-- ---------------------------------------------------------------------------
-- Líneas sin producto del catálogo: solo en Carpintería de Obra y con su tipología escrita
-- ---------------------------------------------------------------------------
create or replace function public.free_line_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
begin
  if new.product_id is not null then
    return new;
  end if;
  if nullif(trim(new.description), '') is null then
    raise exception 'Escribe la tipología de la línea (p. ej. «Cocina en L · Apto tipo B»).' using errcode = '23514';
  end if;
  if tg_table_name = 'quote_line_items' then
    select q.sale_type into v_type from public.quotes q where q.id = new.quote_id;
  else
    select o.sale_type into v_type from public.orders o where o.id = new.order_id;
  end if;
  if v_type is distinct from 'Carpintería de Obra' then
    raise exception 'Solo los documentos de Carpintería de Obra admiten líneas sin producto del catálogo.' using errcode = '23514';
  end if;
  new.description := trim(new.description);
  return new;
end;
$$;
revoke execute on function public.free_line_check() from public, anon, authenticated;
create trigger quote_line_items_free before insert on public.quote_line_items
  for each row execute function public.free_line_check();
create trigger order_items_free before insert on public.order_items
  for each row execute function public.free_line_check();

-- ---------------------------------------------------------------------------
-- Pedido: hereda de la cotización y se completa antes de activarlo
-- ---------------------------------------------------------------------------
create or replace function public.order_details()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acc public.accounts%rowtype;
  v_constructor boolean;
begin
  select * into v_acc from public.accounts where id = new.account_id;
  v_constructor := coalesce(v_acc.industry = 'Canal Constructores', false);

  if nullif(trim(new.delivery_city), '') is null then
    new.delivery_city := coalesce(nullif(trim(v_acc.shipping_city), ''), nullif(trim(v_acc.billing_city), ''));
  end if;
  if not v_constructor then
    new.project_segment := null;
    new.sale_type := 'Estándar';
  elsif tg_op = 'INSERT' and new.project_segment is null and new.opportunity_id is not null then
    select o.project_segment into new.project_segment from public.opportunities o where o.id = new.opportunity_id;
  end if;

  if new.sale_type = 'Estándar' and tg_op = 'UPDATE' and old.sale_type <> 'Estándar'
     and exists (select 1 from public.order_items l where l.order_id = new.id and l.product_id is null) then
    raise exception 'Este pedido tiene tipologías sin producto del catálogo: quítalas antes de pasarlo a Estándar.' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and old.status = 'Borrador' and new.status not in ('Borrador', 'Cancelado') then
    if nullif(trim(new.shipping_address), '') is null or new.delivery_city is null then
      raise exception 'Completa la dirección y la ciudad de entrega antes de activar el pedido.' using errcode = '23514';
    end if;
    if v_constructor and nullif(trim(new.project_segment), '') is null then
      raise exception 'Elige el segmento de obra antes de activar el pedido.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.order_details() from public, anon, authenticated;
create trigger orders_details before insert or update on public.orders
  for each row execute function public.order_details();

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
                             description, owner_id, project_segment, sale_type, end_customer_name, end_customer_tax_id,
                             delivery_city)
  values (q.name, q.account_id, q.opportunity_id, q.id, q.contact_id, q.price_book_id, q.bill_to_name,
          q.billing_address, q.shipping_address, q.payment_terms, q.delivery_terms, q.tax_rate, q.shipping,
          q.description, coalesce(q.owner_id, auth.uid()), q.project_segment, q.sale_type, q.end_customer_name,
          q.end_customer_tax_id, q.delivery_city)
  returning id into v_id;

  insert into public.order_items (order_id, product_id, description, quantity, unit_price, discount, sort_order)
  select v_id, product_id, description, quantity, unit_price, discount, sort_order
  from public.quote_line_items where quote_id = p_quote;
  return v_id;
end;
$$;
revoke execute on function public.create_order_from_quote(uuid) from public, anon;
grant execute on function public.create_order_from_quote(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Renovar una cotización vencida
-- ---------------------------------------------------------------------------
-- Crea otra cotización con fecha de hoy y los precios de la lista vigente (las tipologías conservan su valor) y
-- deja la vencida como Reemplazada. Corre con los permisos de quien la pide.
create or replace function public.renew_quote(p_quote uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  q public.quotes%rowtype;
  v_id uuid;
  v_today date := (now() at time zone 'America/Bogota')::date;
begin
  select * into q from public.quotes where id = p_quote;
  if not found then
    raise exception 'Cotización no encontrada';
  end if;
  if q.status not in ('Borrador', 'Aprobada', 'Presentada') then
    raise exception 'Solo se renuevan cotizaciones en Borrador, Aprobada o Presentada (esta está «%»).', q.status using errcode = '23514';
  end if;
  if q.expiration_date >= v_today then
    raise exception 'La cotización % sigue vigente hasta el %.', q.quote_number, to_char(q.expiration_date, 'DD/MM/YYYY') using errcode = '23514';
  end if;

  insert into public.quotes (name, opportunity_id, account_id, contact_id, status, validity_days, tax_rate, shipping,
                             shipping_manual, shipping_address, payment_terms_manual, payment_terms, delivery_terms,
                             incoterm, description, owner_id, project_segment, sale_type, end_customer_name,
                             end_customer_tax_id, delivery_city, custom_fields, renewed_from_id)
  values (q.name, q.opportunity_id, q.account_id, q.contact_id, 'Borrador', q.validity_days, q.tax_rate, q.shipping,
          q.shipping_manual, q.shipping_address, q.payment_terms_manual, q.payment_terms, q.delivery_terms,
          q.incoterm, q.description, coalesce(q.owner_id, auth.uid()), q.project_segment, q.sale_type, q.end_customer_name,
          q.end_customer_tax_id, q.delivery_city, q.custom_fields, q.id)
  returning id into v_id;

  insert into public.quote_line_items (quote_id, product_id, description, quantity, unit_price, discount, sort_order)
  select v_id, l.product_id, l.description, l.quantity,
         case when l.product_id is null then l.unit_price
              else coalesce((public.quote_line_price(v_id, l.product_id) ->> 'unit_price')::numeric, l.unit_price) end,
         l.discount, l.sort_order
  from public.quote_line_items l where l.quote_id = p_quote
  order by l.sort_order;

  update public.quotes set status = 'Reemplazada' where id = p_quote;
  return v_id;
end;
$$;
revoke execute on function public.renew_quote(uuid) from public, anon;
grant execute on function public.renew_quote(uuid) to authenticated;
