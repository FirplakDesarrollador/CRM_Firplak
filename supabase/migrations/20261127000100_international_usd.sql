-- Firplak CRM · Mercado Internacional en dólares y sin IVA.
--   · TRM oficial (Superfinanciera, datos.gov.co): se consulta cada día con pg_cron y la extensión http;
--     el administrador también puede actualizarla o registrarla a mano en Configuración → Monedas.
--   · Oportunidades: la moneda sale sola del Mercado de la cuenta (Internacional → USD, si no → COP).
--     En USD el vendedor registra el «Valor en USD» y el Valor en pesos (amount) se calcula con la TRM del
--     día; así indicadores, metas y pronóstico siguen sumando en pesos. Las abiertas se recalculan con
--     cada TRM nueva; las cerradas conservan la TRM con la que se cerraron.
--   · Cotizaciones y pedidos: toman la moneda de la oportunidad (o de la cuenta), la lista de precios en
--     esa moneda, IVA 0 % en USD e Incoterm. Los totales del tablero se convierten a pesos.

-- ---------------------------------------------------------------------------
-- TRM
-- ---------------------------------------------------------------------------
create table public.exchange_rates (
  currency text not null check (currency ~ '^[A-Z]{3}$' and currency <> 'COP'),
  valid_from date not null,
  valid_to date,
  rate numeric(14, 4) not null check (rate > 0),
  source text not null default 'Manual',
  created_by uuid default auth.uid(),
  fetched_at timestamptz not null default now(),
  primary key (currency, valid_from)
);
comment on table public.exchange_rates is 'Pesos colombianos por unidad de la moneda, vigentes desde valid_from (TRM oficial o registrada a mano).';
alter table public.exchange_rates enable row level security;
create policy "monedas: lectura" on public.exchange_rates for select to authenticated using (true);

-- Pesos por unidad de la moneda en una fecha (hoy en Colombia si no se indica). COP = 1.
create or replace function public.exchange_rate_on(p_currency text, p_date date default null)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case when coalesce(p_currency, 'COP') = 'COP' then 1::numeric else (
    select r.rate from public.exchange_rates r
    where r.currency = p_currency and r.valid_from <= coalesce(p_date, (now() at time zone 'America/Bogota')::date)
    order by r.valid_from desc limit 1) end;
$$;
grant execute on function public.exchange_rate_on(text, date) to authenticated;

create or replace function public.to_cop(p_amount numeric, p_currency text)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select round(p_amount * public.exchange_rate_on(p_currency), 2);
$$;
grant execute on function public.to_cop(numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Oportunidades en USD
-- ---------------------------------------------------------------------------
alter table public.opportunities
  add column foreign_amount numeric(18, 2) check (foreign_amount >= 0),
  add column exchange_rate numeric(14, 4);
comment on column public.opportunities.foreign_amount is 'Valor en la moneda de la oportunidad cuando no es COP (hoy USD).';
comment on column public.opportunities.exchange_rate is 'TRM con la que se calculó el valor en pesos (amount).';

-- Corre después de opportunities_sync_stage (orden alfabético), cuando ya se sabe si está cerrada.
create or replace function public.opportunity_currency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_market text;
  v_rate numeric;
begin
  if tg_op = 'INSERT' or new.account_id is distinct from old.account_id then
    select a.market into v_market from public.accounts a where a.id = new.account_id;
    new.currency := case when v_market = 'Internacional' then 'USD' else 'COP' end;
  end if;
  if new.currency = 'COP' then
    new.foreign_amount := null;
    new.exchange_rate := null;
    return new;
  end if;
  if new.foreign_amount is null then
    if coalesce(new.amount, 0) <> 0 then
      raise exception 'La cuenta es del mercado Internacional: indica el valor en USD.' using errcode = '23514';
    end if;
    new.foreign_amount := 0;
  end if;
  -- Una oportunidad cerrada conserva la TRM con la que se cerró.
  if tg_op = 'UPDATE' and old.is_closed and new.is_closed and old.exchange_rate is not null then
    v_rate := old.exchange_rate;
  else
    v_rate := public.exchange_rate_on(new.currency);
  end if;
  if v_rate is null then
    raise exception 'No hay TRM registrada para convertir % a pesos. Pide al administrador actualizarla en Configuración → Monedas.', new.currency
      using errcode = '23514';
  end if;
  new.exchange_rate := v_rate;
  new.amount := round(new.foreign_amount * v_rate, 2);
  return new;
end;
$$;
create trigger opportunities_usd_amount before insert or update on public.opportunities
  for each row execute function public.opportunity_currency();

-- Con cada TRM nueva, las oportunidades abiertas en USD se recalculan (las bloqueadas por aprobación esperan).
create or replace function public.recalc_foreign_opportunities()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
begin
  update public.opportunities o set exchange_rate = null
  where o.currency <> 'COP' and not o.is_closed
    and o.exchange_rate is distinct from public.exchange_rate_on(o.currency)
    and not public.is_record_locked('opportunities', o.id);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function public.save_exchange_rate(p_currency text, p_from date, p_to date, p_rate numeric, p_source text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.exchange_rates (currency, valid_from, valid_to, rate, source)
  values (p_currency, p_from, p_to, p_rate, p_source)
  on conflict (currency, valid_from) do update
    set valid_to = excluded.valid_to, rate = excluded.rate, source = excluded.source, fetched_at = now(), created_by = auth.uid();
$$;

-- Registro manual (si la Superfinanciera no responde). Solo administradores.
create or replace function public.set_exchange_rate(p_rate numeric, p_currency text default 'USD', p_from date default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_perm('system', 'customize') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_rate is null or p_rate <= 0 then
    raise exception 'La TRM debe ser mayor que cero';
  end if;
  perform public.save_exchange_rate(p_currency, coalesce(p_from, (now() at time zone 'America/Bogota')::date), null, p_rate, 'Manual');
  return public.recalc_foreign_opportunities();
end;
$$;
grant execute on function public.set_exchange_rate(numeric, text, date) to authenticated;

-- TRM oficial de los últimos días desde datos.gov.co. La ejecuta pg_cron sin usuario, o un administrador.
create or replace function public.refresh_exchange_rates()
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status int;
  v_content text;
  r jsonb;
begin
  if auth.uid() is not null and not public.has_perm('system', 'customize') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select h.status, h.content into v_status, v_content
  from extensions.http_get('https://www.datos.gov.co/resource/32sa-8pi3.json?$order=vigenciadesde%20DESC&$limit=10') h;
  if v_status is distinct from 200 then
    raise exception 'La Superfinanciera no respondió (HTTP %). Se conserva la TRM anterior.', v_status;
  end if;
  for r in select * from jsonb_array_elements(v_content::jsonb) loop
    continue when r ->> 'valor' is null or r ->> 'vigenciadesde' is null;
    perform public.save_exchange_rate('USD', (r ->> 'vigenciadesde')::date, (r ->> 'vigenciahasta')::date,
                                      (r ->> 'valor')::numeric, 'Superfinanciera (datos.gov.co)');
  end loop;
  perform public.recalc_foreign_opportunities();
  return public.exchange_rate_on('USD');
end;
$$;
grant execute on function public.refresh_exchange_rates() to authenticated;

-- ---------------------------------------------------------------------------
-- Cotizaciones y pedidos
-- ---------------------------------------------------------------------------
alter table public.quotes add column currency text not null default 'COP', add column incoterm text;
alter table public.orders add column currency text not null default 'COP', add column incoterm text;

insert into public.price_books (name, description, currency, is_standard)
select 'Lista exportación USD', 'Precios en dólares para clientes del mercado Internacional.', 'USD', false
where not exists (select 1 from public.price_books where currency = 'USD');

-- Corre después de *_defaults: moneda fija desde la creación, lista de precios en esa moneda e IVA 0 % en USD.
create or replace function public.document_currency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc jsonb := to_jsonb(new);
  v_currency text;
  v_book uuid;
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
      select b.id into v_book from public.price_books b
      where b.currency = new.currency and b.is_active order by b.is_standard desc, b.name limit 1;
      new.price_book_id := coalesce(v_book, new.price_book_id);
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
create trigger quotes_usd before insert or update on public.quotes for each row execute function public.document_currency();
create trigger orders_usd before insert or update on public.orders for each row execute function public.document_currency();

-- Sincronizar una cotización en USD lleva su total al Valor en USD de la oportunidad.
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
begin
  select opportunity_id, net_total, currency into v_opp, v_net, v_currency from public.quotes where id = p_quote;
  if v_opp is null then
    raise exception 'Cotización no encontrada';
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

-- Tablero: cotizaciones y pedidos en pesos.
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
    'quotes_open_amount', coalesce((select sum(public.to_cop(net_total, currency)) from qt where status in ('Borrador', 'En revisión', 'Aprobada', 'Presentada')), 0),
    'quotes_accepted', (select count(*) from qt where status = 'Aceptada' and updated_at::date between p_from and p_to),
    'orders_in_progress', (select count(*) from od where status in ('Activado', 'En producción', 'Despachado')),
    'orders_in_progress_amount', coalesce((select sum(public.to_cop(net_total, currency)) from od where status in ('Activado', 'En producción', 'Despachado')), 0),
    'orders_delivered', (select count(*) from od where status = 'Entregado' and delivered_at::date between p_from and p_to)
  );
$$;

-- ---------------------------------------------------------------------------
-- Consulta diaria (6:00 a. m. y 12:00 m. de Colombia) si las extensiones están disponibles.
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    execute 'create extension if not exists http with schema extensions';
  exception when others then
    raise notice 'Extensión http no disponible: la TRM se registra a mano en Configuración → Monedas';
    return;
  end;
  begin
    execute $cron$select cron.schedule('firplak-trm-diaria', '0 11,17 * * *', 'select public.refresh_exchange_rates()')$cron$;
  exception when others then
    raise notice 'No se pudo programar la TRM diaria: %', sqlerrm;
  end;
  begin
    perform public.refresh_exchange_rates();
  exception when others then
    raise notice 'No se pudo consultar la TRM: %', sqlerrm;
  end;
end
$$;
