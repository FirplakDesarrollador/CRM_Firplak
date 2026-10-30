-- Firplak CRM · Fase 19: OAuth 2.1 para el servidor MCP.
-- ChatGPT y Claude en la web no aceptan un token pegado: se registran solos (registro
-- dinámico de clientes), la persona inicia sesión y autoriza en el CRM, y la aplicación
-- recibe tokens de acceso de 1 hora que renueva con un token de refresco (30 días, rotativo).
-- Los tokens de acceso son tokens MCP normales ligados a una «aplicación conectada»
-- (oauth_grants): mismos permisos, confirmaciones y registro de uso. Todo se guarda como hash.

create table public.oauth_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  redirect_uris text[] not null,
  created_at timestamptz not null default now()
);
alter table public.oauth_clients enable row level security;

create table public.oauth_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid not null references public.oauth_clients (id) on delete cascade,
  scope text not null check (scope in ('read', 'write')),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index oauth_grants_user_idx on public.oauth_grants (user_id);
alter table public.oauth_grants enable row level security;
-- El nombre de la aplicación se ve si se ve alguna de sus conexiones (propias o, para administración, todas).
create policy "aplicaciones: ver" on public.oauth_clients for select to authenticated
  using (exists (select 1 from public.oauth_grants g where g.client_id = oauth_clients.id));
create policy "aplicaciones conectadas: ver" on public.oauth_grants for select to authenticated
  using (user_id = auth.uid() or public.has_perm('system', 'manage_users'));
create policy "aplicaciones conectadas: revocar" on public.oauth_grants for update to authenticated
  using (user_id = auth.uid() or public.has_perm('system', 'manage_users'))
  with check (user_id = auth.uid() or public.has_perm('system', 'manage_users'));

create table public.oauth_codes (
  code_hash text primary key,
  client_id uuid not null references public.oauth_clients (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  scope text not null,
  resource text,
  expires_at timestamptz not null default now() + interval '10 minutes',
  used_at timestamptz
);
alter table public.oauth_codes enable row level security;

create table public.oauth_refresh_tokens (
  token_hash text primary key,
  grant_id uuid not null references public.oauth_grants (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '30 days',
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.oauth_refresh_tokens enable row level security;

alter table public.mcp_tokens add column grant_id uuid references public.oauth_grants (id) on delete cascade;
create index mcp_tokens_grant_idx on public.mcp_tokens (grant_id);

-- Revocar una aplicación conectada revoca sus tokens de acceso y de refresco.
create or replace function public.oauth_grant_revoked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.revoked_at is not null and old.revoked_at is null then
    update public.mcp_tokens set revoked_at = now() where grant_id = new.id and revoked_at is null;
    update public.oauth_refresh_tokens set used_at = now() where grant_id = new.id and used_at is null;
  elsif old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'Una aplicación revocada no se puede reactivar' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger oauth_grants_revoked before update on public.oauth_grants
  for each row execute function public.oauth_grant_revoked();

-- Un token de una aplicación revocada deja de servir aunque no haya vencido.
create or replace function public.mcp_resolve_token(p_hash text)
returns table (token_id uuid, user_id uuid, email text, scope text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.mcp_tokens;
begin
  select t.* into v from public.mcp_tokens t
  left join public.oauth_grants g on g.id = t.grant_id
  where t.token_hash = p_hash and t.revoked_at is null and (t.expires_at is null or t.expires_at > now())
    and (t.grant_id is null or g.revoked_at is null);
  if not found or not public.user_has_system_perm(v.user_id, 'use_mcp') then
    return;
  end if;
  update public.mcp_tokens set last_used_at = now()
  where id = v.id and (last_used_at is null or last_used_at < now() - interval '1 minute');
  if v.grant_id is not null then
    update public.oauth_grants set last_used_at = now()
    where id = v.grant_id and (last_used_at is null or last_used_at < now() - interval '1 minute');
  end if;
  return query
    select v.id, v.user_id, p.email,
           case when v.scope = 'write' and public.user_has_system_perm(v.user_id, 'mcp_write') then 'write' else 'read' end
    from public.profiles p where p.id = v.user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Registro dinámico (RFC 7591): cualquier aplicación puede registrarse; lo que importa es
-- que la persona la autorice. Redirecciones solo https o a este mismo equipo (localhost).
-- ---------------------------------------------------------------------------
create or replace function public.oauth_register_client(p_name text, p_redirect_uris text[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uri text;
  v_id uuid;
begin
  if p_redirect_uris is null or cardinality(p_redirect_uris) not between 1 and 10 then
    raise exception 'invalid_redirect_uri' using errcode = '22023';
  end if;
  foreach v_uri in array p_redirect_uris loop
    if length(v_uri) > 500 or not (v_uri ~ '^https://[^\s/?#]+' or v_uri ~ '^http://(localhost|127\.0\.0\.1)(:\d+)?(/|$)') or v_uri ~ '#' then
      raise exception 'invalid_redirect_uri' using errcode = '22023';
    end if;
  end loop;
  insert into public.oauth_clients (name, redirect_uris)
  values (left(coalesce(nullif(trim(p_name), ''), 'Aplicación'), 100), p_redirect_uris)
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.oauth_register_client(text, text[]) to anon, authenticated;

create or replace function public.oauth_client_info(p_client uuid)
returns table (name text, redirect_uris text[])
language sql
stable
security definer
set search_path = ''
as $$
  select c.name, c.redirect_uris from public.oauth_clients c where c.id = p_client;
$$;
grant execute on function public.oauth_client_info(uuid) to authenticated;

-- La persona autoriza: código de un solo uso (10 minutos) ligado a su PKCE.
create or replace function public.oauth_create_code(
  p_client uuid, p_redirect_uri text, p_code_challenge text, p_scope text, p_resource text, p_code_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'login_required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.oauth_clients c where c.id = p_client and p_redirect_uri = any (c.redirect_uris)) then
    raise exception 'invalid_client' using errcode = '22023';
  end if;
  if coalesce(p_code_challenge, '') !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'invalid_request' using errcode = '22023';
  end if;
  if not public.has_perm('system', 'use_mcp') then
    raise exception 'access_denied' using errcode = '42501';
  end if;
  if p_scope = 'write' and not public.has_perm('system', 'mcp_write') then
    raise exception 'access_denied' using errcode = '42501';
  end if;
  insert into public.oauth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, scope, resource)
  values (p_code_hash, p_client, auth.uid(), p_redirect_uri, p_code_challenge, case when p_scope = 'write' then 'write' else 'read' end, p_resource);
end;
$$;
grant execute on function public.oauth_create_code(uuid, text, text, text, text, text) to authenticated;

-- Canje del código (sin sesión): valida cliente, redirección y PKCE; crea la aplicación
-- conectada, el token de acceso (1 h) y el de refresco.
create or replace function public.oauth_exchange_code(
  p_code_hash text, p_client uuid, p_redirect_uri text, p_challenge text,
  p_access_hash text, p_access_prefix text, p_refresh_hash text)
returns table (scope text, expires_in int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.oauth_codes;
  v_grant uuid;
  v_name text;
begin
  select * into v from public.oauth_codes where code_hash = p_code_hash for update;
  if not found or v.used_at is not null or v.expires_at < now() or v.client_id <> p_client
     or v.redirect_uri <> p_redirect_uri or v.code_challenge <> p_challenge then
    raise exception 'invalid_grant' using errcode = '22023';
  end if;
  update public.oauth_codes set used_at = now() where code_hash = p_code_hash;
  select name into v_name from public.oauth_clients where id = v.client_id;

  insert into public.oauth_grants (user_id, client_id, scope) values (v.user_id, v.client_id, v.scope) returning id into v_grant;
  insert into public.mcp_tokens (user_id, name, token_prefix, token_hash, scope, expires_at, grant_id)
  values (v.user_id, v_name, p_access_prefix, p_access_hash, v.scope, now() + interval '1 hour', v_grant);
  insert into public.oauth_refresh_tokens (token_hash, grant_id) values (p_refresh_hash, v_grant);
  return query select v.scope, 3600;
end;
$$;
grant execute on function public.oauth_exchange_code(text, uuid, text, text, text, text, text) to anon, authenticated;

-- Renovación con rotación: cada token de refresco sirve una vez. Si alguien reusa uno ya
-- usado (posible robo), se revoca la aplicación conectada completa. Sin filas = invalid_grant
-- (no se lanza error para que la revocación quede guardada).
create or replace function public.oauth_refresh(
  p_refresh_hash text, p_client uuid, p_access_hash text, p_access_prefix text, p_new_refresh_hash text)
returns table (scope text, expires_in int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.oauth_refresh_tokens;
  g public.oauth_grants;
  v_name text;
begin
  select * into v from public.oauth_refresh_tokens where token_hash = p_refresh_hash for update;
  if not found then
    return;
  end if;
  select * into g from public.oauth_grants where id = v.grant_id;
  if g.client_id <> p_client or g.revoked_at is not null or v.expires_at < now() then
    return;
  end if;
  if v.used_at is not null then
    update public.oauth_grants set revoked_at = now() where id = g.id;
    return;
  end if;
  update public.oauth_refresh_tokens set used_at = now() where token_hash = p_refresh_hash;
  if not public.user_has_system_perm(g.user_id, 'use_mcp') then
    return;
  end if;
  select name into v_name from public.oauth_clients where id = g.client_id;
  -- Los tokens de acceso vencidos de esta aplicación ya no sirven: se limpian.
  delete from public.mcp_tokens where grant_id = g.id and expires_at < now();
  insert into public.mcp_tokens (user_id, name, token_prefix, token_hash, scope, expires_at, grant_id)
  values (g.user_id, v_name, p_access_prefix, p_access_hash, g.scope, now() + interval '1 hour', g.id);
  insert into public.oauth_refresh_tokens (token_hash, grant_id) values (p_new_refresh_hash, g.id);
  return query select g.scope, 3600;
end;
$$;
grant execute on function public.oauth_refresh(text, uuid, text, text, text) to anon, authenticated;
