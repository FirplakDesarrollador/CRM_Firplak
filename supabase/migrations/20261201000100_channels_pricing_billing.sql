-- Firplak CRM · Canales de venta: pipeline y lista de precios por canal, lista propia de la cuenta,
-- condiciones de pago en la cuenta y «Facturar a» = la cuenta en las cotizaciones.
--
-- El Canal es el campo «Canal» de la cuenta (columna `industry`; en producción: Canal Constructores,
-- Canal Distribución, Canal B2C).
--   · Pipelines: cada canal tiene su pipeline (`pipelines.channel`). Una oportunidad de una cuenta con canal
--     va al pipeline de ese canal: al crearla o cambiarle la cuenta, la etapa se lleva a la equivalente del
--     pipeline del canal; si cambia el canal de la cuenta, sus oportunidades abiertas se mueven.
--   · Listas de precios: una lista puede ser de un canal (`price_books.channel`, una por canal y moneda) o
--     «de cliente» (`is_client_list`), que se asigna a una o varias cuentas (`accounts.price_book_id`) con sus
--     productos codificados y sus precios. La cotización usa la lista del cliente; si no tiene, la del canal;
--     si no, la estándar. Un producto que no está en la lista del cliente toma el precio de la lista del canal
--     y la línea queda marcada «No codificado» (`quote_line_items.not_listed`).
--   · Cotizaciones: «Facturar a» es la cuenta y debe ser la de la oportunidad. Dirección de facturación,
--     dirección de entrega y condiciones de pago se toman de la cuenta (mientras la cotización está en
--     Borrador siguen a la cuenta); la entrega y las condiciones se pueden escribir a mano con su casilla.
--   · Indicadores: un embudo por pipeline (`crm_funnels`).

-- ---------------------------------------------------------------------------
-- Columnas
-- ---------------------------------------------------------------------------
alter table public.pipelines add column channel text;
comment on column public.pipelines.channel is 'Canal de venta (valor del campo Canal de la cuenta) cuyas oportunidades van a este pipeline.';
create unique index pipelines_one_per_channel on public.pipelines (channel) where channel is not null and is_active;

alter table public.price_books
  add column channel text,
  add column is_client_list boolean not null default false,
  add constraint price_books_client_without_channel check (not (is_client_list and channel is not null));
comment on column public.price_books.channel is 'Canal de venta de la lista (una por canal y moneda).';
comment on column public.price_books.is_client_list is 'Lista propia de una o varias cuentas (productos codificados y precios negociados).';
create unique index price_books_one_per_channel on public.price_books (channel, currency) where channel is not null and is_active;

alter table public.accounts
  add column payment_terms text,
  add column price_book_id uuid,
  add constraint accounts_price_book_id_fkey foreign key (price_book_id) references public.price_books (id) on delete set null;
create index accounts_price_book_idx on public.accounts (price_book_id) where price_book_id is not null;

alter table public.quotes
  add column shipping_manual boolean not null default false,
  add column payment_terms_manual boolean not null default false;
comment on column public.quotes.shipping_manual is 'La dirección de entrega se escribió a mano (p. ej. entregar al cliente final u otra bodega).';
comment on column public.quotes.payment_terms_manual is 'Las condiciones de pago se escribieron a mano en lugar de tomarlas de la cuenta.';
-- Las cotizaciones que ya existen conservan lo que se escribió en ellas.
update public.quotes set shipping_manual = true where nullif(trim(shipping_address), '') is not null;
update public.quotes set payment_terms_manual = true where nullif(trim(payment_terms), '') is not null;

alter table public.quote_line_items add column not_listed boolean not null default false;
comment on column public.quote_line_items.not_listed is 'Producto que no está en la lista propia del cliente: se cotiza con el precio de la lista del canal.';

-- ---------------------------------------------------------------------------
-- Listas de precios: la de la cuenta, la de su canal o la estándar
-- ---------------------------------------------------------------------------
-- Lista del canal de la cuenta en la moneda; si no hay, la estándar; si no, una general. Nunca una de cliente.
create or replace function public.channel_price_book(p_account uuid, p_currency text)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select b.id
  from public.price_books b
  left join public.accounts a on a.id = p_account
  where b.is_active and b.currency = p_currency and not b.is_client_list
  order by (b.channel is not null and b.channel = a.industry) desc, b.is_standard desc, (b.channel is null) desc, b.name
  limit 1;
$$;
revoke execute on function public.channel_price_book(uuid, text) from public, anon;
grant execute on function public.channel_price_book(uuid, text) to authenticated;

-- Lista para un documento nuevo: la propia de la cuenta (si es de esa moneda) o la de su canal.
create or replace function public.default_price_book(p_account uuid, p_currency text)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (select b.id from public.accounts a join public.price_books b on b.id = a.price_book_id
     where a.id = p_account and b.is_active and b.currency = p_currency),
    public.channel_price_book(p_account, p_currency)
  );
$$;
revoke execute on function public.default_price_book(uuid, text) from public, anon;
grant execute on function public.default_price_book(uuid, text) to authenticated;

-- Moneda fija desde la creación y lista de precios según la cuenta (propia → canal → estándar). IVA 0 % en USD.
create or replace function public.document_currency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc jsonb := to_jsonb(new);
  v_currency text;
begin
  if tg_op = 'INSERT' then
    if v_doc ->> 'quote_id' is not null then
      select q.currency into v_currency from public.quotes q where q.id = (v_doc ->> 'quote_id')::uuid;
    end if;
    if v_currency is null and new.opportunity_id is not null then
      select o.currency into v_currency from public.opportunities o where o.id = new.opportunity_id;
    end if;
    if v_currency is null and new.account_id is not null then
      select case when a.market = 'Internacional' then 'USD' else 'COP' end into v_currency from public.accounts a where a.id = new.account_id;
    end if;
    new.currency := coalesce(v_currency, 'COP');
    if new.price_book_id is null or (select b.currency from public.price_books b where b.id = new.price_book_id) <> new.currency then
      new.price_book_id := coalesce(public.default_price_book(new.account_id, new.currency), new.price_book_id);
    end if;
  else
    new.currency := old.currency;
  end if;
  if new.currency <> 'COP' then
    new.tax_rate := 0;
    new.tax := 0;
    new.grand_total := new.net_total + new.shipping;
  end if;
  return new;
end;
$$;

-- Pedidos: ya no toman la lista estándar por su cuenta (la elige document_currency según la cuenta).
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

-- Precio de un producto para una cotización: de su lista; si la lista es la propia del cliente y el producto no
-- está codificado, de la lista del canal (source = 'canal'). Sin precio: unit_price null.
create or replace function public.quote_line_price(p_quote uuid, p_product uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_book uuid;
  v_account uuid;
  v_currency text;
  v_client uuid;
  v_fallback uuid;
  v_price numeric;
begin
  select q.price_book_id, q.account_id, q.currency into v_book, v_account, v_currency from public.quotes q where q.id = p_quote;
  if not found then
    return null;
  end if;
  select e.unit_price into v_price from public.price_book_entries e
  where e.price_book_id = v_book and e.product_id = p_product and e.is_active;
  if v_price is not null then
    return jsonb_build_object('unit_price', v_price, 'source', 'lista');
  end if;
  select a.price_book_id into v_client from public.accounts a where a.id = v_account;
  if v_client is not null and v_client = v_book then
    v_fallback := public.channel_price_book(v_account, v_currency);
    select e.unit_price into v_price from public.price_book_entries e
    where e.price_book_id = v_fallback and e.product_id = p_product and e.is_active;
    if v_price is not null then
      return jsonb_build_object('unit_price', v_price, 'source', 'canal',
                                'price_book', (select b.name from public.price_books b where b.id = v_fallback));
    end if;
  end if;
  return jsonb_build_object('unit_price', null);
end;
$$;
revoke execute on function public.quote_line_price(uuid, uuid) from public, anon;
grant execute on function public.quote_line_price(uuid, uuid) to authenticated;

-- «No codificado»: la cotización usa la lista propia del cliente y el producto no está en ella.
create or replace function public.quote_line_listed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_book uuid;
  v_client uuid;
begin
  select q.price_book_id, a.price_book_id into v_book, v_client
  from public.quotes q left join public.accounts a on a.id = q.account_id
  where q.id = new.quote_id;
  new.not_listed := v_client is not null and v_book = v_client and new.product_id is not null
    and not exists (select 1 from public.price_book_entries e
                    where e.price_book_id = v_book and e.product_id = new.product_id and e.is_active);
  return new;
end;
$$;
revoke execute on function public.quote_line_listed() from public, anon, authenticated;
create trigger quote_line_items_listed before insert or update of product_id on public.quote_line_items
  for each row execute function public.quote_line_listed();

-- ---------------------------------------------------------------------------
-- Cotizaciones: «Facturar a» = la cuenta de la oportunidad; direcciones y condiciones desde la cuenta
-- ---------------------------------------------------------------------------
create or replace function public.format_address(p_street text, p_city text, p_state text, p_country text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(concat_ws(', ', nullif(trim(p_street), ''), nullif(trim(p_city), ''), nullif(trim(p_state), ''),
                          nullif(trim(p_country), '')), '');
$$;
revoke execute on function public.format_address(text, text, text, text) from public, anon;
grant execute on function public.format_address(text, text, text, text) to authenticated;

create or replace function public.quote_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_opp public.opportunities%rowtype;
  v_acc public.accounts%rowtype;
  v_refresh boolean;
begin
  select * into v_opp from public.opportunities where id = new.opportunity_id;
  if new.account_id is null then new.account_id := v_opp.account_id; end if;
  if tg_op = 'INSERT' or new.account_id is distinct from old.account_id or new.opportunity_id is distinct from old.opportunity_id then
    if v_opp.account_id is null then
      raise exception 'La oportunidad «%» no tiene cuenta: asígnale la cuenta antes de cotizar.', v_opp.name using errcode = '23514';
    end if;
    if new.account_id <> v_opp.account_id then
      raise exception 'La cuenta de «Facturar a» debe ser la misma de la oportunidad (%).',
        (select a.name from public.accounts a where a.id = v_opp.account_id) using errcode = '23514';
    end if;
  end if;
  if new.contact_id is null then new.contact_id := v_opp.contact_id; end if;
  if new.price_book_id is null then new.price_book_id := v_opp.price_book_id; end if;

  -- Mientras está en Borrador, la cotización sigue los datos de la cuenta; después quedan como se presentaron.
  select * into v_acc from public.accounts where id = new.account_id;
  v_refresh := tg_op = 'INSERT' or new.account_id is distinct from old.account_id or new.status = 'Borrador';
  if v_refresh then
    new.bill_to_name := v_acc.name;
    new.billing_address := public.format_address(v_acc.billing_street, v_acc.billing_city, v_acc.billing_state, v_acc.billing_country);
  end if;
  if not new.shipping_manual and (v_refresh or old.shipping_manual) then
    new.shipping_address := coalesce(
      public.format_address(v_acc.shipping_street, v_acc.shipping_city, v_acc.shipping_state, v_acc.shipping_country),
      public.format_address(v_acc.billing_street, v_acc.billing_city, v_acc.billing_state, v_acc.billing_country));
  end if;
  if not new.payment_terms_manual and (v_refresh or old.payment_terms_manual) then
    new.payment_terms := v_acc.payment_terms;
  end if;

  if tg_op = 'UPDATE' and (new.tax_rate is distinct from old.tax_rate or new.shipping is distinct from old.shipping) then
    new.tax := round(new.net_total * new.tax_rate / 100.0, 2);
    new.grand_total := new.net_total + new.tax + new.shipping;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Oportunidades: el pipeline del canal de la cuenta
-- ---------------------------------------------------------------------------
create or replace function public.channel_pipeline(p_account uuid)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id from public.accounts a
  join public.pipelines p on p.channel = a.industry and p.is_active
  where a.id = p_account
  limit 1;
$$;
revoke execute on function public.channel_pipeline(uuid) from public, anon;
grant execute on function public.channel_pipeline(uuid) to authenticated;

-- Etapa equivalente en otro pipeline: del mismo tipo (abierta, ganada, perdida) y con la probabilidad más
-- cercana; si el pipeline no tiene de ese tipo, su primera etapa abierta.
create or replace function public.equivalent_stage(p_stage uuid, p_pipeline uuid)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (select t.id from public.pipeline_stages s
     join public.pipeline_stages t on t.pipeline_id = p_pipeline and t.category = s.category
     where s.id = p_stage
     order by abs(t.probability - s.probability), t.sort_order
     limit 1),
    (select t.id from public.pipeline_stages t where t.pipeline_id = p_pipeline and t.category = 'open'
     order by t.sort_order limit 1)
  );
$$;
revoke execute on function public.equivalent_stage(uuid, uuid) from public, anon, authenticated;

-- Corre antes de opportunities_sync_stage (orden alfabético): deja etapa y pipeline en el del canal.
create or replace function public.opportunity_channel_pipeline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target uuid;
  v_stage_pipeline uuid;
begin
  v_target := public.channel_pipeline(new.account_id);
  if v_target is null then
    return new;
  end if;
  select s.pipeline_id into v_stage_pipeline from public.pipeline_stages s where s.id = new.stage_id;
  if v_stage_pipeline = v_target then
    new.pipeline_id := v_target;
    return new;
  end if;
  if tg_op = 'INSERT' or new.account_id is distinct from old.account_id then
    new.stage_id := public.equivalent_stage(new.stage_id, v_target);
    new.pipeline_id := v_target;
    return new;
  end if;
  -- Una oportunidad antigua que quedó en otro pipeline puede seguir moviéndose dentro de él.
  if v_stage_pipeline = old.pipeline_id then
    return new;
  end if;
  raise exception 'La etapa elegida no es del pipeline «%», el del canal de la cuenta.',
    (select p.name from public.pipelines p where p.id = v_target) using errcode = '23514';
end;
$$;
revoke execute on function public.opportunity_channel_pipeline() from public, anon, authenticated;
create trigger opportunities_channel_pipeline
  before insert or update of account_id, stage_id, pipeline_id on public.opportunities
  for each row execute function public.opportunity_channel_pipeline();

-- Si cambia el canal de una cuenta, sus oportunidades abiertas pasan al pipeline del nuevo canal.
create or replace function public.account_channel_moves_opportunities()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target uuid;
begin
  if new.industry is distinct from old.industry then
    v_target := public.channel_pipeline(new.id);
    if v_target is not null then
      update public.opportunities o
        set stage_id = public.equivalent_stage(o.stage_id, v_target), pipeline_id = v_target
        where o.account_id = new.id and not o.is_closed and o.pipeline_id is distinct from v_target;
    end if;
  end if;
  return null;
end;
$$;
revoke execute on function public.account_channel_moves_opportunities() from public, anon, authenticated;
create trigger accounts_channel_pipeline after update of industry on public.accounts
  for each row execute function public.account_channel_moves_opportunities();

-- ---------------------------------------------------------------------------
-- Indicadores: un embudo por pipeline (cada canal el suyo, sin mezclar)
-- ---------------------------------------------------------------------------
create or replace function public.crm_funnels(p_from date, p_to date, p_owner uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with
  -- Filtrado por asesor: sus oportunidades con su parte del reparto de ingresos (como crm_dashboard).
  opps as (
    select o.id, o.stage_id, o.close_date,
           o.amount * coalesce(c.percent, 100) / 100 as amount
    from public.opportunities o
    left join public.opportunity_credit c on p_owner is not null and c.opportunity_id = o.id and c.user_id = p_owner
    where p_owner is null or c.user_id is not null
  ),
  stages as (
    select s.pipeline_id, s.id, s.name, s.color, s.sort_order, s.category, s.probability,
           count(o.id) as count,
           coalesce(sum(o.amount), 0) as amount
    from public.pipeline_stages s
    left join opps o on o.stage_id = s.id
      and (s.category = 'open' or o.close_date between p_from and p_to)
    where s.category <> 'lost'
    group by s.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'name', p.name, 'channel', p.channel, 'is_default', p.is_default,
           'stages', (select coalesce(jsonb_agg(row_to_json(st) order by st.sort_order), '[]'::jsonb)
                      from (select id, name, color, sort_order, category, probability, count, amount
                            from stages where pipeline_id = p.id) st))
         order by (p.channel is null), p.sort_order, p.created_at), '[]'::jsonb)
  from public.pipelines p
  where p.is_active;
$$;
revoke execute on function public.crm_funnels(date, date, uuid) from public, anon;
grant execute on function public.crm_funnels(date, date, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Producción: los pipelines y listas que ya existen, a su canal (solo si existe ese valor del Canal)
-- ---------------------------------------------------------------------------
update public.pipelines p set channel = v.channel
from (values ('Proyectos y constructoras', 'Canal Constructores'), ('Distribución y retail', 'Canal Distribución')) as v(name, channel)
where p.name = v.name and p.channel is null
  and exists (select 1 from public.picklist_values pv where pv.object = 'accounts' and pv.field = 'industry' and pv.value = v.channel)
  and not exists (select 1 from public.pipelines x where x.channel = v.channel);

update public.price_books b set channel = v.channel
from (values ('Constructor Nacional', 'Canal Constructores'), ('Distribucion Nacional', 'Canal Distribución')) as v(name, channel)
where b.name = v.name and b.channel is null and b.currency = 'COP'
  and exists (select 1 from public.picklist_values pv where pv.object = 'accounts' and pv.field = 'industry' and pv.value = v.channel)
  and not exists (select 1 from public.price_books x where x.channel = v.channel and x.currency = 'COP');
