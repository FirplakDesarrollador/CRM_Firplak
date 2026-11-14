-- Dos piezas de visibilidad que pidió Luis (13 nov 2026) para cargar la estructura comercial real:
--
-- 1. Compartir dentro de una rama de roles. En B2C (tiendas y ecommerce) todos necesitan ver los clientes, contactos
--    y prospectos de los demás para no duplicarlos, sin poder modificarlos. Un rol marcado con `share_within` hace
--    que quienes tienen ese rol o uno que depende de él se vean entre sí esos tres objetos (solo lectura). Las
--    oportunidades y cotizaciones siguen siendo de quien las crea.
--
-- 2. «Existe, pero no es tuyo». Con las cuentas en privado, el aviso de duplicados solo revisaba lo que la persona
--    podía ver: un asesor creaba un cliente que ya era de otro y nadie le avisaba. Ahora el aviso revisa todo y, de lo
--    que no puede abrir, dice solo que existe y a cargo de quién está. La búsqueda hace lo mismo con los clientes.

alter table public.roles add column share_within boolean not null default false;
comment on column public.roles.share_within is
  'Quienes tienen este rol o uno que depende de él ven entre sí los clientes, contactos y prospectos (solo lectura).';

-- ¿El dueño del registro está en una rama de roles que comparte y a la que pertenece quien consulta?
create function public.shares_branch_with(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with recursive mine as (
    -- Mi rol y los que están por encima.
    select r.id, r.parent_id, r.share_within
    from public.roles r
    where r.id = (select p.role_id from public.profiles p where p.id = auth.uid() and p.is_active)
    union
    select r.id, r.parent_id, r.share_within
    from public.roles r
    join mine m on r.id = m.parent_id
  ),
  branch as (
    -- Los roles que comparten entre los míos, y todo lo que depende de ellos.
    select m.id from mine m where m.share_within
    union
    select r.id from public.roles r join branch b on r.parent_id = b.id
  )
  select p_owner is not null and p_owner <> auth.uid() and exists (
    select 1 from public.profiles o where o.id = p_owner and o.role_id in (select b.id from branch b)
  );
$$;
revoke execute on function public.shares_branch_with(uuid) from public, anon, authenticated;

-- Leer un registro: como antes, más la rama que comparte para clientes, contactos y prospectos.
create or replace function public.can_read_record(p_object text, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_perm(p_object, 'read') and (
    public.sharing_access(p_object) in ('read', 'read_write')
    or public.has_perm(p_object, 'view_all')
    or public.has_perm(p_object, 'modify_all')
    or public.can_access_owner(p_owner)
    or (p_object in ('accounts', 'contacts', 'leads') and public.shares_branch_with(p_owner))
  );
$$;

-- Posibles duplicados de un registro que se va a crear. Revisa todos los registros, no solo los que la persona puede
-- ver: de los que no puede abrir devuelve lo mínimo para reconocerlos (sin id) y quién los tiene a cargo.
drop function public.possible_duplicates(text, text, text, text);
create function public.possible_duplicates(p_object text, p_name text, p_email text default null, p_tax_id text default null)
returns table (id uuid, label text, owner_name text, can_open boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with found as (
    select a.id, a.name || coalesce(' · NIT ' || a.tax_id, '') || coalesce(' · ' || a.billing_city, '') as label, a.owner_id,
           public.can_read_team_record('accounts', a.owner_id, a.id) as can_open
    from public.accounts a
    where p_object = 'accounts'
      and (public.normalize_text(a.name) = public.normalize_text(p_name)
           or (length(regexp_replace(coalesce(p_tax_id, ''), '\D', '', 'g')) >= 6
               and regexp_replace(coalesce(a.tax_id, ''), '\D', '', 'g') = regexp_replace(p_tax_id, '\D', '', 'g')))
    union all
    select c.id, c.full_name, c.owner_id, public.can_read_team_record('contacts', c.owner_id, c.id)
    from public.contacts c
    where p_object = 'contacts'
      and ((p_email is not null and lower(c.email) = lower(trim(p_email))) or public.normalize_text(c.full_name) = public.normalize_text(p_name))
    union all
    select l.id, l.full_name || ' · ' || l.company, l.owner_id, public.can_read_record('leads', l.owner_id)
    from public.leads l
    where p_object = 'leads' and not l.is_converted
      and ((p_email is not null and lower(l.email) = lower(trim(p_email))) or public.normalize_text(l.full_name || l.company) = public.normalize_text(p_name))
  )
  select case when f.can_open then f.id end, f.label, nullif(o.full_name, ''), f.can_open
  from found f
  left join public.profiles o on o.id = f.owner_id
  where public.has_perm(p_object, 'read')
  order by f.can_open desc
  limit 5;
$$;
revoke execute on function public.possible_duplicates(text, text, text, text) from public, anon;
grant execute on function public.possible_duplicates(text, text, text, text) to authenticated;

-- Búsqueda: clientes que existen y la persona no puede abrir. Solo nombre, NIT, ciudad y responsable.
create function public.account_directory(p_query text, p_limit int default 8)
returns table (name text, tax_id text, city text, owner_name text)
language sql
stable
security definer
set search_path = ''
as $$
  with q as (
    select trim(coalesce(p_query, '')) as raw,
           '%' || replace(replace(trim(coalesce(p_query, '')), '%', ''), '_', '') || '%' as pattern
  )
  select a.name, a.tax_id, a.billing_city, nullif(o.full_name, '')
  from public.accounts a
  cross join q
  left join public.profiles o on o.id = a.owner_id
  where public.has_perm('accounts', 'read')
    and length(q.raw) >= 3
    and (a.name ilike q.pattern or a.tax_id ilike q.pattern)
    and not public.can_read_team_record('accounts', a.owner_id, a.id)
  order by a.name
  limit least(greatest(coalesce(p_limit, 8), 1), 20);
$$;
revoke execute on function public.account_directory(text, int) from public, anon;
grant execute on function public.account_directory(text, int) to authenticated;
