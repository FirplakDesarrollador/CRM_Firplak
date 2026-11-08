-- Listas de precios por mercado, además del canal (decisiones de Luis, 7 nov 2026).
--
--   · Cada lista es del mercado Nacional (COP) o Internacional (USD): la moneda la fija el mercado.
--   · Una cotización o un pedido usa, siempre dentro del mercado de la cuenta:
--       1. la lista propia del cliente (si es de su mercado);
--       2. la lista del canal de la cuenta en su mercado;
--       3. solo en el mercado Nacional: la lista general nacional (sin canal).
--     Nunca cruza de mercado, de canal ni de moneda. Sin lista compatible se bloquea hasta crearla; el
--     mercado Internacional no usa una lista general (p. ej. «Lista exportación USD» queda sin uso hasta
--     que se le asigne un canal).
--   · La marca «estándar» deja de decidir la lista.
--   · Al cambiar el mercado de una cuenta: sus cotizaciones en Borrador sin productos pasan a la moneda y la
--     lista nuevas (y sus oportunidades abiertas las siguen); las que tienen productos quedan para revisión
--     (no admiten productos nuevos hasta pasarlas); las presentadas y los pedidos no cambian.

-- ---------------------------------------------------------------------------
-- Mercado y moneda
-- ---------------------------------------------------------------------------
create or replace function public.market_of(p_market text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case when p_market = 'Internacional' then 'Internacional' else 'Nacional' end;
$$;
revoke execute on function public.market_of(text) from public, anon;
grant execute on function public.market_of(text) to authenticated;

create or replace function public.market_currency(p_market text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case when p_market = 'Internacional' then 'USD' else 'COP' end;
$$;
revoke execute on function public.market_currency(text) from public, anon;
grant execute on function public.market_currency(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Listas: mercado obligatorio; la moneda sale del mercado
-- ---------------------------------------------------------------------------
alter table public.price_books add column market text;
update public.price_books set market = case when currency = 'USD' then 'Internacional' else 'Nacional' end;
alter table public.price_books
  alter column market set not null,
  add constraint price_books_market_check check (market in ('Nacional', 'Internacional')),
  add constraint price_books_market_currency check (currency = public.market_currency(market));
comment on column public.price_books.market is 'Mercado de la lista (Nacional en COP, Internacional en USD). La moneda sale del mercado.';
comment on column public.price_books.channel is 'Canal de venta de la lista (una por mercado y canal). Sin canal: lista general (solo se usa en el mercado Nacional).';
comment on column public.price_books.is_standard is 'Sin uso desde 2026-12-02: la lista la deciden el mercado y el canal de la cuenta.';

drop index public.price_books_one_per_channel;
create unique index price_books_one_per_market_channel on public.price_books (market, channel) where channel is not null and is_active;
create unique index price_books_one_general_per_market on public.price_books (market) where channel is null and not is_client_list and is_active;

create or replace function public.price_book_market()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.market := coalesce(new.market, case when new.currency = 'USD' then 'Internacional' else 'Nacional' end);
  new.currency := public.market_currency(new.market);
  if tg_op = 'UPDATE' and new.market <> old.market
     and exists (select 1 from public.accounts a where a.price_book_id = new.id and public.market_of(a.market) <> new.market) then
    raise exception 'La lista «%» está asignada a cuentas del mercado %: quítasela antes de cambiarle el mercado.', new.name, old.market
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function public.price_book_market() from public, anon, authenticated;
create trigger price_books_market before insert or update on public.price_books
  for each row execute function public.price_book_market();

-- ---------------------------------------------------------------------------
-- Selección de la lista
-- ---------------------------------------------------------------------------
-- La lista del canal de la cuenta en su mercado; en el mercado Nacional, si no hay, la general nacional.
create or replace function public.channel_price_book(p_account uuid, p_currency text)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select b.id
  from public.accounts a
  join public.price_books b on b.is_active and not b.is_client_list
    and b.market = public.market_of(a.market) and b.currency = p_currency
    and (b.channel = a.industry or (b.channel is null and b.market = 'Nacional'))
  where a.id = p_account
  order by (b.channel is not null) desc, b.name
  limit 1;
$$;

-- La lista propia del cliente (de su mercado) o, si no, la de su canal.
create or replace function public.default_price_book(p_account uuid, p_currency text)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (select b.id from public.accounts a join public.price_books b on b.id = a.price_book_id
     where a.id = p_account and b.is_active and b.is_client_list
       and b.market = public.market_of(a.market) and b.currency = p_currency),
    public.channel_price_book(p_account, p_currency)
  );
$$;

-- Por qué una lista no sirve para una cuenta (null si sirve).
create or replace function public.price_book_problem(p_book uuid, p_account uuid)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when b.id is null then 'La lista de precios no existe.'
    when not b.is_active then format('La lista «%s» está inactiva.', b.name)
    when b.market <> public.market_of(a.market) then
      format('La lista «%s» es del mercado %s y la cuenta «%s» es del mercado %s.', b.name, b.market, a.name, public.market_of(a.market))
    when b.is_client_list and a.price_book_id is distinct from b.id then
      format('La lista «%s» es la lista propia de otro cliente.', b.name)
    when not b.is_client_list and b.channel is null and b.market = 'Internacional' then
      format('La lista «%s» no tiene canal: en el mercado Internacional cada canal necesita su propia lista.', b.name)
    when not b.is_client_list and b.channel is not null and b.channel is distinct from a.industry then
      format('La lista «%s» es del %s y la cuenta «%s» es del %s.', b.name, b.channel, a.name, coalesce(a.industry, 'canal sin definir'))
  end
  from public.accounts a
  left join public.price_books b on b.id = p_book
  where a.id = p_account;
$$;

create or replace function public.missing_price_book_message(p_account uuid)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select format('No hay una lista de precios activa para el mercado %s y el %s%s. Pide a administración crearla en Productos → Listas de precios.',
    public.market_of(a.market), coalesce(a.industry, 'canal de la cuenta (sin definir)'),
    case when public.market_of(a.market) = 'Nacional' then ' (o una lista general nacional)' else '' end)
  from public.accounts a
  where a.id = p_account;
$$;

revoke execute on function public.price_book_problem(uuid, uuid) from public, anon;
grant execute on function public.price_book_problem(uuid, uuid) to authenticated;
revoke execute on function public.missing_price_book_message(uuid) from public, anon;
grant execute on function public.missing_price_book_message(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Oportunidad abierta: sigue el mercado de su cuenta si nada se cotizó ni pidió en la moneda anterior
-- ---------------------------------------------------------------------------
create or replace function public.opportunity_follow_market(p_opp uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_opp record;
  v_currency text;
  v_rate numeric;
begin
  select o.id, o.currency, o.amount, o.is_closed, a.market into v_opp
  from public.opportunities o join public.accounts a on a.id = o.account_id
  where o.id = p_opp;
  if not found or v_opp.is_closed then
    return;
  end if;
  v_currency := public.market_currency(v_opp.market);
  if v_opp.currency = v_currency then
    return;
  end if;
  -- Los borradores sin productos no cuentan: pasan solos a la moneda nueva.
  if exists (select 1 from public.quotes q
             where q.opportunity_id = p_opp and q.currency <> v_currency
               and (q.status <> 'Borrador' or exists (select 1 from public.quote_line_items l where l.quote_id = q.id)))
     or exists (select 1 from public.orders d where d.opportunity_id = p_opp) then
    return;
  end if;
  if v_currency = 'COP' then
    update public.opportunities set currency = 'COP' where id = p_opp;
  else
    v_rate := public.exchange_rate_on(v_currency);
    if v_rate is null or v_rate = 0 then
      return;
    end if;
    update public.opportunities set currency = v_currency, foreign_amount = round(coalesce(v_opp.amount, 0) / v_rate, 2)
    where id = p_opp;
  end if;
end;
$$;
revoke execute on function public.opportunity_follow_market(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cotizaciones y pedidos: moneda del mercado de la cuenta y lista compatible
-- ---------------------------------------------------------------------------
create or replace function public.document_currency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc jsonb := to_jsonb(new);
  v_quote record;
  v_market text;
  v_opp_currency text;
  v_problem text;
begin
  if tg_op = 'INSERT' then
    if v_doc ->> 'quote_id' is not null then
      -- Un pedido creado desde una cotización conserva su moneda y su lista.
      select q.currency, q.price_book_id into v_quote from public.quotes q where q.id = (v_doc ->> 'quote_id')::uuid;
      new.currency := v_quote.currency;
      new.price_book_id := v_quote.price_book_id;
    else
      select public.market_of(a.market) into v_market from public.accounts a where a.id = new.account_id;
      v_market := coalesce(v_market, 'Nacional');
      new.currency := public.market_currency(v_market);
      if new.opportunity_id is not null then
        select o.currency into v_opp_currency from public.opportunities o where o.id = new.opportunity_id;
        if v_opp_currency is distinct from new.currency then
          raise exception 'La oportunidad está en % y la cuenta es del mercado % (%): revisa la oportunidad antes de continuar.',
            v_opp_currency, v_market, new.currency using errcode = '23514';
        end if;
      end if;
      -- Una lista heredada (p. ej. de la oportunidad) que no corresponde se reemplaza por la que corresponde.
      if new.price_book_id is not null and public.price_book_problem(new.price_book_id, new.account_id) is not null then
        new.price_book_id := null;
      end if;
      new.price_book_id := coalesce(new.price_book_id, public.default_price_book(new.account_id, new.currency));
      if new.price_book_id is null then
        raise exception '%', public.missing_price_book_message(new.account_id) using errcode = '23514';
      end if;
    end if;
  elsif tg_table_name = 'quotes' and new.status = 'Borrador'
        and public.market_currency((select a.market from public.accounts a where a.id = new.account_id)) <> old.currency
        and not exists (select 1 from public.quote_line_items l where l.quote_id = new.id) then
    -- Borrador sin productos de una cuenta que cambió de mercado: pasa a la moneda y la lista nuevas.
    new.currency := public.market_currency((select a.market from public.accounts a where a.id = new.account_id));
    new.price_book_id := public.default_price_book(new.account_id, new.currency);
    if new.price_book_id is null then
      raise exception '%', public.missing_price_book_message(new.account_id) using errcode = '23514';
    end if;
    perform public.opportunity_follow_market(new.opportunity_id);
  else
    new.currency := old.currency;
    if new.price_book_id is distinct from old.price_book_id then
      v_problem := public.price_book_problem(new.price_book_id, new.account_id);
      if v_problem is not null then
        raise exception '%', v_problem using errcode = '23514';
      end if;
    end if;
  end if;
  if new.currency <> 'COP' then
    new.tax_rate := 0;
    new.tax := 0;
    new.grand_total := new.net_total + new.shipping;
  end if;
  return new;
end;
$$;

-- Un borrador que quedó en la moneda anterior no admite productos nuevos hasta pasarlo a la lista nueva.
create or replace function public.quote_line_market_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
begin
  select q.quote_number, q.status, q.currency, a.name, public.market_of(a.market) market into v
  from public.quotes q join public.accounts a on a.id = q.account_id
  where q.id = new.quote_id;
  if found and v.status = 'Borrador' and public.market_currency(v.market) <> v.currency then
    raise exception 'La cuenta «%» ahora es del mercado % (%) y la cotización % está en %: quita sus productos para pasarla a la lista nueva, o crea otra cotización.',
      v.name, v.market, public.market_currency(v.market), v.quote_number, v.currency using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function public.quote_line_market_check() from public, anon, authenticated;
create trigger quote_line_items_market before insert on public.quote_line_items
  for each row execute function public.quote_line_market_check();

-- Sincronizar solo entre cotización y oportunidad de la misma moneda.
create or replace function public.sync_quote(p_quote uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_opp uuid;
  v_net numeric;
  v_currency text;
  v_opp_currency text;
begin
  select opportunity_id, net_total, currency into v_opp, v_net, v_currency from public.quotes where id = p_quote;
  if v_opp is null then
    raise exception 'Cotización no encontrada';
  end if;
  select currency into v_opp_currency from public.opportunities where id = v_opp;
  if v_opp_currency is distinct from v_currency then
    raise exception 'La cotización está en % y la oportunidad en %: revísalas antes de sincronizar.', v_currency, v_opp_currency
      using errcode = '23514';
  end if;
  update public.quotes set is_synced = false where opportunity_id = v_opp and id <> p_quote and is_synced;
  update public.quotes set is_synced = true where id = p_quote;
  if v_currency = 'COP' then
    update public.opportunities set amount = v_net where id = v_opp;
  else
    update public.opportunities set foreign_amount = v_net where id = v_opp;
  end if;
  if not found then
    raise exception 'No tienes permiso para actualizar la oportunidad' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cuentas: lista propia del mismo mercado; al cambiar de mercado, los borradores y oportunidades la siguen
-- ---------------------------------------------------------------------------
create or replace function public.account_price_book_market()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_book public.price_books%rowtype;
begin
  if new.price_book_id is null then
    return new;
  end if;
  select * into v_book from public.price_books where id = new.price_book_id;
  if not v_book.is_client_list then
    raise exception 'La lista «%» no es una lista de cliente: la lista propia de una cuenta debe ser una lista de cliente.', v_book.name
      using errcode = '23514';
  end if;
  if v_book.market <> public.market_of(new.market) then
    raise exception 'La lista propia «%» es del mercado % y la cuenta es del mercado %: %', v_book.name, v_book.market, public.market_of(new.market),
      case when tg_op = 'UPDATE' and new.market is distinct from old.market and new.price_book_id = old.price_book_id
        then 'quítala o asigna una del mercado nuevo antes de cambiar el mercado.'
        else 'elige una lista del mismo mercado.' end
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function public.account_price_book_market() from public, anon, authenticated;
create trigger accounts_price_book_market before insert or update of price_book_id, market on public.accounts
  for each row execute function public.account_price_book_market();

create or replace function public.account_market_moves_documents()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_currency text := public.market_currency(new.market);
begin
  if public.market_of(new.market) = public.market_of(old.market) then
    return null;
  end if;
  -- Borradores sin productos: pasan a la moneda y la lista nuevas si ya hay una compatible (si no, quedan
  -- bloqueados hasta crearla).
  if public.default_price_book(new.id, v_currency) is not null then
    update public.quotes q set updated_at = now()
    where q.account_id = new.id and q.status = 'Borrador' and q.currency <> v_currency
      and not exists (select 1 from public.quote_line_items l where l.quote_id = q.id);
  end if;
  -- Oportunidades abiertas sin nada cotizado ni pedido en la moneda anterior.
  perform public.opportunity_follow_market(o.id) from public.opportunities o where o.account_id = new.id and not o.is_closed;
  return null;
end;
$$;
revoke execute on function public.account_market_moves_documents() from public, anon, authenticated;
create trigger accounts_market_moves_documents after update of market on public.accounts
  for each row execute function public.account_market_moves_documents();
