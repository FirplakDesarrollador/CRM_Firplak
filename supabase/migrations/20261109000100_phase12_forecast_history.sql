-- Firplak CRM · Fase 12: historial del pronóstico.
-- Instantáneas semanales (o a demanda) del pronóstico por asesor y del estado de cada
-- oportunidad, para ver la tendencia frente a la meta y qué cambió en el pipeline.

create table public.forecast_snapshots (
  id uuid primary key default gen_random_uuid(),
  taken_on date not null,
  taken_at timestamptz not null default now(),
  period_type text not null check (period_type in ('month', 'quarter', 'year')),
  period_start date not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  closed numeric(18, 2) not null default 0,
  commit_amount numeric(18, 2) not null default 0,
  best_case numeric(18, 2) not null default 0,
  pipeline numeric(18, 2) not null default 0,
  open_count int not null default 0,
  quota numeric(18, 2),
  adjustment numeric(18, 2),
  unique (taken_on, period_type, period_start, user_id)
);
create index forecast_snapshots_period_idx on public.forecast_snapshots (period_type, period_start, taken_on);
alter table public.forecast_snapshots enable row level security;
-- Mismas reglas que las metas: el asesor, su cadena de mando y quien ve todo.
create policy "instantáneas: ver" on public.forecast_snapshots for select to authenticated using (public.can_see_goal(user_id));

create table public.opportunity_snapshots (
  taken_on date not null,
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  owner_id uuid,
  amount numeric(18, 2),
  close_date date,
  stage_id uuid,
  forecast_category text,
  is_closed boolean,
  is_won boolean,
  primary key (taken_on, opportunity_id)
);
alter table public.opportunity_snapshots enable row level security;
-- Se ve la foto de una oportunidad si se ve la oportunidad.
create policy "fotos de oportunidades: ver" on public.opportunity_snapshots for select to authenticated
  using (exists (select 1 from public.opportunities o where o.id = opportunity_id));

-- ---------------------------------------------------------------------------
-- Toma la instantánea del día (reemplaza la del mismo día) para los periodos
-- actuales de mes, trimestre y año. La ejecuta pg_cron sin usuario o un administrador.
-- ---------------------------------------------------------------------------
create or replace function public.take_forecast_snapshot()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/Bogota')::date;
  v_type text;
  v_start date;
  v_end date;
  v_rows int := 0;
  v_n int;
begin
  if auth.uid() is not null and not (public.has_perm('system', 'customize') or public.has_perm('system', 'manage_users')) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  foreach v_type in array array['month', 'quarter', 'year'] loop
    v_start := date_trunc(v_type, v_today)::date;
    v_end := public.goal_period_end(v_type, v_start);
    insert into public.forecast_snapshots (taken_on, period_type, period_start, user_id, closed, commit_amount,
                                           best_case, pipeline, open_count, quota, adjustment)
    select v_today, v_type, v_start, p.id,
      coalesce(sum(o.amount) filter (where o.is_won), 0),
      coalesce(sum(o.amount) filter (where not o.is_closed and o.forecast_category = 'commit'), 0),
      coalesce(sum(o.amount) filter (where not o.is_closed and o.forecast_category = 'best_case'), 0),
      coalesce(sum(o.amount) filter (where not o.is_closed and o.forecast_category = 'pipeline'), 0),
      count(o.*) filter (where not o.is_closed),
      (select g.target from public.sales_goals g
        where g.user_id = p.id and g.metric = 'won_amount' and g.period_type = v_type and g.period_start = v_start),
      (select a.amount from public.forecast_adjustments a
        where a.user_id = p.id and a.period_type = v_type and a.period_start = v_start)
    from public.profiles p
    left join public.opportunities o on o.owner_id = p.id and o.close_date between v_start and v_end
    where p.is_active
    group by p.id
    having count(o.*) > 0
        or exists (select 1 from public.sales_goals g where g.user_id = p.id and g.metric = 'won_amount'
                    and g.period_type = v_type and g.period_start = v_start)
    on conflict (taken_on, period_type, period_start, user_id) do update set
      taken_at = now(), closed = excluded.closed, commit_amount = excluded.commit_amount, best_case = excluded.best_case,
      pipeline = excluded.pipeline, open_count = excluded.open_count, quota = excluded.quota, adjustment = excluded.adjustment;
    get diagnostics v_n = row_count;
    v_rows := v_rows + v_n;
  end loop;

  -- Foto de las oportunidades que cierran este año (o antes, si siguen abiertas).
  insert into public.opportunity_snapshots (taken_on, opportunity_id, owner_id, amount, close_date, stage_id,
                                            forecast_category, is_closed, is_won)
  select v_today, o.id, o.owner_id, o.amount, o.close_date, o.stage_id, o.forecast_category, o.is_closed, o.is_won
  from public.opportunities o
  where o.close_date >= date_trunc('year', v_today)::date or not o.is_closed
  on conflict (taken_on, opportunity_id) do update set
    owner_id = excluded.owner_id, amount = excluded.amount, close_date = excluded.close_date, stage_id = excluded.stage_id,
    forecast_category = excluded.forecast_category, is_closed = excluded.is_closed, is_won = excluded.is_won;

  return v_rows;
end;
$$;
grant execute on function public.take_forecast_snapshot() to authenticated;

-- Tendencia de un periodo: totales por fecha de instantánea de los asesores visibles
-- (opcionalmente uno solo).
create or replace function public.forecast_trend(p_period_type text, p_period_start date, p_user uuid default null)
returns table (taken_on date, closed numeric, commit_amount numeric, best_case numeric, pipeline numeric, quota numeric, forecast numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.taken_on, sum(s.closed), sum(s.commit_amount), sum(s.best_case), sum(s.pipeline),
         sum(s.quota), sum(coalesce(s.adjustment, s.closed + s.commit_amount))
  from public.forecast_snapshots s
  where s.period_type = p_period_type and s.period_start = p_period_start
    and (p_user is null or s.user_id = p_user)
  group by s.taken_on
  order by s.taken_on;
$$;
grant execute on function public.forecast_trend(text, date, uuid) to authenticated;

-- Cambios en el pipeline del periodo entre una instantánea y hoy, para las
-- oportunidades visibles (RLS): nuevas, valor, fecha de cierre, etapa y cierre.
create or replace function public.pipeline_changes(p_since date, p_period_type text, p_period_start date)
returns table (
  opportunity_id uuid, name text, owner_id uuid, is_new boolean,
  amount_before numeric, amount_after numeric, close_before date, close_after date,
  stage_before text, stage_after text, category_before text, category_after text,
  was_closed boolean, is_closed boolean, is_won boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with bounds as (select p_period_start as s, public.goal_period_end(p_period_type, p_period_start) as e)
  select o.id, o.name, o.owner_id, snap.opportunity_id is null,
         snap.amount, o.amount, snap.close_date, o.close_date,
         sb.name, sa.name, snap.forecast_category, o.forecast_category,
         coalesce(snap.is_closed, false), o.is_closed, o.is_won
  from public.opportunities o
  cross join bounds b
  left join public.opportunity_snapshots snap on snap.opportunity_id = o.id and snap.taken_on = p_since
  left join public.pipeline_stages sb on sb.id = snap.stage_id
  left join public.pipeline_stages sa on sa.id = o.stage_id
  where (o.close_date between b.s and b.e or snap.close_date between b.s and b.e)
    and (
      -- Nueva: creada después de la instantánea.
      (snap.opportunity_id is null and (o.created_at at time zone 'America/Bogota')::date > p_since)
      -- Existente con cambios de valor, fecha o etapa.
      or (snap.opportunity_id is not null
          and (snap.amount is distinct from o.amount or snap.close_date is distinct from o.close_date
               or snap.stage_id is distinct from o.stage_id))
    )
  order by abs(coalesce(o.amount, 0) - coalesce(snap.amount, 0)) desc, o.name;
$$;
grant execute on function public.pipeline_changes(date, text, date) to authenticated;

-- Programación semanal: lunes 6:00 a. m. Bogotá (11:00 UTC) si pg_cron está disponible.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron no disponible: las instantáneas del pronóstico se tomarán desde Pronóstico';
    return;
  end if;
  begin
    execute $cron$select cron.schedule('firplak-instantanea-pronostico', '0 11 * * 1', 'select public.take_forecast_snapshot()')$cron$;
  exception when others then
    raise notice 'No se pudo programar la tarea de pg_cron: %', sqlerrm;
  end;
end
$$;
