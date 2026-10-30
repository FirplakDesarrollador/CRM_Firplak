// Une las migraciones y la semilla en supabase/setup.sql para pegarlo en el
// SQL Editor de Supabase (alternativa a `npm run db:push`). Uso: npm run db:bundle
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migDir = join(root, 'supabase/migrations');
const parts = readdirSync(migDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => `-- ===== ${f} =====\n${readFileSync(join(migDir, f), 'utf8')}`);
parts.push(`-- ===== seed.sql =====\n${readFileSync(join(root, 'supabase/seed.sql'), 'utf8')}`);

writeFileSync(join(root, 'supabase/setup.sql'), parts.join('\n\n'));
console.log('supabase/setup.sql generado: pégalo en Supabase → SQL Editor y ejecútalo una sola vez.');
