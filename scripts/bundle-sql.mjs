// Une las migraciones y las semillas en un solo archivo para instalar una base NUEVA desde
// Supabase → SQL Editor (sin la CLI). Nunca sirve para actualizar una base existente: el archivo
// empieza con una comprobación que se detiene si la base ya tiene el esquema del CRM. Las bases
// existentes se actualizan con `npm run db:publicar` (solo migraciones pendientes, sin semillas).
//
//   npm run db:bundle:produccion → supabase/setup-produccion.sql: migraciones + configuración inicial,
//                                  sin ningún registro ficticio.
//   npm run db:bundle            → supabase/setup.sql: además los datos de demostración (para un
//                                  proyecto de prueba; el primer usuario que se registre los recibe).
//
// Ambos archivos están en .gitignore (setup*.sql).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MIGRATIONS_DIR, SEED_CONFIG, SEED_DEMO, migrationFiles, readSql, root } from './lib/base-local.mjs';

const production = process.argv.includes('--produccion');

export function buildSetupSql({ withDemo }) {
  const parts = [
    `-- Firplak CRM · instalación de una base NUEVA (${withDemo ? 'con datos de demostración' : 'producción: sin datos de demostración'}).
-- Generado por scripts/bundle-sql.mjs. Ejecútalo una sola vez en una base vacía.
do $$
begin
  if to_regclass('public.profiles') is not null then
    raise exception 'Esta base ya tiene el esquema del CRM: este archivo es solo para una base nueva. No se aplicó nada. Para actualizarla usa npm run db:publicar.'
      using errcode = 'P0001';
  end if;
end
$$;`,
    'begin;',
    ...migrationFiles().map((f) => `-- ===== migración ${f} =====\n${readSql(join(MIGRATIONS_DIR, f))}`),
    `-- ===== seeds/01_configuracion.sql =====\n${readSql(SEED_CONFIG)}`,
  ];
  if (withDemo) parts.push(`-- ===== seeds/02_demo.sql =====\n${readSql(SEED_DEMO)}`);
  parts.push('commit;');
  return parts.join('\n\n');
}

// La ruta del proyecto tiene espacios: se compara como URL.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = production ? 'supabase/setup-produccion.sql' : 'supabase/setup.sql';
  writeFileSync(join(root, file), buildSetupSql({ withDemo: !production }));
  console.log(`${file} generado${production ? ' (configuración inicial, sin datos de demostración)' : ' (con datos de demostración)'}.`);
  console.log('Pégalo en Supabase → SQL Editor de un proyecto NUEVO y ejecútalo una sola vez.');
}
