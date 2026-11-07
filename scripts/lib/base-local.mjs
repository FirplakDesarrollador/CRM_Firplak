// Piezas compartidas por los scripts que arman una base local en memoria (PGlite): rutas de las
// migraciones y de las semillas, y un esquema `auth` y roles como los de Supabase.
//
// Semillas (separadas desde 2026-11-07):
//   · supabase/seeds/01_configuracion.sql — configuración inicial (perfiles, roles, pipelines, listas,
//     reglas, plantillas…). Solo inserta lo que falta. Va en toda base nueva, también en producción.
//   · supabase/seeds/02_demo.sql — registros ficticios (is_demo), metas y TRM de ejemplo. Solo en el
//     modo demo y en las pruebas; se niega a correr en una base con usuarios reales.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MIGRATIONS_DIR = join(root, 'supabase/migrations');
export const SEED_CONFIG = join(root, 'supabase/seeds/01_configuracion.sql');
export const SEED_DEMO = join(root, 'supabase/seeds/02_demo.sql');

/** Archivos de migración en el orden en que se aplican (por versión). */
export const migrationFiles = () =>
  readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

export const readSql = (path) => readFileSync(path, 'utf8');

/**
 * Roles y esquema `auth` como en Supabase, incluido el permiso por defecto de ejecutar funciones
 * nuevas (las migraciones lo ajustan). Mínimo necesario para correr las migraciones.
 */
export async function prepareSupabaseLike(db) {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, encrypted_password text,
      raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
    grant usage on schema auth to anon, authenticated;
  `);
}

export async function applyMigrations(db) {
  for (const f of migrationFiles()) await db.exec(readSql(join(MIGRATIONS_DIR, f)));
}
