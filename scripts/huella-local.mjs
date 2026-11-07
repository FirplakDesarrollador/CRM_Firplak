// Huella del esquema de una base limpia con las migraciones del repositorio (sin semillas), para
// compararla con la de producción (scripts/huella-esquema.sql en el SQL Editor). Solo local.
// Uso: npm run db:huella            → resumen por tipo
//      npm run db:huella -- funciones → detalle de un tipo (objeto y md5)
import { PGlite } from '@electric-sql/pglite';
import { join } from 'node:path';
import { applyMigrations, prepareSupabaseLike, readSql, root } from './lib/base-local.mjs';

const db = new PGlite();
await prepareSupabaseLike(db);
await applyMigrations(db);

const sql = readSql(join(root, 'scripts/huella-esquema.sql'));
const detail = process.argv[2];
const query = detail
  ? sql.replace(/select k as tipo[\s\S]*$/, `select n as objeto, h as md5 from todo where k = '${detail.replace(/'/g, '')}' order by n;`)
  : sql;
const { rows } = await db.query(query);
console.table(rows);
await db.close();
