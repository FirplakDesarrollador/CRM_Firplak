-- Promotores (decisión de Luis, 13 nov 2026): el promotor es el apoyo de su ejecutivo y, además de sus clientes, ve
-- sus oportunidades, cotizaciones, pedidos y actividades. La rama de roles que comparte tiene ahora dos niveles:
--   · `share_within`: clientes, contactos y prospectos (lo que usa B2C para no duplicar clientes).
--   · `share_business`: además, oportunidades, cotizaciones, pedidos y actividades (ejecutivo y sus promotores).
-- Siempre solo lectura: modificar sigue dependiendo de ser el dueño o estar por encima en la jerarquía.

alter table public.roles add column share_business boolean not null default false;
alter table public.roles add constraint roles_share_business_needs_within check (not share_business or share_within);
comment on column public.roles.share_business is
  'Con share_within: la rama comparte también oportunidades, cotizaciones, pedidos y actividades (solo lectura).';

-- ¿El dueño del registro está en una rama que comparte ese tipo de registro y a la que pertenece quien consulta?
create function public.shares_branch_with(p_owner uuid, p_object text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with recursive mine as (
    select r.id, r.parent_id, r.share_within, r.share_business
    from public.roles r
    where r.id = (select p.role_id from public.profiles p where p.id = auth.uid() and p.is_active)
    union
    select r.id, r.parent_id, r.share_within, r.share_business
    from public.roles r
    join mine m on r.id = m.parent_id
  ),
  branch as (
    select m.id from mine m
    where m.share_within
      and (p_object in ('accounts', 'contacts', 'leads')
           or (m.share_business and p_object in ('opportunities', 'quotes', 'orders', 'activities')))
    union
    select r.id from public.roles r join branch b on r.parent_id = b.id
  )
  select p_owner is not null and p_owner <> auth.uid() and exists (
    select 1 from public.profiles o where o.id = p_owner and o.role_id in (select b.id from branch b)
  );
$$;
revoke execute on function public.shares_branch_with(uuid, text) from public, anon, authenticated;

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
    or public.shares_branch_with(p_owner, p_object)
  );
$$;

drop function public.shares_branch_with(uuid);
