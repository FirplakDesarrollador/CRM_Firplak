-- Firplak CRM · Núcleo de seguridad: perfiles de usuario, roles, perfiles de permisos
-- y reglas de visibilidad (permisos por objeto + jerarquía de roles + compartir por defecto).

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Roles (jerarquía): un gerente ve los registros de los roles que dependen de él.
-- ---------------------------------------------------------------------------
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  parent_id uuid references public.roles (id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger roles_updated_at before update on public.roles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Perfiles de permisos: qué puede hacer el usuario sobre cada objeto.
-- permissions = {
--   "accounts": {"read":true,"create":true,"edit":true,"delete":false,"view_all":false,"modify_all":false},
--   ...,
--   "system": {"manage_users":false,"customize":false,"view_dashboards":true,"export":true}
-- }
-- ---------------------------------------------------------------------------
create table public.permission_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_admin boolean not null default false,
  is_default boolean not null default false,
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index permission_profiles_single_default
  on public.permission_profiles (is_default) where is_default;
create trigger permission_profiles_updated_at before update on public.permission_profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Usuarios del CRM (1:1 con auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  title text,
  phone text,
  avatar_url text,
  role_id uuid references public.roles (id) on delete set null,
  permission_profile_id uuid references public.permission_profiles (id) on delete set null,
  manager_id uuid references public.profiles (id) on delete set null,
  is_active boolean not null default true,
  -- Preferencias personales: tema, idioma, página de inicio, densidad, etc.
  preferences jsonb not null default '{"theme":"system","language":"es","home_page":"/inicio","density":"comfortable"}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role_id);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Compartir por defecto (equivalente a "organization-wide defaults")
--   private     -> solo propietario, jerarquía y quien tenga "ver todo"
--   read        -> todos leen, solo propietario/jerarquía editan
--   read_write  -> todos leen y editan
-- ---------------------------------------------------------------------------
create table public.sharing_settings (
  object text primary key,
  access text not null default 'private' check (access in ('private', 'read', 'read_write')),
  updated_at timestamptz not null default now()
);
create trigger sharing_settings_updated_at before update on public.sharing_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Funciones de autorización (security definer para evitar recursión de RLS)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select pp.is_admin
    from public.profiles p
    join public.permission_profiles pp on pp.id = p.permission_profile_id
    where p.id = auth.uid() and p.is_active
  ), false);
$$;

create or replace function public.has_perm(p_object text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select pp.is_admin
        or coalesce((pp.permissions -> p_object ->> p_action)::boolean, false)
    from public.profiles p
    join public.permission_profiles pp on pp.id = p.permission_profile_id
    where p.id = auth.uid() and p.is_active
  ), false);
$$;

-- ¿El usuario actual es el propietario o está por encima en la jerarquía de roles?
create or replace function public.can_access_owner(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_owner is not null and (
    p_owner = auth.uid()
    or exists (
      with recursive subordinate_roles as (
        select r.id
        from public.roles r
        where r.parent_id = (select role_id from public.profiles where id = auth.uid())
        union
        select r.id
        from public.roles r
        join subordinate_roles s on r.parent_id = s.id
      )
      select 1
      from public.profiles owner_profile
      where owner_profile.id = p_owner
        and owner_profile.role_id in (select id from subordinate_roles)
    )
  );
$$;

create or replace function public.sharing_access(p_object text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select access from public.sharing_settings where object = p_object), 'private');
$$;

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
  );
$$;

create or replace function public.can_edit_record(p_object text, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_perm(p_object, 'edit') and (
    public.sharing_access(p_object) = 'read_write'
    or public.has_perm(p_object, 'modify_all')
    or public.can_access_owner(p_owner)
  );
$$;

create or replace function public.can_delete_record(p_object text, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_perm(p_object, 'delete') and (
    public.has_perm(p_object, 'modify_all')
    or public.can_access_owner(p_owner)
  );
$$;

-- ---------------------------------------------------------------------------
-- Alta automática del perfil al registrarse. El primer usuario es administrador
-- y recibe como propios los registros de demostración sin propietario.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_first boolean;
  v_profile uuid;
  v_role uuid;
begin
  select not exists (select 1 from public.profiles) into v_is_first;

  if v_is_first then
    select id into v_profile from public.permission_profiles where is_admin order by created_at limit 1;
    select id into v_role from public.roles where parent_id is null order by sort_order, created_at limit 1;
  else
    select id into v_profile from public.permission_profiles where is_default limit 1;
  end if;

  insert into public.profiles (id, email, full_name, permission_profile_id, role_id)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, ''), '@', 1)),
    v_profile,
    v_role
  );

  if v_is_first then
    perform public.claim_demo_records(new.id);
  end if;

  return new;
end;
$$;

-- Se redefine en la migración de objetos comerciales; aquí solo existe para que el
-- trigger compile si se aplica esta migración de forma aislada.
create or replace function public.claim_demo_records(p_owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  return;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Un usuario no puede cambiar su propio rol, perfil de permisos ni estado.
create or replace function public.protect_profile_security_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or public.has_perm('system', 'manage_users') then
    return new;
  end if;
  if new.role_id is distinct from old.role_id
     or new.permission_profile_id is distinct from old.permission_profile_id
     or new.is_active is distinct from old.is_active
     or new.manager_id is distinct from old.manager_id
     or new.email is distinct from old.email then
    raise exception 'No tienes permiso para cambiar rol, perfil, jefe, correo o estado del usuario'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_security_fields
  before update on public.profiles
  for each row execute function public.protect_profile_security_fields();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.roles enable row level security;
alter table public.permission_profiles enable row level security;
alter table public.profiles enable row level security;
alter table public.sharing_settings enable row level security;

create policy "roles: lectura para usuarios" on public.roles
  for select to authenticated using (true);
create policy "roles: administración" on public.roles
  for all to authenticated
  using (public.has_perm('system', 'manage_users'))
  with check (public.has_perm('system', 'manage_users'));

create policy "perfiles de permisos: lectura" on public.permission_profiles
  for select to authenticated using (true);
create policy "perfiles de permisos: administración" on public.permission_profiles
  for all to authenticated
  using (public.has_perm('system', 'manage_users'))
  with check (public.has_perm('system', 'manage_users'));

create policy "usuarios: lectura del directorio" on public.profiles
  for select to authenticated using (true);
create policy "usuarios: editar el propio perfil" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.has_perm('system', 'manage_users'))
  with check (id = auth.uid() or public.has_perm('system', 'manage_users'));

create policy "compartir: lectura" on public.sharing_settings
  for select to authenticated using (true);
create policy "compartir: administración" on public.sharing_settings
  for all to authenticated
  using (public.has_perm('system', 'customize'))
  with check (public.has_perm('system', 'customize'));

-- Permisos efectivos del usuario actual (para pintar la interfaz).
create or replace function public.my_permissions()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object(
      'is_admin', pp.is_admin,
      'profile', pp.name,
      'permissions', pp.permissions
    )
    from public.profiles p
    join public.permission_profiles pp on pp.id = p.permission_profile_id
    where p.id = auth.uid() and p.is_active
  ), jsonb_build_object('is_admin', false, 'profile', null, 'permissions', '{}'::jsonb));
$$;

grant execute on function public.has_perm(text, text) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.my_permissions() to authenticated;
grant execute on function public.can_access_owner(uuid) to authenticated;
revoke execute on function public.claim_demo_records(uuid) from public, anon, authenticated;
