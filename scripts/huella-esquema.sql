-- Huella del esquema `public`: un resumen por tipo de objeto (cantidad y md5) para comparar dos bases
-- sin copiar su contenido. Se usa para verificar que producción tiene los mismos efectos que las
-- migraciones del repositorio, antes y después de conciliar el historial.
--
-- Local (base limpia con las migraciones): npm run db:huella
-- Producción (solo lectura): pega esta consulta en Supabase → SQL Editor y compara fila por fila.
-- Si un tipo no coincide, cambia el último `select` por el detalle comentado al final para ver qué objeto difiere.
with
cols as (
  select 'columnas' as k, c.table_name || '.' || c.column_name as n,
         md5(concat_ws('|', c.data_type, c.udt_name, c.is_nullable, c.column_default, c.is_generated, c.generation_expression)) as h
  from information_schema.columns c
  join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
  where c.table_schema = 'public'),
funcs as (
  select 'funciones', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         -- Sin comentarios ni espacios: cinco migraciones se aplicaron en producción sin sus comentarios.
         md5(concat_ws('|', regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g'),
                       p.prosecdef::text, array_to_string(p.proconfig, ','), p.provolatile::text, pg_get_function_result(p.oid)))
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.prokind in ('f', 'p')),
trgs as (
  select 'triggers', c.relname || '.' || t.tgname, md5(pg_get_triggerdef(t.oid))
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and not t.tgisinternal),
pols as (
  select 'politicas', tablename || '.' || policyname, md5(concat_ws('|', permissive, cmd, roles::text, qual, with_check))
  from pg_policies where schemaname = 'public'),
idxs as (
  select 'indices', tablename || '.' || indexname, md5(indexdef)
  from pg_indexes where schemaname = 'public'),
cons as (
  select 'restricciones', cl.relname || '.' || c.conname, md5(pg_get_constraintdef(c.oid))
  from pg_constraint c join pg_class cl on cl.oid = c.conrelid join pg_namespace ns on ns.oid = cl.relnamespace
  where ns.nspname = 'public' and c.contype <> 'n'),  -- Postgres 18 (PGlite) guarda los NOT NULL como restricciones; 17 no.
rls as (
  select 'rls', c.relname, md5(c.relrowsecurity::text || c.relforcerowsecurity::text)
  from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relkind = 'r'),
anon_exec as (
  -- Funciones que puede ejecutar quien no tiene sesión (deben ser solo las de OAuth y MCP).
  select 'ejecutables_anon', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', md5('anon')
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')),
datos as (
  -- Datos que cargan las propias migraciones (no la configuración ni lo que registran los usuarios).
  select 'datos_paises', 'countries', md5(coalesce(string_agg(code || ':' || name, ',' order by code), '')) from public.countries
  union all
  select 'datos_municipios', 'co_municipalities', md5(coalesce(string_agg(code || ':' || department || ':' || city, ',' order by code), ''))
  from public.co_municipalities),
todo as (
  select * from cols union all select * from funcs union all select * from trgs union all select * from pols
  union all select * from idxs union all select * from cons union all select * from rls union all select * from anon_exec
  union all select * from datos)
select k as tipo, count(*) as cantidad, md5(string_agg(n || '=' || h, ',' order by n)) as huella
from todo group by k order by k;
-- Detalle (para encontrar el objeto distinto de un tipo):
-- select k, n, h from todo where k = 'funciones' order by n;
