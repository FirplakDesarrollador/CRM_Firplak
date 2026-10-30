// Modo demo local: `npm run dev:demo`.
// Levanta, solo en este equipo y en memoria, un sustituto de Supabase (Postgres embebido con
// PGlite + PostgREST + un inicio de sesión simulado) con las migraciones, la semilla y usuarios
// de prueba, y arranca la app apuntando a él. No usa .env.local ni se conecta a Supabase: al
// cerrarlo (Ctrl+C) todo se borra y la próxima vez empieza de cero.
//
// Requisito: PostgREST instalado (macOS: `brew install postgrest`).

import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DB_PORT = 54329, PGRST_PORT = 54330, API_PORT = 54321, APP_PORT = 3000;
const PASSWORD = 'demo1234';
const USERS = [
  { email: 'luis.demo@firplak.com', name: 'Luis Demo', note: 'administrador' },
  { email: 'gerente.centro@firplak.com', name: 'Jorge Gerente', note: 'gerente regional, jefe de Camila' },
  { email: 'asesora.centro@firplak.com', name: 'Camila Asesora', note: 'asesora comercial' },
];

// ---------------------------------------------------------------- Comprobaciones previas
if (spawnSync('postgrest', ['--version']).error) {
  console.error('\nFalta PostgREST. Instálalo con:\n\n  brew install postgrest\n\ny vuelve a ejecutar npm run dev:demo.\n');
  process.exit(1);
}
const portBusy = (port) => new Promise((resolve) => {
  const s = net.createServer().once('error', () => resolve(true)).once('listening', () => s.close(() => resolve(false)));
  s.listen(port, '127.0.0.1');
});
for (const port of [DB_PORT, PGRST_PORT, API_PORT, APP_PORT]) {
  if (await portBusy(port)) {
    console.error(`\nEl puerto ${port} está ocupado. Cierra la otra instancia (¿npm run dev o dev:demo abiertos?) e inténtalo de nuevo.\n`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------- Tokens (solo para esta sesión)
const SECRET = randomBytes(32).toString('hex');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sign = (payload) => {
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}`;
  return `${body}.${createHmac('sha256', SECRET).update(body).digest('base64url')}`;
};
const verify = (token) => {
  const [h, b, s] = (token ?? '').split('.');
  if (!s || createHmac('sha256', SECRET).update(`${h}.${b}`).digest('base64url') !== s) return null;
  const p = JSON.parse(Buffer.from(b, 'base64url').toString());
  return p.exp && p.exp * 1000 < Date.now() ? null : p;
};
const anonKey = sign({ role: 'anon', iss: 'firplak-demo', iat: Math.floor(Date.now() / 1000), exp: 4102444800 });

// ---------------------------------------------------------------- Base de datos en memoria
console.log('Preparando la base de datos de demostración…');
const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create role authenticator login noinherit; grant anon, authenticated, service_role to authenticator;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, encrypted_password text,
    raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
  grant usage on schema auth to anon, authenticated;
`);
for (const f of readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(join(root, 'supabase/migrations', f), 'utf8'));
}
await db.exec(`grant usage on schema public to anon, authenticated, service_role;
  grant all on all tables in schema public to authenticated, service_role;
  grant all on all sequences in schema public to authenticated, service_role;
  grant execute on all functions in schema public to authenticated;`);
await db.exec(readFileSync(join(root, 'supabase/seed.sql'), 'utf8'));

// El primer usuario (Luis) queda como administrador y recibe los registros de demostración.
for (const u of USERS) {
  await db.query(`insert into auth.users (email, encrypted_password, raw_user_meta_data) values ($1, $2, $3)`,
    [u.email, PASSWORD, { full_name: u.name }]);
}
await db.exec(`
  update public.profiles set role_id = (select id from public.roles where name = 'Gerencia Regional Centro'), title = 'Gerente regional',
    permission_profile_id = (select id from public.permission_profiles where name = 'Gerente comercial'),
    manager_id = (select id from public.profiles where email = 'luis.demo@firplak.com')
    where email = 'gerente.centro@firplak.com';
  update public.profiles set role_id = (select id from public.roles where name = 'Asesores Centro'), title = 'Asesora comercial',
    manager_id = (select id from public.profiles where email = 'gerente.centro@firplak.com')
    where email = 'asesora.centro@firplak.com';
  -- Algunos negocios de la asesora (ranking por asesor, aprobaciones con descuento alto).
  update public.opportunities set owner_id = (select id from public.profiles where email = 'asesora.centro@firplak.com')
    where name like 'Hogar y Acabados%' or name like 'Casa Viva · Temporada%' or name like 'Urbano Sabana%';
  update public.quotes set owner_id = (select id from public.profiles where email = 'asesora.centro@firplak.com')
    where name like 'Remodelación 180 habitaciones%';
  -- Equipo de ejemplo: la asesora apoya como especificadora una cuenta de Luis.
  insert into public.account_team_members (account_id, user_id, team_role, account_access, opportunity_access)
  select a.id, p.id, 'Especificador', 'read', 'edit'
  from public.accounts a, public.profiles p
  where a.name = 'Almacenes Casa Viva' and p.email = 'asesora.centro@firplak.com';
`);
// Historial de tres semanas para ver la tendencia del pronóstico.
for (const [days, k] of [[21, 0.62], [14, 0.78], [7, 0.9]]) {
  await db.exec(`select public.take_forecast_snapshot();
    update public.forecast_snapshots set taken_on = taken_on - ${days},
      closed = round(closed * ${k}), commit_amount = round(commit_amount * 1.1 * ${k}), best_case = round(best_case * 1.2)
      where taken_on = (now() at time zone 'America/Bogota')::date;
    update public.opportunity_snapshots set taken_on = taken_on - ${days}
      where taken_on = (now() at time zone 'America/Bogota')::date;`);
}

// Token MCP de prueba para Luis (consulta y cambios), solo para esta sesión.
const mcpToken = `fcrm_${randomBytes(32).toString('base64url')}`;
await db.query(`insert into public.mcp_tokens (user_id, name, token_prefix, token_hash, scope)
  select id, 'Demo', $1, $2, 'write' from public.profiles where email = 'luis.demo@firplak.com'`,
  [mcpToken.slice(0, 12), createHash('sha256').update(mcpToken).digest('hex')]);

// PGlite tiene una sola conexión, compartida con PostgREST: desde aquí ya no se consulta la base
// directamente (se mezclaría con sus transacciones). Los usuarios quedan en memoria.
const users = new Map((await db.query(`select * from auth.users`)).rows.map((u) => [u.id, u]));
const sock = new PGLiteSocketServer({ db, port: DB_PORT, host: '127.0.0.1', maxConnections: 10 });
await sock.start();

// ---------------------------------------------------------------- PostgREST
const tmp = mkdtempSync(join(tmpdir(), 'firplak-demo-'));
const conf = join(tmp, 'postgrest.conf');
writeFileSync(conf, `db-uri = "postgres://authenticator@127.0.0.1:${DB_PORT}/postgres"
db-schemas = "public"
db-anon-role = "anon"
db-pool = 1
db-channel-enabled = false
jwt-secret = "${SECRET}"
server-host = "127.0.0.1"
server-port = ${PGRST_PORT}
db-prepared-statements = false
log-level = "error"
`);
const children = [];
const pgrst = spawn('postgrest', [conf], { stdio: ['ignore', 'ignore', 'inherit'] });
children.push(pgrst);
for (let i = 0; i < 60; i++) {
  const ok = await fetch(`http://127.0.0.1:${PGRST_PORT}/`).then((r) => r.ok, () => false);
  if (ok) break;
  await new Promise((r) => setTimeout(r, 500));
}

// ---------------------------------------------------------------- Sustituto de Supabase Auth + REST
const userJson = (u) => ({
  id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email,
  email_confirmed_at: u.created_at, app_metadata: { provider: 'email' }, user_metadata: u.raw_user_meta_data ?? {},
  created_at: u.created_at, updated_at: u.created_at, identities: [],
});
const session = (u) => {
  const now = Math.floor(Date.now() / 1000);
  const access_token = sign({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 3600, session_id: randomUUID() });
  return { access_token, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: `r.${u.id}`, user: userJson(u) };
};
const readBody = (req) => new Promise((r) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => r(d ? JSON.parse(d) : {})); });
const send = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(body === undefined ? '' : JSON.stringify(body)); };
const findUser = (column, value) => column === 'id'
  ? users.get(String(value))
  : [...users.values()].find((u) => u.email.toLowerCase() === String(value ?? '').toLowerCase());
const claimsOf = (req) => verify((req.headers.authorization ?? '').replace(/^Bearer /, ''));

const api = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${API_PORT}`);
  try {
    if (url.pathname.startsWith('/auth/v1/')) {
      const path = url.pathname.slice(9);
      const grant = url.searchParams.get('grant_type');
      if (path === 'token' && grant === 'password') {
        const { email, password } = await readBody(req);
        const u = await findUser('email', email);
        if (!u || u.encrypted_password !== password) {
          return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials', msg: 'Invalid login credentials' });
        }
        return send(res, 200, session(u));
      }
      if (path === 'token' && grant === 'refresh_token') {
        const { refresh_token } = await readBody(req);
        const u = await findUser('id', String(refresh_token).slice(2));
        return u ? send(res, 200, session(u)) : send(res, 400, { error: 'invalid_grant' });
      }
      if (path === 'user' && req.method === 'GET') {
        const claims = claimsOf(req);
        const u = claims?.sub && (await findUser('id', claims.sub));
        return u ? send(res, 200, userJson(u)) : send(res, 401, { code: 401, msg: 'invalid JWT' });
      }
      if (path === 'user' && req.method === 'PUT') {
        const claims = claimsOf(req);
        if (!claims) return send(res, 401, { msg: 'invalid JWT' });
        const body = await readBody(req);
        const u = findUser('id', claims.sub);
        if (!u) return send(res, 401, { msg: 'invalid JWT' });
        if (body.password) u.encrypted_password = body.password;
        return send(res, 200, userJson(u));
      }
      if (path === 'signup') {
        return send(res, 422, { code: 'signup_disabled', msg: 'En el modo demo usa los usuarios de prueba (contraseña demo1234).' });
      }
      if (path === 'logout') return send(res, 204);
      if (path === 'recover' || path === 'otp' || path === 'invite') {
        return send(res, 400, { msg: 'En el modo demo no se envían correos.' });
      }
      return send(res, 404, { msg: `No disponible en el modo demo: ${path}` });
    }
    if (url.pathname.startsWith('/rest/v1')) {
      const target = `http://127.0.0.1:${PGRST_PORT}${url.pathname.slice(8) || '/'}${url.search}`;
      const headers = { ...req.headers };
      delete headers.host;
      delete headers['content-length'];
      const body = ['GET', 'HEAD'].includes(req.method)
        ? undefined
        : await new Promise((r) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
      const upstream = await fetch(target, { method: req.method, headers, body });
      const out = Buffer.from(await upstream.arrayBuffer());
      const h = {};
      upstream.headers.forEach((v, k) => { if (!['content-encoding', 'transfer-encoding', 'content-length'].includes(k)) h[k] = v; });
      res.writeHead(upstream.status, h);
      return res.end(out);
    }
    send(res, 404, { msg: 'not found' });
  } catch (e) {
    console.error(e);
    send(res, 500, { msg: String(e) });
  }
});
await new Promise((r) => api.listen(API_PORT, '127.0.0.1', r));

// ---------------------------------------------------------------- App
// Estas variables tienen prioridad sobre .env.local: la app solo habla con la base de demo,
// sin la clave service_role ni el envío de correos aunque estén configurados.
const next = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['next', 'dev', '--hostname', 'localhost', '--port', String(APP_PORT)], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${API_PORT}`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    NEXT_PUBLIC_SITE_URL: `http://localhost:${APP_PORT}`,
    SUPABASE_SERVICE_ROLE_KEY: '',
    // El servidor MCP firma las sesiones de los tokens con el secreto de esta base de demo.
    SUPABASE_JWT_SECRET: SECRET,
    RESEND_API_KEY: '',
    EMAIL_FROM: '',
    ALLOWED_EMAIL_DOMAINS: '',
  },
});
children.push(next);

console.log(`
──────────────────────────────────────────────────────────────
  Firplak CRM · modo demo (datos de prueba en memoria)
  Abre http://localhost:${APP_PORT}  ·  contraseña de todos: ${PASSWORD}
${USERS.map((u) => `    ${u.email.padEnd(30)} ${u.note}`).join('\n')}
  MCP: http://localhost:${APP_PORT}/api/mcp  ·  token de Luis:
    ${mcpToken}
  Al cerrar con Ctrl+C se borra todo. No toca tu Supabase real.
──────────────────────────────────────────────────────────────
`);

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  for (const c of children) c.kill();
  api.close();
  await sock.stop().catch(() => {});
  await db.close().catch(() => {});
  rmSync(tmp, { recursive: true, force: true });
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
next.on('exit', stop);
