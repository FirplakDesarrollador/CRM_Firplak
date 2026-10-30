-- Firplak CRM · Fase 6: metas comerciales (cuotas) por asesor o de la compañía.

create table public.sales_goals (
  id uuid primary key default gen_random_uuid(),
  -- null = meta de toda la compañía
  user_id uuid references public.profiles (id) on delete cascade,
  metric text not null check (metric in ('won_amount', 'won_count', 'new_opportunities', 'new_leads', 'activities_completed')),
  period_type text not null check (period_type in ('month', 'quarter', 'year')),
  period_start date not null,
  target numeric(18, 2) not null check (target >= 0),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index sales_goals_unique on public.sales_goals
  (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), metric, period_type, period_start);
create trigger sales_goals_updated_at before update on public.sales_goals
  for each row execute function public.set_updated_at();

-- Quién ve una meta: su dueño, sus superiores en la jerarquía y quien ve todo el
-- comercial. Las metas de compañía las ve quien tiene acceso a indicadores.
create or replace function public.can_see_goal(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_user is null then public.has_perm('system', 'view_dashboards')
    else p_user = auth.uid()
      or public.can_access_owner(p_user)
      or public.has_perm('opportunities', 'view_all')
  end;
$$;

-- Quién las define: administración de usuarios para todo; los gerentes para su equipo.
create or replace function public.can_manage_goal(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_perm('system', 'manage_users')
      or (p_user is not null and p_user <> auth.uid() and public.can_access_owner(p_user));
$$;

alter table public.sales_goals enable row level security;
create policy "metas: ver" on public.sales_goals for select to authenticated using (public.can_see_goal(user_id));
create policy "metas: crear" on public.sales_goals for insert to authenticated with check (public.can_manage_goal(user_id));
create policy "metas: editar" on public.sales_goals for update to authenticated
  using (public.can_manage_goal(user_id)) with check (public.can_manage_goal(user_id));
create policy "metas: borrar" on public.sales_goals for delete to authenticated using (public.can_manage_goal(user_id));

-- Fin del periodo de una meta.
create or replace function public.goal_period_end(p_type text, p_start date)
returns date
language sql
immutable
set search_path = ''
as $$
  select (p_start + case p_type when 'month' then interval '1 month' when 'quarter' then interval '3 months' else interval '1 year' end)::date - 1;
$$;

-- Avance de las metas visibles de un periodo. Calcula los resultados reales sin
-- depender de la visibilidad de cada oportunidad (security definer), pero solo
-- devuelve metas que el usuario puede ver.
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
      when 'won_amount' then coalesce((select sum(o.amount) from public.opportunities o
        where o.is_won and o.close_date between g.period_start and g.pend and (g.user_id is null or o.owner_id = g.user_id)), 0)
      when 'won_count' then (select count(*) from public.opportunities o
        where o.is_won and o.close_date between g.period_start and g.pend and (g.user_id is null or o.owner_id = g.user_id))
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
grant execute on function public.goal_progress(text, date) to authenticated;
