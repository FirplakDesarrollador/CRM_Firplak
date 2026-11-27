-- Una oportunidad borrada no puede seguir sumando en «Tendencia del pronóstico» (decisión de Luis, 2026-11-27).
--
-- La foto semanal (forecast_snapshots) guarda solo el total por asesor: al borrar una oportunidad de ensayo, su valor
-- quedaba para siempre en las fotos anteriores. Ahora cada foto guarda también qué oportunidades la componen y con
-- cuánto (forecast_snapshot_items); al borrar una oportunidad se descuenta ese valor de las fotos en las que sumaba.
-- Las fotos anteriores a esta migración no tienen detalle: no se pueden descontar solas.

create table public.forecast_snapshot_items (
  taken_on date not null,
  period_type text not null check (period_type in ('month', 'quarter', 'year')),
  period_start date not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  bucket text not null check (bucket in ('closed', 'commit', 'best_case', 'pipeline')),
  amount numeric not null default 0,
  primary key (taken_on, period_type, period_start, user_id, opportunity_id)
);
create index forecast_snapshot_items_opportunity_idx on public.forecast_snapshot_items (opportunity_id);
create index forecast_snapshot_items_user_idx on public.forecast_snapshot_items (user_id);
alter table public.forecast_snapshot_items enable row level security;
-- Misma regla que la foto: el asesor, su cadena de mando y quien ve todo.
create policy "detalle de instantáneas: ver" on public.forecast_snapshot_items for select to authenticated
  using (public.can_see_goal(user_id));
comment on table public.forecast_snapshot_items is
  'Qué oportunidades componen cada foto del pronóstico y con cuánto. Permite descontar una oportunidad borrada.';

-- Al borrar una oportunidad, se resta de las fotos en las que sumaba. El detalle se va por la llave foránea.
create function public.discount_deleted_opportunity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.forecast_snapshots f set
    closed = greatest(0, f.closed - case when i.bucket = 'closed' then i.amount else 0 end),
    commit_amount = greatest(0, f.commit_amount - case when i.bucket = 'commit' then i.amount else 0 end),
    best_case = greatest(0, f.best_case - case when i.bucket = 'best_case' then i.amount else 0 end),
    pipeline = greatest(0, f.pipeline - case when i.bucket = 'pipeline' then i.amount else 0 end),
    open_count = greatest(0, f.open_count - case when i.bucket = 'closed' then 0 else 1 end)
  from public.forecast_snapshot_items i
  where i.opportunity_id = old.id
    and f.taken_on = i.taken_on and f.period_type = i.period_type and f.period_start = i.period_start
    and f.user_id = i.user_id;
  return old;
end;
$$;
revoke execute on function public.discount_deleted_opportunity() from public, anon, authenticated;
create trigger opportunities_discount_snapshots before delete on public.opportunities
  for each row execute function public.discount_deleted_opportunity();

-- La foto del día guarda además su detalle por oportunidad. El resto es igual a la versión anterior.
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
      count(distinct o.id) filter (where not o.is_closed),
      (select g.target from public.sales_goals g
        where g.user_id = p.id and g.metric = 'won_amount' and g.period_type = v_type and g.period_start = v_start),
      (select a.amount from public.forecast_adjustments a
        where a.user_id = p.id and a.period_type = v_type and a.period_start = v_start)
    from public.profiles p
    left join public.opportunity_credit c on c.user_id = p.id
    -- Por mes de entrega y facturación, igual que forecast_summary.
    left join (select x.id, x.amount * s.share as amount, x.is_won, x.is_closed, x.forecast_category
               from public.opportunities x join public.opportunity_schedule() s on s.opportunity_id = x.id
               where s.forecast_date between v_start and v_end) o on o.id = c.opportunity_id
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

    -- Detalle de la foto: con cuánto suma cada oportunidad, para poder descontarla si se borra.
    delete from public.forecast_snapshot_items i
    where i.taken_on = v_today and i.period_type = v_type and i.period_start = v_start;
    insert into public.forecast_snapshot_items (taken_on, period_type, period_start, user_id, opportunity_id, bucket, amount)
    select v_today, v_type, v_start, c.user_id, x.id,
           case when x.is_won then 'closed' else x.forecast_category end,
           coalesce(sum(x.amount * s.share * c.percent / 100), 0)
    from public.opportunities x
    join public.opportunity_schedule() s on s.opportunity_id = x.id
    join public.opportunity_credit c on c.opportunity_id = x.id
    join public.profiles p on p.id = c.user_id and p.is_active
    where s.forecast_date between v_start and v_end
      and (x.is_won or (not x.is_closed and x.forecast_category in ('commit', 'best_case', 'pipeline')))
    group by c.user_id, x.id, x.is_won, x.forecast_category;
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
