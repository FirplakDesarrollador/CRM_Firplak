-- Firplak CRM · Indicadores. Las funciones son security invoker: cada usuario solo
-- agrega los registros que la RLS le deja ver.

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
  opps as (
    select o.*
    from public.opportunities o
    where p_owner is null or o.owner_id = p_owner
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
        select p.id as owner_id,
               coalesce(nullif(p.full_name, ''), p.email) as owner_name,
               coalesce(sum(o.amount) filter (where o.is_won and o.close_date between p_from and p_to), 0) as won_amount,
               count(o.id) filter (where o.is_won and o.close_date between p_from and p_to) as won_count,
               coalesce(sum(o.amount) filter (where not o.is_closed), 0) as open_amount,
               count(o.id) filter (where not o.is_closed) as open_count,
               count(o.id) filter (where o.is_closed and not o.is_won and o.close_date between p_from and p_to) as lost_count
        from opps o
        join public.profiles p on p.id = o.owner_id
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

grant execute on function public.crm_dashboard(date, date, uuid, uuid) to authenticated;
