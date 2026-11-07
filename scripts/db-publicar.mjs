// Publica en un proyecto de Supabase SOLO las migraciones pendientes, nunca semillas.
//
//   npm run db:pendientes -- --proyecto <ref>   → revisa: historial y migraciones pendientes (no cambia nada)
//   npm run db:publicar   -- --proyecto <ref>   → revisa, pide escribir el ref y aplica las pendientes
//
// Salvaguardas:
//   · El destino es explícito: `--proyecto` es obligatorio y debe coincidir con el proyecto enlazado en la
//     CLI (supabase/.temp/project-ref). No se lee .env.local ni se enlaza solo.
//   · Antes de aplicar muestra `supabase migration list` y `supabase db push --dry-run`. Si el historial
//     remoto tiene versiones que no están en el repositorio (p. ej. aplicadas con el MCP), se detiene:
//     primero hay que conciliar (docs/conciliacion-migraciones.md).
//   · Nunca usa --include-seed ni --include-all. No publica migraciones sin confirmar en git.
//   · Pide escribir el ref del proyecto para aplicar (y la CLI pide su propia confirmación).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { migrationFiles, root } from './lib/base-local.mjs';

const fail = (msg) => {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
};

/** Lee la tabla de `supabase migration list` (texto) y devuelve versiones locales y remotas. */
export function parseMigrationList(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    const cells = line.split(/[│|]/).map((c) => c.trim());
    if (cells.length < 2) continue;
    const [local, remote] = cells;
    if (!/^\d{14}$/.test(local) && !/^\d{14}$/.test(remote)) continue;
    rows.push({ local: /^\d{14}$/.test(local) ? local : null, remote: /^\d{14}$/.test(remote) ? remote : null });
  }
  return {
    synced: rows.filter((r) => r.local && r.remote && r.local === r.remote).map((r) => r.local),
    pending: rows.filter((r) => r.local && !r.remote).map((r) => r.local),
    remoteOnly: rows.filter((r) => r.remote && !r.local).map((r) => r.remote),
  };
}

const cli = (args, { capture = false } = {}) => {
  const res = spawnSync('npx', ['supabase', ...args], { cwd: root, encoding: 'utf8', stdio: capture ? ['inherit', 'pipe', 'pipe'] : 'inherit' });
  if (res.error) fail(`No se pudo ejecutar la CLI de Supabase: ${res.error.message}`);
  if (res.status !== 0) {
    if (capture) process.stderr.write(res.stderr ?? '');
    fail(`\`supabase ${args.join(' ')}\` terminó con error.`);
  }
  return `${res.stdout ?? ''}${res.stderr ?? ''}`;
};

async function main() {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--proyecto');
  const ref = i >= 0 ? argv[i + 1] : undefined;
  const reviewOnly = argv.includes('--solo-revisar');
  if (!ref || !/^[a-z]{20}$/.test(ref)) {
    fail('Indica el proyecto de destino: npm run db:pendientes -- --proyecto <ref>  (ref = 20 letras, p. ej. el de Supabase → Project Settings).');
  }

  const linkFile = join(root, 'supabase/.temp/project-ref');
  const linked = existsSync(linkFile) ? readFileSync(linkFile, 'utf8').trim() : null;
  if (linked !== ref) {
    fail(`La CLI ${linked ? `está enlazada a «${linked}»` : 'no está enlazada a ningún proyecto'}, no a «${ref}».
  Enlázala a propósito (pide la contraseña de la base) y vuelve a intentarlo:
    npx supabase link --project-ref ${ref}`);
  }

  const dirty = spawnSync('git', ['status', '--porcelain', '--', 'supabase/migrations'], { cwd: root, encoding: 'utf8' }).stdout.trim();
  if (dirty) fail(`Hay cambios sin confirmar en supabase/migrations:\n${dirty}\n  Haz commit antes de publicar: solo se publica lo que está en el repositorio.`);

  console.log(`\nProyecto de destino: ${ref}\nMigraciones en el repositorio: ${migrationFiles().length}\n`);
  console.log('— Historial (supabase migration list --linked):');
  const list = cli(['migration', 'list', '--linked'], { capture: true });
  console.log(list);
  const { synced, pending, remoteOnly } = parseMigrationList(list);
  if (remoteOnly.length) {
    fail(`El historial remoto tiene ${remoteOnly.length} versiones que no están en el repositorio (${remoteOnly.slice(0, 3).join(', ')}${remoteOnly.length > 3 ? '…' : ''}).
  No se publica nada hasta conciliarlo: sigue docs/conciliacion-migraciones.md.`);
  }
  console.log(`Sincronizadas: ${synced.length} · Pendientes: ${pending.length}${pending.length ? ` (${pending.join(', ')})` : ''}`);

  console.log('\n— Simulación (supabase db push --linked --dry-run):');
  cli(['db', 'push', '--linked', '--dry-run']);

  if (reviewOnly) {
    console.log('\nSolo revisión: no se aplicó nada.');
    return;
  }
  if (!pending.length) {
    console.log('\nNo hay migraciones pendientes.');
    return;
  }
  if (!process.stdin.isTTY) fail('Para aplicar hace falta confirmar en una terminal interactiva.');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`\nSe aplicarán ${pending.length} migraciones en «${ref}» (sin semillas). Escribe el ref del proyecto para continuar: `)).trim();
  rl.close();
  if (answer !== ref) fail('El ref no coincide. No se aplicó nada.');

  cli(['db', 'push', '--linked']);
  console.log(`\n✓ Migraciones aplicadas. Verifica:
  npm run db:pendientes -- --proyecto ${ref}   (no debe quedar ninguna pendiente)
  Asesor de seguridad de Supabase y la huella del esquema (docs/conciliacion-migraciones.md).`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
