// Genera src/lib/database.types.ts aplicando las migraciones en un Postgres embebido
// (PGlite) e inspeccionando el catálogo. Produce el mismo formato que
// `supabase gen types typescript`, sin necesitar Docker ni acceso al proyecto.
//
// Uso: npm run db:types:local
// Con un proyecto enlazado, `npm run db:types` usa la CLI oficial de Supabase.

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const db = new PGlite();

await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
`);
const migDir = join(root, 'supabase/migrations');
for (const file of readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(join(migDir, file), 'utf8'));
}

const scalar = (udt) => {
  if (udt.startsWith('_')) return `${scalar(udt.slice(1))}[]`;
  if (['int2', 'int4', 'int8', 'float4', 'float8', 'numeric'].includes(udt)) return 'number';
  if (udt === 'bool') return 'boolean';
  if (['json', 'jsonb'].includes(udt)) return 'Json';
  return 'string';
};

const { rows: columns } = await db.query(`
  select c.table_name, c.column_name, c.udt_name, c.is_nullable = 'YES' as nullable,
         c.column_default is not null as has_default, c.is_generated = 'ALWAYS' as generated,
         c.is_identity = 'YES' as identity
  from information_schema.columns c
  join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
  where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
  order by c.table_name, c.column_name`);

const { rows: fks } = await db.query(`
  select con.conname, src.relname as table_name, tgt.relname as ref_table,
         array(select a.attname from unnest(con.conkey) with ordinality k(n, i)
               join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.n order by k.i) as cols,
         array(select a.attname from unnest(con.confkey) with ordinality k(n, i)
               join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.n order by k.i) as ref_cols,
         exists (select 1 from pg_index ix where ix.indrelid = con.conrelid and ix.indisunique
                 and ix.indkey::int2[] @> con.conkey and array_length(ix.indkey::int2[], 1) = array_length(con.conkey, 1)) as one_to_one
  from pg_constraint con
  join pg_class src on src.oid = con.conrelid
  join pg_class tgt on tgt.oid = con.confrelid
  join pg_namespace ns on ns.oid = src.relnamespace
  join pg_namespace tns on tns.oid = tgt.relnamespace
  where con.contype = 'f' and ns.nspname = 'public' and tns.nspname = 'public'
  order by con.conname`);

const { rows: fns } = await db.query(`
  select p.proname, p.proretset, p.pronargdefaults, p.pronargs,
         coalesce(p.proargnames, '{}') as argnames,
         coalesce(p.proargmodes::text[], '{}') as argmodes,
         array(select format_type(t.oid, null)
               from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality t(oid, i) order by t.i) as argtypes,
         array(select typ.typname
               from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality t(oid, i)
               join pg_type typ on typ.oid = t.oid order by t.i) as argudts,
         rt.typname as ret
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_type rt on rt.oid = p.prorettype
  where n.nspname = 'public' and rt.typname <> 'trigger'
  order by p.proname`);

const ind = (n) => '  '.repeat(n);
let out = `// Generado por scripts/gen-types-local.mjs a partir de supabase/migrations. No editar a mano.\n`;
out += `export type Json =\n  | string\n  | number\n  | boolean\n  | null\n  | { [key: string]: Json | undefined }\n  | Json[]\n\n`;
out += `export type Database = {\n${ind(1)}__InternalSupabase: {\n${ind(2)}PostgrestVersion: "13.0.5"\n${ind(1)}}\n${ind(1)}public: {\n${ind(2)}Tables: {\n`;

const tables = [...new Set(columns.map((c) => c.table_name))];
for (const table of tables) {
  const cols = columns.filter((c) => c.table_name === table);
  out += `${ind(3)}${table}: {\n`;
  out += `${ind(4)}Row: {\n`;
  for (const c of cols) out += `${ind(5)}${c.column_name}: ${scalar(c.udt_name)}${c.nullable ? ' | null' : ''}\n`;
  out += `${ind(4)}}\n${ind(4)}Insert: {\n`;
  for (const c of cols) {
    if (c.generated) { out += `${ind(5)}${c.column_name}?: never\n`; continue; }
    const optional = c.nullable || c.has_default || c.identity;
    out += `${ind(5)}${c.column_name}${optional ? '?' : ''}: ${scalar(c.udt_name)}${c.nullable ? ' | null' : ''}\n`;
  }
  out += `${ind(4)}}\n${ind(4)}Update: {\n`;
  for (const c of cols) {
    if (c.generated) { out += `${ind(5)}${c.column_name}?: never\n`; continue; }
    out += `${ind(5)}${c.column_name}?: ${scalar(c.udt_name)}${c.nullable ? ' | null' : ''}\n`;
  }
  out += `${ind(4)}}\n${ind(4)}Relationships: [\n`;
  for (const fk of fks.filter((f) => f.table_name === table)) {
    out += `${ind(5)}{\n${ind(6)}foreignKeyName: "${fk.conname}"\n${ind(6)}columns: [${fk.cols.map((c) => `"${c}"`).join(', ')}]\n`;
    out += `${ind(6)}isOneToOne: ${fk.one_to_one}\n${ind(6)}referencedRelation: "${fk.ref_table}"\n`;
    out += `${ind(6)}referencedColumns: [${fk.ref_cols.map((c) => `"${c}"`).join(', ')}]\n${ind(5)}},\n`;
  }
  out += `${ind(4)}]\n${ind(3)}}\n`;
}
out += `${ind(2)}}\n${ind(2)}Views: {\n${ind(3)}[_ in never]: never\n${ind(2)}}\n${ind(2)}Functions: {\n`;

for (const fn of fns) {
  const modes = fn.argmodes.length ? fn.argmodes : fn.argtypes.map(() => 'i');
  const inputs = [];
  const tableCols = [];
  modes.forEach((m, i) => {
    const entry = { name: fn.argnames[i], type: scalar(fn.argudts[i]) };
    if (m === 'i' || m === 'b') inputs.push(entry);
    if (m === 't' || m === 'o') tableCols.push(entry);
  });
  const firstDefault = inputs.length - fn.pronargdefaults;
  out += `${ind(3)}${fn.proname}: {\n`;
  if (inputs.length === 0) out += `${ind(4)}Args: never\n`;
  else {
    out += `${ind(4)}Args: {\n`;
    inputs.forEach((a, i) => { out += `${ind(5)}${a.name}${i >= firstDefault ? '?' : ''}: ${a.type}\n`; });
    out += `${ind(4)}}\n`;
  }
  if (tableCols.length) {
    out += `${ind(4)}Returns: {\n`;
    for (const c of tableCols) out += `${ind(5)}${c.name}: ${c.type}\n`;
    out += `${ind(4)}}[]\n`;
  } else {
    const ret = fn.ret === 'void' ? 'undefined' : scalar(fn.ret);
    out += `${ind(4)}Returns: ${ret}${fn.proretset ? '[]' : ''}\n`;
  }
  out += `${ind(3)}}\n`;
}
out += `${ind(2)}}\n${ind(2)}Enums: {\n${ind(3)}[_ in never]: never\n${ind(2)}}\n${ind(2)}CompositeTypes: {\n${ind(3)}[_ in never]: never\n${ind(2)}}\n${ind(1)}}\n}\n\n`;
out += `type PublicSchema = Database["public"]

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"]
`;

writeFileSync(join(root, 'src/lib/database.types.ts'), out);
console.log(`database.types.ts: ${tables.length} tablas, ${fns.length} funciones`);
