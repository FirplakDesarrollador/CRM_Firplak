-- Firplak CRM · Fase 17: servidor MCP para asistentes de IA (Claude, Cursor, Grok, Antigravity…).
-- Cada persona crea su propio token; el asistente actúa como ese usuario, con sus mismos
-- permisos y reglas de visibilidad (RLS). Dos permisos del sistema en el perfil:
--   · use_mcp: consultar con asistentes de IA.
--   · mcp_write: además, crear y modificar registros (cada cambio pide confirmación).
-- Los tokens se guardan solo como hash; el valor se muestra una vez al crearlo.

create table public.mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  name text not null check (length(trim(name)) > 0),
  token_prefix text not null,
  token_hash text not null unique,
  scope text not null default 'read' check (scope in ('read', 'write')),
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index mcp_tokens_user_idx on public.mcp_tokens (user_id);
alter table public.mcp_tokens enable row level security;
create policy "tokens mcp: ver" on public.mcp_tokens for select to authenticated
  using (user_id = auth.uid() or public.has_perm('system', 'manage_users'));
create policy "tokens mcp: crear" on public.mcp_tokens for insert to authenticated
  with check (user_id = auth.uid() and public.has_perm('system', 'use_mcp')
              and (scope = 'read' or public.has_perm('system', 'mcp_write')));
-- Solo se revocan (no se editan): propio o, para administración de usuarios, cualquiera.
create policy "tokens mcp: revocar" on public.mcp_tokens for update to authenticated
  using (user_id = auth.uid() or public.has_perm('system', 'manage_users'))
  with check (user_id = auth.uid() or public.has_perm('system', 'manage_users'));
create policy "tokens mcp: eliminar" on public.mcp_tokens for delete to authenticated
  using (user_id = auth.uid());

-- Un token solo cambia al revocarse (para siempre) o al registrar su último uso.
create or replace function public.mcp_tokens_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'revoked_at' - 'last_used_at') <> (to_jsonb(old) - 'revoked_at' - 'last_used_at')
     or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) then
    raise exception 'Un token no se puede modificar; revócalo y crea otro' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger mcp_tokens_guard before update on public.mcp_tokens
  for each row execute function public.mcp_tokens_guard();

-- Permiso del sistema para un usuario cualquiera (has_perm usa al usuario actual).
create or replace function public.user_has_system_perm(p_user uuid, p_action text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select pp.is_admin or coalesce((pp.permissions -> 'system' ->> p_action)::boolean, false)
    from public.profiles p
    join public.permission_profiles pp on pp.id = p.permission_profile_id
    where p.id = p_user and p.is_active
  ), false);
$$;
revoke execute on function public.user_has_system_perm(uuid, text) from public, anon, authenticated;

-- Resuelve un token (por su hash) para el servidor MCP: usuario, correo y alcance efectivo.
-- Se puede llamar sin sesión: sin el token original el hash no sirve de nada.
create or replace function public.mcp_resolve_token(p_hash text)
returns table (token_id uuid, user_id uuid, email text, scope text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.mcp_tokens;
begin
  select * into v from public.mcp_tokens t
  where t.token_hash = p_hash and t.revoked_at is null and (t.expires_at is null or t.expires_at > now());
  if not found or not public.user_has_system_perm(v.user_id, 'use_mcp') then
    return;
  end if;
  update public.mcp_tokens set last_used_at = now()
  where id = v.id and (last_used_at is null or last_used_at < now() - interval '1 minute');
  return query
    select v.id, v.user_id, p.email,
           case when v.scope = 'write' and public.user_has_system_perm(v.user_id, 'mcp_write') then 'write' else 'read' end
    from public.profiles p where p.id = v.user_id;
end;
$$;
grant execute on function public.mcp_resolve_token(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cambios pendientes de confirmación: el asistente muestra la vista previa y solo
-- aplica el cambio al volver a llamar con el código (10 minutos, una sola vez).
-- ---------------------------------------------------------------------------
create table public.mcp_confirmations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  token_id uuid references public.mcp_tokens (id) on delete cascade,
  tool text not null,
  args_hash text not null,
  summary text not null,
  expires_at timestamptz not null default now() + interval '10 minutes',
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.mcp_confirmations enable row level security;
create policy "confirmaciones mcp: propias" on public.mcp_confirmations for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Registro de lo que hacen los asistentes (consultas y cambios), para la persona y administración.
create table public.mcp_activity (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  token_id uuid references public.mcp_tokens (id) on delete set null,
  tool text not null,
  object text,
  record_id uuid,
  summary text,
  is_change boolean not null default false,
  created_at timestamptz not null default now()
);
create index mcp_activity_user_idx on public.mcp_activity (user_id, created_at desc);
alter table public.mcp_activity enable row level security;
create policy "actividad mcp: ver" on public.mcp_activity for select to authenticated
  using (user_id = auth.uid() or public.has_perm('system', 'manage_users'));
create policy "actividad mcp: registrar" on public.mcp_activity for insert to authenticated
  with check (user_id = auth.uid());
