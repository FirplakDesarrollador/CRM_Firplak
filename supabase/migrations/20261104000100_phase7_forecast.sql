-- Firplak CRM · Fase 7: pronóstico de ventas por categoría frente a la meta, con
-- ajustes del gerente.

create table public.forecast_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  period_type text not null check (period_type in ('month', 'quarter', 'year')),
  period_start date not null,
  amount numeric(18, 2) not null check (amount >= 0),
  note text,
  adjusted_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, period_type, period_start)
);
create trigger forecast_adjustments_updated_at before update on public.forecast_adjustments
  for each row execute function public.set_updated_at();

alter table public.forecast_adjustments enable row level security;
-- Mismas reglas que las metas: lo ve el asesor y su cadena de mando; lo ajusta el gerente.
create policy "ajustes: ver" on public.forecast_adjustments for select to authenticated using (public.can_see_goal(user_id));
create policy "ajustes: crear" on public.forecast_adjustments for insert to authenticated with check (public.can_manage_goal(user_id));
create policy "ajustes: editar" on public.forecast_adjustments for update to authenticated
  using (public.can_manage_goal(user_id)) with check (public.can_manage_goal(user_id));
create policy "ajustes: borrar" on public.forecast_adjustments for delete to authenticated using (public.can_manage_goal(user_id));

-- Resumen por asesor de las oportunidades que cierran en el periodo, por categoría
-- de pronóstico, con su meta de ventas y el ajuste del gerente. Solo incluye asesores
-- que el usuario puede ver (él mismo, su equipo o todos con «ver todo»).
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
    select o.owner_id, o.amount, o.is_won, o.is_closed, o.forecast_category
    from public.opportunities o, bounds b
    where o.close_date between b.s and b.e and o.owner_id in (select id from people)
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
grant execute on function public.forecast_summary(text, date) to authenticated;
