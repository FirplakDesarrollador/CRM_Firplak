-- Pronóstico real: todos los pedidos y entregas abiertos de SAP (pedido de Luis, 2026-11-27).
--
-- Hasta ahora la capa «Pedidos y entregas abiertos» salía de la copia de SAP por cliente (sap_partners), que el agente
-- solo trae para las cuentas del CRM con Código SAP: en producción, una sola. Ahora el agente trae en cada corrida
-- TODAS las líneas de pedido abiertas y TODAS las entregas sin facturar de la compañía, estén o no creadas como cuenta,
-- y las deja en sap_backlog. La ficha SAP de cada cuenta sigue usando sap_partners.
--
-- Por persona: el documento es del vendedor que tiene en SAP (el mismo cruce vendedor ↔ usuario de las ventas,
-- sap_sellers). Si ese vendedor no está relacionado con ningún usuario, cuenta para el propietario de la cuenta del CRM
-- con ese Código SAP, como antes.

create table public.sap_backlog (
  batch uuid not null,
  kind text not null check (kind in ('order', 'delivery')),
  doc_entry bigint not null,
  line_num int not null default 0,
  doc_num text,
  card_code text not null,
  customer_name text,
  seller text,
  -- Fecha plan de despacho de la línea del pedido, o fecha de la entrega.
  base_date date,
  -- Lo que falta por facturar, sin IVA.
  amount numeric(18, 2) not null default 0,
  primary key (batch, kind, doc_entry, line_num)
);
create index sap_backlog_card_idx on public.sap_backlog (card_code);
comment on table public.sap_backlog is
  'Líneas de pedido abiertas y entregas sin facturar de toda la compañía, traídas de SAP por el agente. Solo cuenta el lote vigente (sap_backlog_state).';

-- Lote vigente: una carga a medias no reemplaza a la anterior.
create table public.sap_backlog_state (
  id boolean primary key default true check (id),
  batch uuid,
  row_count int not null default 0,
  loaded_at timestamptz
);
insert into public.sap_backlog_state (id) values (true);

alter table public.sap_backlog enable row level security;
alter table public.sap_backlog_state enable row level security;
-- Nadie lee las líneas directamente: solo las funciones del pronóstico. La fecha de la carga, quien personaliza.
create policy "sap pendiente por facturar: estado" on public.sap_backlog_state for select to authenticated
  using (public.has_perm('system', 'customize'));

-- Carga por lotes del agente. Filas: [tipo, DocEntry, línea, DocNum, CardCode, cliente, vendedor, fecha, valor].
-- La última parte (p_last) deja este lote como vigente y borra los anteriores.
create function public.sap_agent_backlog_load(p_batch uuid, p_rows jsonb, p_last boolean)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
begin
  if not public.is_sap_agent() then raise exception 'Solo el agente de SAP' using errcode = '42501'; end if;
  if p_batch is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then
    raise exception 'Lote no válido' using errcode = '22023';
  end if;
  insert into public.sap_backlog (batch, kind, doc_entry, line_num, doc_num, card_code, customer_name, seller, base_date, amount)
  select p_batch, r ->> 0, (r ->> 1)::bigint, coalesce((r ->> 2)::int, 0), nullif(r ->> 3, ''),
         upper(regexp_replace(r ->> 4, '\s', '', 'g')), nullif(r ->> 5, ''), nullif(trim(r ->> 6), ''),
         nullif(r ->> 7, '')::date, round((r ->> 8)::numeric, 2)
  from jsonb_array_elements(p_rows) r
  where r ->> 0 in ('order', 'delivery') and coalesce(r ->> 4, '') <> '' and (r ->> 8)::numeric > 0
  on conflict (batch, kind, doc_entry, line_num) do update set
    doc_num = excluded.doc_num, card_code = excluded.card_code, customer_name = excluded.customer_name,
    seller = excluded.seller, base_date = excluded.base_date, amount = excluded.amount;
  get diagnostics v_n = row_count;
  if p_last then
    update public.sap_backlog_state set batch = p_batch, loaded_at = now(),
      row_count = (select count(*) from public.sap_backlog b where b.batch = p_batch)
    where id;
    delete from public.sap_backlog b where b.batch <> p_batch;
    -- Vendedores nuevos: se relacionan solos con el usuario del mismo nombre, si hay uno solo.
    insert into public.sap_sellers (seller, user_id)
    select s.seller, public.sap_match_seller(s.seller)
    from (select distinct b.seller from public.sap_backlog b where b.batch = p_batch and b.seller is not null) s
    on conflict (seller) do nothing;
  end if;
  return v_n;
end;
$$;
revoke execute on function public.sap_agent_backlog_load(uuid, jsonb, boolean) from public, anon;
grant execute on function public.sap_agent_backlog_load(uuid, jsonb, boolean) to authenticated;

-- Lo que falta por facturar, con la fecha en que se facturaría (despacho o entrega + días de despacho; lo vencido, hoy).
drop function public.sap_backlog_lines();
create function public.sap_backlog_lines()
returns table (kind text, card_code text, doc_num text, forecast_date date, amount numeric, seller text)
language sql
stable
security definer
set search_path = ''
as $$
  with t as (select (now() at time zone 'America/Bogota')::date as today)
  select b.kind, b.card_code, b.doc_num,
         greatest(coalesce(b.base_date, t.today) + public.sap_dispatch_lag_days(), t.today), b.amount, b.seller
  from public.sap_backlog b
  cross join t
  where b.batch = (select s.batch from public.sap_backlog_state s where s.id);
$$;
revoke execute on function public.sap_backlog_lines() from public, anon, authenticated;

create or replace function public.forecast_real_days(p_period_type text, p_period_start date, p_user uuid default null)
returns table (day date, invoiced numeric, orders numeric, deliveries numeric, opportunities numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_end date := public.goal_period_end(p_period_type, p_period_start);
  v_today date := (now() at time zone 'America/Bogota')::date;
begin
  if p_user is null and not public.sap_sales_sees_all() then
    return;
  end if;
  if p_user is not null and not public.can_see_goal(p_user) then
    return;
  end if;
  return query
  select x.d, sum(x.i), sum(x.o), sum(x.e), sum(x.p)
  from (
    select s.sale_date as d, s.amount as i, 0::numeric as o, 0::numeric as e, 0::numeric as p
    from public.sap_sales s
    where s.sale_date between p_period_start and v_end
      and (p_user is null or s.seller in (select z.seller from public.sap_sellers z where z.user_id = p_user))
    union all
    select b.forecast_date, 0, case when b.kind = 'order' then b.amount else 0 end, case when b.kind = 'delivery' then b.amount else 0 end, 0
    from public.sap_backlog_lines() b
    where b.forecast_date between p_period_start and v_end and b.amount > 0
      and (p_user is null
        -- Del vendedor de SAP relacionado con la persona…
        or b.seller in (select z.seller from public.sap_sellers z where z.user_id = p_user)
        -- … o, si el vendedor no está relacionado con nadie, del propietario de la cuenta.
        or (not exists (select 1 from public.sap_sellers z where z.seller = b.seller and z.user_id is not null)
            and exists (select 1 from public.accounts a where a.sap_card_code = b.card_code and a.owner_id = p_user)))
    union all
    select greatest(sc.forecast_date, v_today), 0, 0, 0, op.amount * sc.share * coalesce(c.percent, 100) / 100
    from public.opportunities op
    join public.opportunity_schedule() sc on sc.opportunity_id = op.id
    left join public.opportunity_credit c on c.opportunity_id = op.id and c.user_id = p_user
    where not op.is_closed and greatest(sc.forecast_date, v_today) between p_period_start and v_end
      and (p_user is null or c.user_id is not null)
  ) x
  group by x.d
  order by x.d;
end;
$$;
revoke execute on function public.forecast_real_days(text, date, uuid) from public, anon;
grant execute on function public.forecast_real_days(text, date, uuid) to authenticated;
