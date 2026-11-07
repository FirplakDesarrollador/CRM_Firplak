-- Firplak CRM · Permisos de ejecución de las funciones.
-- Postgres deja ejecutar cualquier función a PUBLIC, y Supabase además se la concede a «anon»
-- (quien llama a la API sin iniciar sesión). Varias funciones de servidor dejan pasar a quien no
-- tiene usuario porque las ejecuta pg_cron (p. ej. purge_demo_data, generate_alerts), así que un
-- visitante sin sesión podía llamarlas por /rest/v1/rpc. Aquí:
--   · Nadie sin sesión ejecuta funciones, salvo las del servidor MCP y OAuth, que validan un hash.
--   · Quien inicia sesión conserva exactamente los permisos que ya tenía.
--   · Las funciones nuevas ya no quedan abiertas a PUBLIC ni a «anon»: cada migración concede lo suyo.

do $$
declare
  f record;
  v_publicas constant text[] := array['mcp_resolve_token', 'oauth_register_client', 'oauth_exchange_code', 'oauth_refresh'];
  v_tenia boolean;
begin
  for f in
    select p.oid, p.oid::regprocedure::text as firma, p.proname
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  loop
    v_tenia := has_function_privilege('authenticated', f.oid, 'EXECUTE');
    execute format('revoke execute on function %s from public, anon', f.firma);
    if v_tenia then
      execute format('grant execute on function %s to authenticated', f.firma);
    end if;
    if f.proname = any (v_publicas) then
      execute format('grant execute on function %s to anon', f.firma);
    end if;
  end loop;
end
$$;

-- El permiso de PUBLIC es global (no por esquema): se quita para las funciones que cree este rol.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;

-- El trigger de fechas no depende de la ruta de búsqueda de quien lo dispara.
alter function public.set_updated_at() set search_path = '';
