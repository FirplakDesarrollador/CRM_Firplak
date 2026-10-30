-- Firplak CRM · Fase 16: reparto de ingresos de oportunidades (revenue splits).
-- Cuando dos vendedores comparten un negocio (p. ej. el cliente es de un asesor pero la obra
-- está en la zona de otro), el valor se reparte en porcentajes que suman 100 %. Cada uno
-- recibe su parte en metas, pronóstico, instantáneas e Indicadores. Sin reparto, el 100 %
-- es del propietario. Quien recibe una parte entra al equipo de la oportunidad para verla.

create table public.opportunity_splits (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  percent numeric(5, 2) not null check (percent > 0 and percent <= 100),
  note text,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (opportunity_id, user_id)
);
create index opportunity_splits_user_idx on public.opportunity_splits (user_id);
alter table public.opportunity_splits enable row level security;
-- Se ve si se ve la oportunidad; se cambia solo con set_opportunity_splits (valida el 100 %).
create policy "reparto: ver" on public.opportunity_splits for select to authenticated
  using (exists (select 1 from public.opportunities o where o.id = opportunity_id));

-- Crédito de cada oportunidad: su reparto o, si no tiene, 100 % para el propietario.
create view public.opportunity_credit with (security_invoker = true) as
  select s.opportunity_id, s.user_id, s.percent
  from public.opportunity_splits s
  union all
  select o.id, o.owner_id, 100::numeric(5, 2)
  from public.opportunities o
  where o.owner_id is not null
    and not exists (select 1 from public.opportunity_splits s where s.opportunity_id = o.id);
grant select on public.opportunity_credit to authenticated;

-- ---------------------------------------------------------------------------
-- Guardar el reparto completo (lista vacía = todo para el propietario).
-- ---------------------------------------------------------------------------
create or replace function public.set_opportunity_splits(p_opportunity uuid, p_splits jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_opp record;
  v_total numeric := 0;
  v_item jsonb;
  v_user uuid;
  v_pct numeric;
  v_seen uuid[] := '{}';
begin
  if not public.can_manage_team('opportunities', p_opportunity) then
    raise exception 'No puedes cambiar el reparto de esta oportunidad' using errcode = '42501';
  end if;
  select id, name, owner_id into v_opp from public.opportunities where id = p_opportunity;
  if jsonb_typeof(coalesce(p_splits, '[]'::jsonb)) <> 'array' then
    raise exception 'Formato de reparto no válido' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_splits, '[]'::jsonb)) loop
    v_user := (v_item ->> 'user_id')::uuid;
    v_pct := round((v_item ->> 'percent')::numeric, 2);
    if v_user is null or v_pct is null or v_pct <= 0 or v_pct > 100 then
      raise exception 'Cada participación necesita una persona y un porcentaje entre 0 y 100' using errcode = '23514';
    end if;
    if v_user = any (v_seen) then
      raise exception 'Una persona aparece dos veces en el reparto' using errcode = '23514';
    end if;
    if not exists (select 1 from public.profiles where id = v_user and is_active) then
      raise exception 'Solo se pueden incluir usuarios activos' using errcode = '23514';
    end if;
    v_seen := v_seen || v_user;
    v_total := v_total + v_pct;
  end loop;
  if jsonb_array_length(coalesce(p_splits, '[]'::jsonb)) > 0 and v_total <> 100 then
    raise exception 'El reparto debe sumar 100 %% (suma %)', v_total using errcode = '23514';
  end if;

  delete from public.opportunity_splits where opportunity_id = p_opportunity;
  insert into public.opportunity_splits (opportunity_id, user_id, percent, note)
  select p_opportunity, (e ->> 'user_id')::uuid, round((e ->> 'percent')::numeric, 2), nullif(trim(e ->> 'note'), '')
  from jsonb_array_elements(coalesce(p_splits, '[]'::jsonb)) e;

  -- Quien recibe una parte y no es propietario entra al equipo (lectura) para ver el negocio.
  insert into public.opportunity_team_members (opportunity_id, user_id, team_role, access)
  select p_opportunity, s.user_id, 'Asesor comercial', 'read'
  from public.opportunity_splits s
  where s.opportunity_id = p_opportunity and s.user_id is distinct from v_opp.owner_id
  on conflict (opportunity_id, user_id) do nothing;

  -- Aviso a quienes participan (salvo quien guarda).
  insert into public.notifications (user_id, title, body, link, created_by)
  select s.user_id, 'Participas con ' || trim(to_char(s.percent, 'FM990.##')) || ' % en «' || v_opp.name || '»',
         'Reparto de ingresos de la oportunidad', '/oportunidades/' || p_opportunity || '?tab=equipo', auth.uid()
  from public.opportunity_splits s
  where s.opportunity_id = p_opportunity and s.user_id is distinct from auth.uid();
end;
$$;
grant execute on function public.set_opportunity_splits(uuid, jsonb) to authenticated;

-- Si cambia el propietario, su parte pasa al nuevo (sumándose si ya tenía una).
create or replace function public.transfer_owner_split()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old numeric;
begin
  if new.owner_id is distinct from old.owner_id and old.owner_id is not null and new.owner_id is not null then
    select percent into v_old from public.opportunity_splits where opportunity_id = new.id and user_id = old.owner_id;
    if v_old is not null then
      delete from public.opportunity_splits where opportunity_id = new.id and user_id = old.owner_id;
      insert into public.opportunity_splits (opportunity_id, user_id, percent)
      values (new.id, new.owner_id, v_old)
      on conflict (opportunity_id, user_id) do update set percent = public.opportunity_splits.percent + excluded.percent;
    end if;
  end if;
  return null;
end;
$$;
create trigger opportunities_transfer_split after update of owner_id on public.opportunities
  for each row execute function public.transfer_owner_split();

-- ---------------------------------------------------------------------------
-- Metas: ventas y negocios ganados se acreditan según el reparto.
-- ---------------------------------------------------------------------------
create or replace function public.goal_progress(p_period_type text, p_period_start date)
returns table (goal_id uuid, user_id uuid, user_name text, metric text, target numeric, actual numeric, period_end date)
language sql
stable
security definer
set search_path = ''
as $$
  with g as (
    select sg.*, public.goal_period_end(sg.period_type, sg.period_start) as pend
    from public.sales_goals sg
    where sg.period_type = p_period_type and sg.period_start = p_period_start and public.can_see_goal(sg.user_id)
  )
  select g.id, g.user_id, coalesce(nullif(p.full_name, ''), p.email, 'Compañía'), g.metric, g.target,
    case g.metric
      when 'won_amount' then
        case when g.user_id is null then
          coalesce((select sum(o.amount) from public.opportunities o
            where o.is_won and o.close_date between g.period_start and g.pend), 0)
        else
          coalesce((select sum(o.amount * c.percent / 100) from public.opportunities o
            join public.opportunity_credit c on c.opportunity_id = o.id and c.user_id = g.user_id
            where o.is_won and o.close_date between g.period_start and g.pend), 0)
        end
      when 'won_count' then (select count(distinct o.id) from public.opportunities o
        left join public.opportunity_credit c on c.opportunity_id = o.id
        where o.is_won and o.close_date between g.period_start and g.pend and (g.user_id is null or c.user_id = g.user_id))
      when 'new_opportunities' then (select count(*) from public.opportunities o
        where (o.created_at at time zone 'America/Bogota')::date between g.period_start and g.pend and (g.user_id is null or o.owner_id = g.user_id))
      when 'new_leads' then (select count(*) from public.leads l
        where (l.created_at at time zone 'America/Bogota')::date between g.period_start and g.pend and (g.user_id is null or l.owner_id = g.user_id))
      else (select count(*) from public.activities a
        where a.status = 'completed' and (a.completed_at at time zone 'America/Bogota')::date between g.period_start and g.pend
          and (g.user_id is null or a.owner_id = g.user_id))
    end::numeric,
    g.pend
  from g
  left join public.profiles p on p.id = g.user_id
  order by g.user_id nulls first, g.metric;
$$;

-- ---------------------------------------------------------------------------
-- Pronóstico por asesor con su parte de cada oportunidad.
-- ---------------------------------------------------------------------------
create or replace function public.forecast_summary(p_period_type text, p_period_start date)
returns table (
  user_id uuid, user_name text, closed numeric, commit_amount numeric, best_case numeric, pipeline numeric,
  open_count bigint, quota numeric, adjustment numeric, adjustment_note text, can_adjust boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with bounds as (select p_period_start as s, public.goal_period_end(p_period_type, p_period_start) as e),
  people as (
    select p.id, coalesce(nullif(p.full_name, ''), p.email) as name
    from public.profiles p
    where p.is_active and public.can_see_goal(p.id)
  ),
  opps as (
    select c.user_id as owner_id, o.amount * c.percent / 100 as amount, o.is_won, o.is_closed, o.forecast_category
    from public.opportunities o
    join public.opportunity_credit c on c.opportunity_id = o.id, bounds b
    where o.close_date between b.s and b.e and c.user_id in (select id from people)
  )
  select pe.id, pe.name,
    coalesce(sum(o.amount) filter (where o.is_won), 0),
    coalesce(sum(o.amount) filter (where not o.is_closed and o.forecast_category = 'commit'), 0),
    coalesce(sum(o.amount) filter (where not o.is_closed and o.forecast_category = 'best_case'), 0),
    coalesce(sum(o.amount) filter (where not o.is_closed and o.forecast_category = 'pipeline'), 0),
    count(o.*) filter (where not o.is_closed),
    (select g.target from public.sales_goals g
      where g.user_id = pe.id and g.metric = 'won_amount' and g.period_type = p_period_type and g.period_start = p_period_start),
    (select a.amount from public.forecast_adjustments a
      where a.user_id = pe.id and a.period_type = p_period_type and a.period_start = p_period_start),
    (select a.note from public.forecast_adjustments a
      where a.user_id = pe.id and a.period_type = p_period_type and a.period_start = p_period_start),
    public.can_manage_goal(pe.id)
  from people pe
  left join opps o on o.owner_id = pe.id
  group by pe.id, pe.name
  having count(o.*) > 0
      or exists (select 1 from public.sales_goals g where g.user_id = pe.id and g.metric = 'won_amount'
                  and g.period_type = p_period_type and g.period_start = p_period_start)
  order by pe.name;
$$;

-- Instantáneas del pronóstico con la misma regla de crédito.
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
      coalesce(sum(o.amount * c.percent / 100) filter (where o.is_won), 0),
      coalesce(sum(o.amount * c.percent / 100) filter (where not o.is_closed and o.forecast_category = 'commit'), 0),
      coalesce(sum(o.amount * c.percent / 100) filter (where not o.is_closed and o.forecast_category = 'best_case'), 0),
      coalesce(sum(o.amount * c.percent / 100) filter (where not o.is_closed and o.forecast_category = 'pipeline'), 0),
      count(o.*) filter (where not o.is_closed),
      (select g.target from public.sales_goals g
        where g.user_id = p.id and g.metric = 'won_amount' and g.period_type = v_type and g.period_start = v_start),
      (select a.amount from public.forecast_adjustments a
        where a.user_id = p.id and a.period_type = v_type and a.period_start = v_start)
    from public.profiles p
    left join public.opportunity_credit c on c.user_id = p.id
    left join public.opportunities o on o.id = c.opportunity_id and o.close_date between v_start and v_end
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

-- ---------------------------------------------------------------------------
-- Indicadores: el filtro por asesor y el ranking usan su parte del reparto.
-- ---------------------------------------------------------------------------
create or replace function public.crm_dashboard(
  p_from date,
  p_to date,
  p_owner uuid default null,
  p_pipeline uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with
  pipeline as (
    select coalesce(
      p_pipeline,
      (select id from public.pipelines where is_default limit 1),
      (select id from public.pipelines order by sort_order, created_at limit 1)
    ) as id
  ),
  -- Filtrado por asesor: sus oportunidades con su parte del reparto de ingresos.
  opps as (
    select o.id, o.owner_id, o.stage_id, o.lead_source, o.is_won, o.is_closed, o.close_date, o.closed_at, o.created_at,
           o.amount * coalesce(c.percent, 100) / 100 as amount,
           o.expected_revenue * coalesce(c.percent, 100) / 100 as expected_revenue
    from public.opportunities o
    left join public.opportunity_credit c on p_owner is not null and c.opportunity_id = o.id and c.user_id = p_owner
    where p_owner is null or c.user_id is not null
  ),
  won as (
    select * from opps where is_won and close_date between p_from and p_to
  ),
  lost as (
    select * from opps where is_closed and not is_won and close_date between p_from and p_to
  ),
  open_opps as (
    select * from opps where not is_closed
  ),
  acts as (
    select a.*
    from public.activities a
    where p_owner is null or a.owner_id = p_owner
  ),
  months as (
    select generate_series(
      date_trunc('month', p_from::timestamp),
      date_trunc('month', p_to::timestamp),
      interval '1 month'
    )::date as month
  )
  select jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to),
    'pipeline_id', (select id from pipeline),
    'kpis', jsonb_build_object(
      'open_amount', coalesce((select sum(amount) from open_opps), 0),
      'open_count', (select count(*) from open_opps),
      'weighted_amount', coalesce((select sum(expected_revenue) from open_opps), 0),
      'won_amount', coalesce((select sum(amount) from won), 0),
      'won_count', (select count(*) from won),
      'lost_amount', coalesce((select sum(amount) from lost), 0),
      'lost_count', (select count(*) from lost),
      'win_rate', case
        when (select count(*) from won) + (select count(*) from lost) = 0 then null
        else round((select count(*) from won)::numeric * 100
             / ((select count(*) from won) + (select count(*) from lost)), 1)
      end,
      'avg_deal', (select round(avg(amount), 0) from won),
      'avg_cycle_days', (select round(avg(extract(epoch from (coalesce(closed_at, now()) - created_at)) / 86400)::numeric, 1) from won),
      'new_count', (select count(*) from opps where created_at::date between p_from and p_to),
      'new_amount', coalesce((select sum(amount) from opps where created_at::date between p_from and p_to), 0),
      'closing_this_period', (select count(*) from open_opps where close_date between p_from and p_to),
      'overdue_close', (select count(*) from open_opps where close_date < current_date),
      'activities_completed', (select count(*) from acts where status = 'completed' and completed_at::date between p_from and p_to),
      'tasks_overdue', (select count(*) from acts
                         where status in ('pending', 'in_progress') and activity_type = 'task' and due_date < current_date),
      'meetings_upcoming', (select count(*) from acts
                             where activity_type = 'meeting' and status <> 'cancelled' and start_at >= now()
                               and start_at < now() + interval '7 days')
    ),
    'funnel', coalesce((
      select jsonb_agg(row_to_json(f) order by f.sort_order)
      from (
        select s.id, s.name, s.color, s.sort_order, s.category, s.probability,
               count(o.id) as count,
               coalesce(sum(o.amount), 0) as amount
        from public.pipeline_stages s
        left join opps o on o.stage_id = s.id
          and (s.category = 'open' or o.close_date between p_from and p_to)
        where s.pipeline_id = (select id from pipeline) and s.category <> 'lost'
        group by s.id
      ) f
    ), '[]'::jsonb),
    'by_owner', coalesce((
      select jsonb_agg(row_to_json(b) order by b.won_amount desc, b.open_amount desc)
      from (
        -- Ranking por asesor con su parte de cada negocio (reparto de ingresos).
        select p.id as owner_id,
               coalesce(nullif(p.full_name, ''), p.email) as owner_name,
               coalesce(sum(o.amount * c.percent / 100) filter (where o.is_won and o.close_date between p_from and p_to), 0) as won_amount,
               count(o.id) filter (where o.is_won and o.close_date between p_from and p_to) as won_count,
               coalesce(sum(o.amount * c.percent / 100) filter (where not o.is_closed), 0) as open_amount,
               count(o.id) filter (where not o.is_closed) as open_count,
               count(o.id) filter (where o.is_closed and not o.is_won and o.close_date between p_from and p_to) as lost_count
        from public.opportunities o
        join public.opportunity_credit c on c.opportunity_id = o.id
        join public.profiles p on p.id = c.user_id
        where p_owner is null or c.user_id = p_owner
        group by p.id
      ) b
      where b.won_count > 0 or b.open_count > 0 or b.lost_count > 0
    ), '[]'::jsonb),
    'by_month', coalesce((
      select jsonb_agg(row_to_json(m) order by m.month)
      from (
        select to_char(months.month, 'YYYY-MM') as month,
               coalesce((select sum(amount) from won where date_trunc('month', won.close_date) = months.month), 0) as won_amount,
               (select count(*) from won where date_trunc('month', won.close_date) = months.month) as won_count,
               coalesce((select sum(amount) from opps
                          where date_trunc('month', opps.created_at)::date = months.month), 0) as created_amount
        from months
      ) m
    ), '[]'::jsonb),
    'by_source', coalesce((
      select jsonb_agg(row_to_json(s) order by s.amount desc)
      from (
        select coalesce(lead_source, 'Sin origen') as source, count(*) as count, sum(amount) as amount
        from won
        group by 1
      ) s
    ), '[]'::jsonb),
    'activities_by_type', coalesce((
      select jsonb_agg(row_to_json(t))
      from (
        select activity_type, count(*) as count
        from acts
        where status = 'completed' and completed_at::date between p_from and p_to
        group by 1
      ) t
    ), '[]'::jsonb)
  );
$$;
