-- Pipelines por mercado además del canal (decisiones de Luis, 7 nov 2026).
--
--   · Cada pipeline es del mercado Nacional o Internacional y de un canal: el negocio constructor o de
--     distribución en Colombia no es el mismo que en el exterior. Los pipelines existentes quedan Nacionales.
--   · Una oportunidad va al pipeline del mercado y el canal de su cuenta. Si no existe, se bloquea con un
--     mensaje hasta crearlo (nunca se mezcla un mercado en el embudo de otro).
--   · Si cambia el mercado o el canal de la cuenta, sus oportunidades abiertas pasan al pipeline nuevo con la
--     etapa equivalente; si ese pipeline no existe y hay oportunidades abiertas, el cambio se rechaza.
--   · duplicate_pipeline copia un pipeline con sus etapas a otro mercado (para crear los internacionales).
--   · crm_funnels incluye el mercado: un embudo por mercado y canal.

alter table public.pipelines add column market text not null default 'Nacional';
alter table public.pipelines add constraint pipelines_market_check check (market in ('Nacional', 'Internacional'));
comment on column public.pipelines.market is 'Mercado del pipeline: sus oportunidades son de cuentas de este mercado y su canal.';
comment on column public.pipelines.channel is 'Canal de venta del pipeline (uno por mercado y canal).';

drop index public.pipelines_one_per_channel;
create unique index pipelines_one_per_market_channel on public.pipelines (market, channel) where channel is not null and is_active;

-- El pipeline del mercado y el canal de la cuenta.
create or replace function public.channel_pipeline(p_account uuid)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id from public.accounts a
  join public.pipelines p on p.channel = a.industry and p.market = public.market_of(a.market) and p.is_active
  where a.id = p_account
  limit 1;
$$;

create or replace function public.missing_pipeline_message(p_account uuid)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select format('No hay un pipeline activo para el mercado %s y el %s. Pide a administración crearlo en Configuración → Pipelines (puede duplicar el de otro mercado).',
    public.market_of(a.market), coalesce(a.industry, 'canal de la cuenta (sin definir)'))
  from public.accounts a
  where a.id = p_account;
$$;
revoke execute on function public.missing_pipeline_message(uuid) from public, anon;
grant execute on function public.missing_pipeline_message(uuid) to authenticated;

-- Al crear la oportunidad o cambiarle la cuenta: el pipeline del mercado y canal de la cuenta, con la etapa equivalente.
create or replace function public.opportunity_channel_pipeline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target uuid;
  v_stage_pipeline uuid;
  v_new_account boolean := tg_op = 'INSERT' or new.account_id is distinct from old.account_id;
begin
  if new.account_id is null then
    return new;
  end if;
  v_target := public.channel_pipeline(new.account_id);
  if v_target is null then
    if v_new_account then
      raise exception '%', public.missing_pipeline_message(new.account_id) using errcode = '23514';
    end if;
    -- Una oportunidad antigua sin pipeline de su mercado y canal sigue moviéndose dentro del suyo.
    return new;
  end if;
  select s.pipeline_id into v_stage_pipeline from public.pipeline_stages s where s.id = new.stage_id;
  if v_stage_pipeline = v_target then
    new.pipeline_id := v_target;
    return new;
  end if;
  if v_new_account then
    new.stage_id := public.equivalent_stage(new.stage_id, v_target);
    new.pipeline_id := v_target;
    return new;
  end if;
  if v_stage_pipeline = old.pipeline_id then
    return new;
  end if;
  raise exception 'La etapa elegida no es del pipeline «%», el del mercado y el canal de la cuenta.',
    (select p.name from public.pipelines p where p.id = v_target) using errcode = '23514';
end;
$$;

-- Si cambia el mercado o el canal de la cuenta, sus oportunidades abiertas pasan al pipeline nuevo.
create or replace function public.account_channel_moves_opportunities()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target uuid;
begin
  if new.industry is not distinct from old.industry and public.market_of(new.market) = public.market_of(old.market) then
    return null;
  end if;
  v_target := public.channel_pipeline(new.id);
  if v_target is null then
    if exists (select 1 from public.opportunities o where o.account_id = new.id and not o.is_closed) then
      raise exception '% La cuenta tiene oportunidades abiertas que deben pasar a ese pipeline.', public.missing_pipeline_message(new.id)
        using errcode = '23514';
    end if;
    return null;
  end if;
  update public.opportunities o
    set stage_id = public.equivalent_stage(o.stage_id, v_target), pipeline_id = v_target
    where o.account_id = new.id and not o.is_closed and o.pipeline_id is distinct from v_target;
  return null;
end;
$$;
drop trigger accounts_channel_pipeline on public.accounts;
create trigger accounts_channel_pipeline after update of industry, market on public.accounts
  for each row execute function public.account_channel_moves_opportunities();

-- Copia un pipeline con sus etapas a otro mercado (mismo canal).
create or replace function public.duplicate_pipeline(p_pipeline uuid, p_name text, p_market text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_src public.pipelines%rowtype;
  v_id uuid;
begin
  select * into v_src from public.pipelines where id = p_pipeline;
  if not found then
    raise exception 'El pipeline no existe.' using errcode = '23514';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Escribe el nombre del pipeline nuevo.' using errcode = '23514';
  end if;
  insert into public.pipelines (name, description, channel, market, is_default, is_active, sort_order)
  values (trim(p_name), v_src.description, v_src.channel, public.market_of(p_market), false, true, v_src.sort_order + 1)
  returning id into v_id;
  insert into public.pipeline_stages (pipeline_id, name, name_en, sort_order, probability, category, forecast_category, color)
  select v_id, s.name, s.name_en, s.sort_order, s.probability, s.category, s.forecast_category, s.color
  from public.pipeline_stages s where s.pipeline_id = p_pipeline;
  return v_id;
end;
$$;
revoke execute on function public.duplicate_pipeline(uuid, text, text) from public, anon;
grant execute on function public.duplicate_pipeline(uuid, text, text) to authenticated;

-- Un embudo por pipeline (mercado y canal).
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
           'id', p.id, 'name', p.name, 'channel', p.channel, 'market', p.market, 'is_default', p.is_default,
           'stages', (select coalesce(jsonb_agg(row_to_json(st) order by st.sort_order), '[]'::jsonb)
                      from (select id, name, color, sort_order, category, probability, count, amount
                            from stages where pipeline_id = p.id) st))
         order by (p.channel is null), p.market desc, p.sort_order, p.created_at), '[]'::jsonb)
  from public.pipelines p
  where p.is_active;
$$;
