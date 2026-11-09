-- Aviso diario de tareas vencidas: el título concuerda con la cantidad («Tienes 1 tarea vencida»,
-- «Tienes 3 tareas vencidas») en lugar de «tarea(s) vencida(s)». Solo cambia ese texto; los permisos de
-- la función se conservan (create or replace no los toca).
create or replace function public.generate_alerts()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.alert_settings%rowtype;
  v_today text := to_char((now() at time zone 'America/Bogota')::date, 'YYYY-MM-DD');
  v_count int := 0;
  v_n int;
begin
  if auth.uid() is not null and not public.has_perm('system', 'customize') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select * into s from public.alert_settings where id = 1;
  if not found or not s.enabled then
    return 0;
  end if;

  if s.notify_overdue_close then
    insert into public.notifications (user_id, title, body, link, dedupe_key)
    select o.owner_id, 'Fecha de cierre vencida', o.name || ' · cerraba el ' || to_char(o.close_date, 'DD/MM/YYYY'),
           '/oportunidades/' || o.id, 'close:' || o.id || ':' || v_today
    from public.opportunities o
    join public.profiles p on p.id = o.owner_id and p.is_active
    where not o.is_closed and o.close_date < (now() at time zone 'America/Bogota')::date
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
    get diagnostics v_n = row_count;
    v_count := v_count + v_n;
  end if;

  if s.notify_stale then
    insert into public.notifications (user_id, title, body, link, dedupe_key)
    select o.owner_id, 'Oportunidad sin actividad', o.name || ' · ' || s.stale_days || ' días sin actividades ni cambios de etapa',
           '/oportunidades/' || o.id, 'stale:' || o.id || ':' || to_char(date_trunc('week', now()), 'YYYY-MM-DD')
    from public.opportunities o
    join public.profiles p on p.id = o.owner_id and p.is_active
    where not o.is_closed
      and o.stage_changed_at < now() - make_interval(days => s.stale_days)
      and not exists (
        select 1 from public.activities a
        where a.opportunity_id = o.id and coalesce(a.completed_at, a.created_at) > now() - make_interval(days => s.stale_days)
      )
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
    get diagnostics v_n = row_count;
    v_count := v_count + v_n;
  end if;

  if s.notify_overdue_tasks then
    insert into public.notifications (user_id, title, body, link, dedupe_key)
    select a.owner_id,
           case when count(*) = 1 then 'Tienes 1 tarea vencida' else 'Tienes ' || count(*) || ' tareas vencidas' end,
           'Revisa tu agenda para ponerte al día.',
           '/actividades', 'tasks:' || a.owner_id || ':' || v_today
    from public.activities a
    join public.profiles p on p.id = a.owner_id and p.is_active
    where a.status in ('pending', 'in_progress') and a.activity_type in ('task', 'call')
      and a.due_date < (now() at time zone 'America/Bogota')::date
    group by a.owner_id
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
    get diagnostics v_n = row_count;
    v_count := v_count + v_n;
  end if;

  update public.alert_settings set last_run_at = now(), last_run_count = v_count where id = 1;
  return v_count;
end;
$$;
