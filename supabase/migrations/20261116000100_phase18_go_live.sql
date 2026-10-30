-- Firplak CRM · Fase 18: salida en vivo.
-- Borra los registros de demostración (is_demo) para empezar con datos reales. Conserva la
-- configuración: perfiles, roles, pipelines, campos, listas, reglas, procesos, informes y
-- plantillas. La usan la instalación limpia (setup-produccion.sql) y Configuración → Resumen.

create or replace function public.demo_data_counts()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'accounts', (select count(*) from public.accounts where is_demo),
    'contacts', (select count(*) from public.contacts where is_demo),
    'opportunities', (select count(*) from public.opportunities where is_demo),
    'leads', (select count(*) from public.leads where is_demo),
    'quotes', (select count(*) from public.quotes where is_demo),
    'orders', (select count(*) from public.orders where is_demo),
    'cases', (select count(*) from public.cases where is_demo),
    'campaigns', (select count(*) from public.campaigns where is_demo),
    'products', (select count(*) from public.products where is_demo),
    'activities', (select count(*) from public.activities where is_demo)
  );
$$;
grant execute on function public.demo_data_counts() to authenticated;

create or replace function public.purge_demo_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_counts jsonb;
begin
  -- Desde el SQL Editor (sin usuario) o por administración de usuarios.
  if auth.uid() is not null and not public.has_perm('system', 'manage_users') then
    raise exception 'Solo administración puede borrar los datos de ejemplo' using errcode = '42501';
  end if;
  v_counts := public.demo_data_counts();

  -- Solicitudes de aprobación de registros de ejemplo (no tienen llave foránea).
  delete from public.approval_requests r
  where (r.object = 'accounts' and r.record_id in (select id from public.accounts where is_demo))
     or (r.object = 'contacts' and r.record_id in (select id from public.contacts where is_demo))
     or (r.object = 'opportunities' and r.record_id in (select id from public.opportunities where is_demo))
     or (r.object = 'leads' and r.record_id in (select id from public.leads where is_demo))
     or (r.object = 'quotes' and r.record_id in (select id from public.quotes where is_demo))
     or (r.object = 'orders' and r.record_id in (select id from public.orders where is_demo))
     or (r.object = 'cases' and r.record_id in (select id from public.cases where is_demo))
     or (r.object = 'campaigns' and r.record_id in (select id from public.campaigns where is_demo))
     or (r.object = 'products' and r.record_id in (select id from public.products where is_demo));

  -- Lo que cuelga de registros de ejemplo (p. ej. un pedido creado sobre una cuenta demo)
  -- también se va: sin la cuenta u oportunidad no tiene sentido.
  delete from public.orders o
  where o.is_demo
     or o.account_id in (select id from public.accounts where is_demo)
     or o.opportunity_id in (select id from public.opportunities where is_demo)
     or o.quote_id in (select id from public.quotes where is_demo);
  delete from public.quotes q
  where q.is_demo
     or q.opportunity_id in (select id from public.opportunities where is_demo)
     or q.account_id in (select id from public.accounts where is_demo);
  delete from public.activities a
  where a.is_demo
     or a.opportunity_id in (select id from public.opportunities where is_demo)
     or a.account_id in (select id from public.accounts where is_demo);
  delete from public.cases c where c.is_demo or c.account_id in (select id from public.accounts where is_demo);
  delete from public.opportunities o where o.is_demo or o.account_id in (select id from public.accounts where is_demo);
  delete from public.campaign_members where campaign_id in (select id from public.campaigns where is_demo);
  delete from public.leads where is_demo;
  delete from public.campaigns where is_demo;
  delete from public.contacts c where c.is_demo or c.account_id in (select id from public.accounts where is_demo);
  update public.accounts set parent_account_id = null
  where parent_account_id in (select id from public.accounts where is_demo);
  delete from public.accounts where is_demo;
  delete from public.products p
  where p.is_demo
    and not exists (select 1 from public.quote_line_items l where l.product_id = p.id)
    and not exists (select 1 from public.order_items i where i.product_id = p.id);

  -- El historial del pronóstico se tomó sobre los datos de ejemplo.
  delete from public.forecast_snapshots;
  return v_counts;
end;
$$;
grant execute on function public.purge_demo_data() to authenticated;
