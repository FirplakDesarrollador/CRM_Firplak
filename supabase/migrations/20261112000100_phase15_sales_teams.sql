-- Firplak CRM · Fase 15: equipos de cuenta y de oportunidad.
-- Varias personas trabajan un mismo registro con un rol (asesor de proyectos, especificador,
-- soporte técnico…) y un nivel de acceso, sin cambiar el propietario. Como en Sales Cloud:
--   · Equipo de cuenta: acceso a la cuenta y, por separado, a sus oportunidades, casos y contactos.
--   · Equipo de oportunidad: acceso a la oportunidad (y lectura de sus cotizaciones y pedidos).
--   · Equipo predeterminado de cada usuario, que se agrega al crear registros si lo activa.
-- Gestionan el equipo el propietario, quienes están por encima en la jerarquía y quien
-- modifica todo; el acceso de equipo nunca permite eliminar el registro.

create table public.account_team_members (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  team_role text not null default 'Otro' check (length(trim(team_role)) > 0),
  account_access text not null default 'read' check (account_access in ('read', 'edit')),
  opportunity_access text not null default 'none' check (opportunity_access in ('none', 'read', 'edit')),
  case_access text not null default 'none' check (case_access in ('none', 'read', 'edit')),
  contact_access text not null default 'none' check (contact_access in ('none', 'read', 'edit')),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (account_id, user_id)
);
create index account_team_members_user_idx on public.account_team_members (user_id);

create table public.opportunity_team_members (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  team_role text not null default 'Otro' check (length(trim(team_role)) > 0),
  access text not null default 'read' check (access in ('read', 'edit')),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (opportunity_id, user_id)
);
create index opportunity_team_members_user_idx on public.opportunity_team_members (user_id);

-- Equipo predeterminado: para cuentas usa los cuatro niveles; para oportunidades, solo «access».
create table public.default_team_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  object text not null check (object in ('accounts', 'opportunities')),
  user_id uuid not null references public.profiles (id) on delete cascade,
  team_role text not null default 'Otro' check (length(trim(team_role)) > 0),
  access text not null default 'read' check (access in ('read', 'edit')),
  opportunity_access text not null default 'none' check (opportunity_access in ('none', 'read', 'edit')),
  case_access text not null default 'none' check (case_access in ('none', 'read', 'edit')),
  contact_access text not null default 'none' check (contact_access in ('none', 'read', 'edit')),
  created_at timestamptz not null default now(),
  unique (owner_id, object, user_id),
  check (owner_id <> user_id)
);

-- ---------------------------------------------------------------------------
-- Acceso por equipo del usuario actual a un registro: 'edit', 'read' o null.
-- Cotizaciones y pedidos heredan solo lectura de la oportunidad (o de la cuenta).
-- ---------------------------------------------------------------------------
create or replace function public.team_access(p_object text, p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_level int := 0;
  v_account uuid;
  v_opp uuid;
  rank_of constant jsonb := '{"none": 0, "read": 1, "edit": 2}';
begin
  if v_uid is null or p_id is null then
    return null;
  end if;

  if p_object = 'accounts' then
    select (rank_of ->> m.account_access)::int into v_level
    from public.account_team_members m where m.account_id = p_id and m.user_id = v_uid;

  elsif p_object = 'opportunities' then
    select o.account_id into v_account from public.opportunities o where o.id = p_id;
    select greatest(
      coalesce((select (rank_of ->> m.access)::int from public.opportunity_team_members m
                where m.opportunity_id = p_id and m.user_id = v_uid), 0),
      coalesce((select (rank_of ->> m.opportunity_access)::int from public.account_team_members m
                where m.account_id = v_account and m.user_id = v_uid), 0)
    ) into v_level;

  elsif p_object = 'contacts' then
    select (rank_of ->> m.contact_access)::int into v_level
    from public.contacts c join public.account_team_members m on m.account_id = c.account_id
    where c.id = p_id and m.user_id = v_uid;

  elsif p_object = 'cases' then
    select (rank_of ->> m.case_access)::int into v_level
    from public.cases c join public.account_team_members m on m.account_id = c.account_id
    where c.id = p_id and m.user_id = v_uid;

  elsif p_object in ('quotes', 'orders') then
    if p_object = 'quotes' then
      select q.opportunity_id, q.account_id into v_opp, v_account from public.quotes q where q.id = p_id;
    else
      select o.opportunity_id, o.account_id into v_opp, v_account from public.orders o where o.id = p_id;
    end if;
    if v_opp is not null then
      v_level := least(1, case public.team_access('opportunities', v_opp) when 'edit' then 2 when 'read' then 1 else 0 end);
    elsif v_account is not null then
      select least(1, (rank_of ->> m.opportunity_access)::int) into v_level
      from public.account_team_members m where m.account_id = v_account and m.user_id = v_uid;
    end if;
  end if;

  return case coalesce(v_level, 0) when 2 then 'edit' when 1 then 'read' else null end;
end;
$$;
grant execute on function public.team_access(text, uuid) to authenticated;

-- Lectura/edición considerando, además del propietario y la jerarquía, el equipo.
create or replace function public.can_read_team_record(p_object text, p_owner uuid, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_read_record(p_object, p_owner)
      or (public.has_perm(p_object, 'read') and public.team_access(p_object, p_id) is not null);
$$;
grant execute on function public.can_read_team_record(text, uuid, uuid) to authenticated;

create or replace function public.can_edit_team_record(p_object text, p_owner uuid, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_edit_record(p_object, p_owner)
      or (public.has_perm(p_object, 'edit') and public.team_access(p_object, p_id) = 'edit');
$$;
grant execute on function public.can_edit_team_record(text, uuid, uuid) to authenticated;

-- Quién gestiona el equipo: propietario, su jerarquía o quien modifica todo (con permiso de edición).
create or replace function public.can_manage_team(p_object text, p_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if p_object = 'accounts' then
    select owner_id into v_owner from public.accounts where id = p_id;
  elsif p_object = 'opportunities' then
    select owner_id into v_owner from public.opportunities where id = p_id;
  else
    return false;
  end if;
  if not found then
    return false;
  end if;
  return public.has_perm(p_object, 'edit')
     and (public.has_perm(p_object, 'modify_all') or public.can_access_owner(v_owner));
end;
$$;
grant execute on function public.can_manage_team(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Políticas: los registros comerciales también se ven/editan por equipo.
-- ---------------------------------------------------------------------------
drop policy "cuentas: ver" on public.accounts;
create policy "cuentas: ver" on public.accounts
  for select to authenticated using (public.can_read_team_record('accounts', owner_id, id));
drop policy "cuentas: editar" on public.accounts;
create policy "cuentas: editar" on public.accounts
  for update to authenticated
  using (public.can_edit_team_record('accounts', owner_id, id))
  with check (public.has_perm('accounts', 'edit'));

drop policy "contactos: ver" on public.contacts;
create policy "contactos: ver" on public.contacts
  for select to authenticated using (public.can_read_team_record('contacts', owner_id, id));
drop policy "contactos: editar" on public.contacts;
create policy "contactos: editar" on public.contacts
  for update to authenticated
  using (public.can_edit_team_record('contacts', owner_id, id))
  with check (public.has_perm('contacts', 'edit'));

drop policy "oportunidades: ver" on public.opportunities;
create policy "oportunidades: ver" on public.opportunities
  for select to authenticated using (public.can_read_team_record('opportunities', owner_id, id));
drop policy "oportunidades: editar" on public.opportunities;
create policy "oportunidades: editar" on public.opportunities
  for update to authenticated
  using (public.can_edit_team_record('opportunities', owner_id, id))
  with check (public.has_perm('opportunities', 'edit'));

drop policy "casos: ver" on public.cases;
create policy "casos: ver" on public.cases
  for select to authenticated using (public.can_read_team_record('cases', owner_id, id));
drop policy "casos: editar" on public.cases;
create policy "casos: editar" on public.cases for update to authenticated
  using (public.can_edit_team_record('cases', owner_id, id)) with check (public.has_perm('cases', 'edit'));

drop policy "cotizaciones: ver" on public.quotes;
create policy "cotizaciones: ver" on public.quotes
  for select to authenticated using (public.can_read_team_record('quotes', owner_id, id));
drop policy "pedidos: ver" on public.orders;
create policy "pedidos: ver" on public.orders
  for select to authenticated using (public.can_read_team_record('orders', owner_id, id));

-- Equipos: se ven si se ve el registro; los gestiona quien puede gestionar el equipo.
alter table public.account_team_members enable row level security;
alter table public.opportunity_team_members enable row level security;
alter table public.default_team_members enable row level security;

create policy "equipo de cuenta: ver" on public.account_team_members for select to authenticated
  using (exists (select 1 from public.accounts a where a.id = account_id));
create policy "equipo de cuenta: gestionar" on public.account_team_members for all to authenticated
  using (public.can_manage_team('accounts', account_id))
  with check (public.can_manage_team('accounts', account_id));

create policy "equipo de oportunidad: ver" on public.opportunity_team_members for select to authenticated
  using (exists (select 1 from public.opportunities o where o.id = opportunity_id));
create policy "equipo de oportunidad: gestionar" on public.opportunity_team_members for all to authenticated
  using (public.can_manage_team('opportunities', opportunity_id))
  with check (public.can_manage_team('opportunities', opportunity_id));

create policy "equipo predeterminado: propio" on public.default_team_members for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Reglas de los miembros: usuario activo y distinto del propietario; aviso al agregarlo.
-- ---------------------------------------------------------------------------
create or replace function public.validate_team_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if tg_table_name = 'account_team_members' then
    select owner_id into v_owner from public.accounts where id = new.account_id;
  else
    select owner_id into v_owner from public.opportunities where id = new.opportunity_id;
  end if;
  if new.user_id = v_owner then
    raise exception 'El propietario ya tiene acceso completo; no hace falta agregarlo al equipo' using errcode = '23514';
  end if;
  if not exists (select 1 from public.profiles where id = new.user_id and is_active) then
    raise exception 'Solo se pueden agregar usuarios activos' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger account_team_members_validate before insert or update on public.account_team_members
  for each row execute function public.validate_team_member();
create trigger opportunity_team_members_validate before insert or update on public.opportunity_team_members
  for each row execute function public.validate_team_member();

-- Aviso en la campana a quien se agrega (después de insertar: no avisa si el miembro ya estaba).
create or replace function public.notify_team_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_link text;
begin
  if new.user_id is not distinct from auth.uid() then
    return null;
  end if;
  if tg_table_name = 'account_team_members' then
    select 'Te agregaron al equipo de la cuenta «' || name || '»', '/cuentas/' || id into v_title, v_link
    from public.accounts where id = new.account_id;
  else
    select 'Te agregaron al equipo de la oportunidad «' || name || '»', '/oportunidades/' || id into v_title, v_link
    from public.opportunities where id = new.opportunity_id;
  end if;
  insert into public.notifications (user_id, title, body, link, created_by)
  values (new.user_id, v_title, 'Rol: ' || new.team_role, v_link, auth.uid());
  return null;
end;
$$;
create trigger account_team_members_notify after insert on public.account_team_members
  for each row execute function public.notify_team_member();
create trigger opportunity_team_members_notify after insert on public.opportunity_team_members
  for each row execute function public.notify_team_member();

-- Si el registro cambia de propietario y el nuevo estaba en el equipo, sale del equipo.
create or replace function public.drop_owner_from_team()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    if tg_table_name = 'accounts' then
      delete from public.account_team_members where account_id = new.id and user_id = new.owner_id;
    else
      delete from public.opportunity_team_members where opportunity_id = new.id and user_id = new.owner_id;
    end if;
  end if;
  return null;
end;
$$;
create trigger accounts_team_owner after update of owner_id on public.accounts
  for each row execute function public.drop_owner_from_team();
create trigger opportunities_team_owner after update of owner_id on public.opportunities
  for each row execute function public.drop_owner_from_team();

-- ---------------------------------------------------------------------------
-- Equipo predeterminado: se copia al registro (sin repetir ni incluir al propietario).
-- ---------------------------------------------------------------------------
create or replace function public.copy_default_team(p_object text, p_id uuid, p_owner uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
begin
  if p_object = 'accounts' then
    insert into public.account_team_members (account_id, user_id, team_role, account_access, opportunity_access, case_access, contact_access)
    select p_id, d.user_id, d.team_role, d.access, d.opportunity_access, d.case_access, d.contact_access
    from public.default_team_members d
    join public.profiles p on p.id = d.user_id and p.is_active
    where d.owner_id = p_owner and d.object = 'accounts' and d.user_id <> p_owner
    on conflict (account_id, user_id) do nothing;
  else
    insert into public.opportunity_team_members (opportunity_id, user_id, team_role, access)
    select p_id, d.user_id, d.team_role, d.access
    from public.default_team_members d
    join public.profiles p on p.id = d.user_id and p.is_active
    where d.owner_id = p_owner and d.object = 'opportunities' and d.user_id <> p_owner
    on conflict (opportunity_id, user_id) do nothing;
  end if;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.copy_default_team(text, uuid, uuid) from public, authenticated;

-- «Agregar equipo predeterminado» desde la ficha: el del propietario del registro.
create or replace function public.add_default_team(p_object text, p_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if not public.can_manage_team(p_object, p_id) then
    raise exception 'No puedes gestionar el equipo de este registro' using errcode = '42501';
  end if;
  if p_object = 'accounts' then
    select owner_id into v_owner from public.accounts where id = p_id;
  else
    select owner_id into v_owner from public.opportunities where id = p_id;
  end if;
  return public.copy_default_team(p_object, p_id, v_owner);
end;
$$;
grant execute on function public.add_default_team(text, uuid) to authenticated;

-- Al crear, si el propietario lo activó en Mis preferencias.
create or replace function public.auto_add_default_team()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := 'team_auto_add_' || tg_table_name;
begin
  if new.owner_id is not null and exists (
    select 1 from public.profiles p where p.id = new.owner_id and coalesce((p.preferences ->> v_key)::boolean, false)
  ) then
    perform public.copy_default_team(tg_table_name, new.id, new.owner_id);
  end if;
  return null;
end;
$$;
create trigger accounts_default_team after insert on public.accounts
  for each row execute function public.auto_add_default_team();
create trigger opportunities_default_team after insert on public.opportunities
  for each row execute function public.auto_add_default_team();

