// Une las migraciones y la semilla en supabase/setup.sql para pegarlo en el
// SQL Editor de Supabase (alternativa a `npm run db:push`). Uso: npm run db:bundle
// (o npm run db:bundle:produccion para una instalación sin datos de ejemplo).
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// --produccion: instalación limpia, sin los datos de ejemplo (se borran al final).
const production = process.argv.includes('--produccion');
const migDir = join(root, 'supabase/migrations');
const parts = readdirSync(migDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => `-- ===== ${f} =====\n${readFileSync(join(migDir, f), 'utf8')}`);
parts.push(`-- ===== seed.sql =====\n${readFileSync(join(root, 'supabase/seed.sql'), 'utf8')}`);
if (production) parts.push('-- ===== instalación limpia =====\nselect public.purge_demo_data();');

const file = production ? 'supabase/setup-produccion.sql' : 'supabase/setup.sql';
writeFileSync(join(root, file), parts.join('\n\n'));
console.log(`${file} generado${production ? ' (sin datos de ejemplo)' : ''}: pégalo en Supabase → SQL Editor y ejecútalo una sola vez.`);
