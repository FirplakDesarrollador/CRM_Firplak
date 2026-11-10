-- Modo sin conexión, parte A: la descarga del día («Preparar el día», decisiones de Luis del 9 nov 2026).
--
-- Una sola llamada devuelve lo que un asesor consulta sin señal, tal como estaba en ese instante:
--   · sus clientes: las cuentas de las que es propietario o en cuyo equipo está, más las de sus oportunidades
--     abiertas y las de su agenda, con sus contactos;
--   · sus oportunidades abiertas;
--   · su agenda: pendientes (tareas, llamadas y reuniones) vencidos, sin fecha o de los próximos 7 días, y las
--     reuniones de esos 7 días;
--   · el catálogo activo y los precios de las listas activas (las de canal y las propias de sus clientes).
--
-- Corre con los permisos de quien la llama (security invoker): las reglas RLS deciden qué ve cada persona. Va en
-- una función y no en consultas por tabla para no toparse con el límite de filas de la API y para que precios,
-- clientes y agenda salgan de la misma foto.

create or replace function public.offline_snapshot()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with me as (
    select p.id, p.full_name from public.profiles p where p.id = auth.uid()
  ),
  hoy as (
    select d, (d::timestamp at time zone 'America/Bogota') as desde, ((d + 8)::timestamp at time zone 'America/Bogota') as hasta
    from (select (now() at time zone 'America/Bogota')::date as d) x
  ),
  opps as (
    select o.id, o.name, o.account_id, o.contact_id, o.amount, o.currency, o.close_date, o.next_step, o.probability,
           s.name as stage, s.color as stage_color
    from public.opportunities o
    join me on me.id = o.owner_id
    left join public.pipeline_stages s on s.id = o.stage_id
    where not o.is_closed
  ),
  agenda as (
    select a.id, a.activity_type, a.subject, a.description, a.status, a.priority, a.due_date, a.start_at, a.end_at,
           a.location, a.account_id, a.contact_id, a.opportunity_id, a.lead_id,
           c.name as account_name, k.full_name as contact_name, o.name as opportunity_name, l.full_name as lead_name
    from public.activities a
    join me on me.id = a.owner_id
    cross join hoy
    left join public.accounts c on c.id = a.account_id
    left join public.contacts k on k.id = a.contact_id
    left join public.opportunities o on o.id = a.opportunity_id
    left join public.leads l on l.id = a.lead_id
    where a.activity_type in ('task', 'call', 'meeting')
      and (
        (a.status in ('pending', 'in_progress')
          and ((a.due_date is null and a.start_at is null) or a.due_date <= hoy.d + 7 or a.start_at < hoy.hasta))
        or (a.activity_type = 'meeting' and a.status <> 'cancelled' and a.start_at >= hoy.desde and a.start_at < hoy.hasta)
      )
  ),
  accts as (
    select a.id, a.name, a.account_number, a.account_type, a.industry, a.market, a.segment, a.tax_id, a.phone, a.email,
           a.website, a.rating, a.payment_terms, a.price_book_id, a.sap_card_code, a.owner_id,
           a.billing_street, a.billing_city, a.billing_state, a.billing_country,
           a.shipping_street, a.shipping_city, a.shipping_state, a.shipping_country
    from public.accounts a
    where a.owner_id = (select id from me)
       or a.id in (select t.account_id from public.account_team_members t where t.user_id = (select id from me))
       or a.id in (select account_id from opps)
       or a.id in (select account_id from agenda)
  ),
  people as (
    select k.id, k.account_id, k.full_name, k.title, k.email, k.phone, k.mobile
    from public.contacts k
    where k.account_id in (select id from accts)
  ),
  items as (
    select p.id, p.name, p.product_code, p.family, p.unit, p.description
    from public.products p
    where p.is_active
  ),
  books as (
    select b.id, b.name, b.market, b.channel, b.currency, b.is_client_list
    from public.price_books b
    where b.is_active and (not b.is_client_list or b.id in (select price_book_id from accts))
  ),
  prices as (
    select e.price_book_id, e.product_id, e.unit_price
    from public.price_book_entries e
    where e.is_active and e.price_book_id in (select id from books) and e.product_id in (select id from items)
  )
  select jsonb_build_object(
    'version', 1,
    'generated_at', now(),
    'today', (select d from hoy),
    'user', (select jsonb_build_object('id', me.id, 'name', me.full_name) from me),
    'accounts', coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from accts x), '[]'::jsonb),
    'contacts', coalesce((select jsonb_agg(to_jsonb(x) order by x.full_name) from people x), '[]'::jsonb),
    'opportunities', coalesce((select jsonb_agg(to_jsonb(x) order by x.close_date nulls last, x.name) from opps x), '[]'::jsonb),
    'activities', coalesce((select jsonb_agg(to_jsonb(x) order by coalesce(x.start_at, x.due_date::timestamp at time zone 'America/Bogota') nulls last, x.subject) from agenda x), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from items x), '[]'::jsonb),
    'price_books', coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from books x), '[]'::jsonb),
    -- Los precios van compactos (lista, producto, precio): con el catálogo completo son decenas de miles.
    'prices', coalesce((select jsonb_agg(jsonb_build_array(x.price_book_id, x.product_id, x.unit_price)) from prices x), '[]'::jsonb)
  );
$$;

comment on function public.offline_snapshot() is
  'Descarga del día para consultar sin conexión: clientes, contactos, oportunidades abiertas y agenda de quien la llama, con el catálogo activo y sus precios.';

revoke execute on function public.offline_snapshot() from public, anon;
grant execute on function public.offline_snapshot() to authenticated;
