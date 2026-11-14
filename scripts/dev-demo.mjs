// Modo demo local: `npm run dev:demo`.
// Levanta, solo en este equipo y en memoria, un sustituto de Supabase (Postgres embebido con
// PGlite + PostgREST + un inicio de sesión simulado) con las migraciones, las semillas y usuarios
// de prueba, y arranca la app apuntando a él. No usa .env.local ni se conecta a Supabase: al
// cerrarlo (Ctrl+C) todo se borra y la próxima vez empieza de cero.
//
// Requisito: PostgREST instalado (macOS: `brew install postgrest`).
//
// `npm run dev:demo -- --produccion` compila y sirve la app como en producción (`next build` + `next start`)
// contra la misma base de demo. Sirve para probar lo que en desarrollo no se puede: el service worker con
// caché de archivos y la consulta sin señal recargando la página sin red (en desarrollo, Next no termina de
// cargar una página si no alcanza su servidor).
//
// `npm run dev:demo -- --vercel` hace lo mismo y además publica los archivos con huella donde los deja Vercel
// (`/_next/static/immutable/…` en vez de `/_next/static/…`). La consulta sin señal guarda esos archivos por su
// dirección, así que hay que probarla con las dos formas: la de aquí y la del hosting.

import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { createDecipheriv, createECDH, createHash, createHmac, createPublicKey, createVerify, hkdfSync, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import webpush from 'web-push';
import { SEED_CONFIG, SEED_DEMO } from './lib/base-local.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DB_PORT = 54329, PGRST_PORT = 54330, API_PORT = 54321, MS_PORT = 54350, SAP_PORT = 54360, PUSH_PORT = 54370, APP_PORT = 3000;
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
for (const port of [DB_PORT, PGRST_PORT, API_PORT, MS_PORT, SAP_PORT, PUSH_PORT, APP_PORT]) {
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
  -- Como en Supabase: las funciones nuevas se pueden ejecutar salvo que la migración lo revoque.
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
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
  grant all on all sequences in schema public to authenticated, service_role;`);
// Configuración inicial y datos de demostración (en ese orden; ver scripts/lib/base-local.mjs).
await db.exec(readFileSync(SEED_CONFIG, 'utf8'));
await db.exec(readFileSync(SEED_DEMO, 'utf8'));

// El primer usuario (Luis) queda como administrador y recibe los registros de demostración.
for (const u of USERS) {
  await db.query(`insert into auth.users (email, encrypted_password, raw_user_meta_data) values ($1, $2, $3)`,
    [u.email, PASSWORD, { full_name: u.name }]);
}
// Usuario técnico del agente de SAP (agente-sap/agente.mjs): solo tiene el perfil «Integración SAP».
const SAP_AGENT = { email: 'agente.sap@firplak.com', password: randomBytes(12).toString('hex') };
await db.query(`insert into auth.users (email, encrypted_password, raw_user_meta_data) values ($1, $2, $3)`,
  [SAP_AGENT.email, SAP_AGENT.password, { full_name: 'Agente SAP' }]);
await db.query(`update public.profiles set title = 'Usuario técnico',
  permission_profile_id = (select id from public.permission_profiles where name = 'Integración SAP') where email = $1`, [SAP_AGENT.email]);
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
// Como en producción a las 7:00 a. m.: los avisos del día (tareas y cierres vencidos, oportunidades sin
// actividad), para que la campana no diga «Sin notificaciones» mientras el inicio muestra tareas vencidas.
await db.exec(`select public.generate_alerts()`);

// Token MCP de prueba para Luis (consulta y cambios), solo para esta sesión.
const mcpToken = `fcrm_${randomBytes(32).toString('base64url')}`;
await db.query(`insert into public.mcp_tokens (user_id, name, token_prefix, token_hash, scope)
  select id, 'Demo', $1, $2, 'write' from public.profiles where email = 'luis.demo@firplak.com'`,
  [mcpToken.slice(0, 12), createHash('sha256').update(mcpToken).digest('hex')]);

// Campos personalizados de productos para probar el mapeo con campos de usuario de SAP.
await db.exec(`insert into public.custom_field_definitions (object, api_name, label, field_type, options, sort_order)
  values ('products', 'linea', 'Línea', 'text', '[]', 1), ('products', 'color', 'Color', 'text', '[]', 2)
  on conflict (object, api_name) do nothing;`);

// Códigos SAP de ejemplo (el SAP simulado tiene estos socios de negocio).
await db.exec(`update public.accounts set sap_card_code = 'C20001' where name = 'Almacenes Casa Viva';
  update public.accounts set sap_card_code = 'C20002' where name = 'Constructora Altos del Valle S.A.S.';`);

// Canal de Teams simulado (los avisos se imprimen en esta consola).
await db.exec(`insert into public.teams_channels (name, webhook_url) values ('Ventas (simulado)', 'http://127.0.0.1:${MS_PORT}/teams/webhook/ventas')`);

// PGlite tiene una sola conexión, compartida con PostgREST: desde aquí ya no se consulta la base
// directamente (se mezclaría con sus transacciones). Los usuarios quedan en memoria.
const users = new Map((await db.query(`select * from auth.users`)).rows.map((u) => [u.id, u]));
const demoProducts = (await db.query(`select product_code, name from public.products where product_code like 'DEMO-%'`)).rows;
const sock = new PGLiteSocketServer({ db, port: DB_PORT, host: '127.0.0.1', maxConnections: 10 });
await sock.start();

// ---------------------------------------------------------------- PostgREST
const tmp = mkdtempSync(join(tmpdir(), 'firplak-demo-'));
// Igual que producción (`max_rows = 1000` en supabase/config.toml): una consulta que pida más filas se corta, y
// las pruebas lo ven. Sin este tope, la lista de municipios se probaba completa y en producción faltaban departamentos.
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
db-max-rows = 1000
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

// ---------------------------------------------------------------- Microsoft 365 simulado
// Inicio de sesión (Entra ID), Microsoft Graph (perfil, calendario, correo) y webhooks de Teams,
// con un buzón de ejemplo: una reunión y un correo con Carolina Gómez (Almacenes Casa Viva).
const MS = { tenant: 'firplak-demo', clientId: 'firplak-crm-demo', clientSecret: randomBytes(16).toString('hex') };
const day = 86400_000;
const at = (offsetDays, hourUtc) => { const d = new Date(Date.now() + offsetDays * day); d.setUTCHours(hourUtc, 0, 0, 0); return d; };
const graphDate = (d) => ({ dateTime: d.toISOString().replace('Z', ''), timeZone: 'UTC' });
const msUser = { id: 'ms-luis', displayName: 'Luis Demo', mail: 'luis.demo@firplak.com', userPrincipalName: 'luis.demo@firplak.com' };
const person = (address) => ({ emailAddress: { address } });
const msEvents = new Map([
  ['evt-casaviva', { id: 'evt-casaviva', subject: 'Revisión de muestras con Carolina (Casa Viva)', bodyPreview: 'Llevar muestras de lavamanos y el catálogo 2027.',
    start: graphDate(at(1, 15)), end: graphDate(at(1, 16)), location: { displayName: 'Showroom Firplak Bogotá' },
    attendees: [person('luis.demo@firplak.com'), person('cgomez@casaviva.example')], webLink: 'https://outlook.office.com/calendar/item/evt-casaviva', lastModifiedDateTime: new Date().toISOString() }],
  ['evt-interno', { id: 'evt-interno', subject: 'Comité interno de ventas', start: graphDate(at(1, 13)), end: graphDate(at(1, 14)),
    attendees: [person('luis.demo@firplak.com'), person('gerente.centro@firplak.com')], webLink: 'https://outlook.office.com/calendar/item/evt-interno', lastModifiedDateTime: new Date().toISOString() }],
]);
const msMessages = [
  { id: 'msg-casaviva', subject: 'RE: Cotización surtido 2027', bodyPreview: 'Hola Luis, revisamos la propuesta y queremos ajustar las cantidades de muebles de 60 cm.',
    from: person('cgomez@casaviva.example'), toRecipients: [person('luis.demo@firplak.com')], ccRecipients: [person('slondono@casaviva.example')],
    receivedDateTime: new Date(Date.now() - 2 * day).toISOString(), sentDateTime: new Date(Date.now() - 2 * day).toISOString(), webLink: 'https://outlook.office.com/mail/msg-casaviva' },
  { id: 'msg-boletin', subject: 'Boletín de novedades', bodyPreview: 'Promociones del mes.', from: person('boletines@proveedor.example'),
    toRecipients: [person('luis.demo@firplak.com')], receivedDateTime: new Date(Date.now() - day).toISOString(), webLink: 'https://outlook.office.com/mail/msg-boletin' },
];
// Planner: un plan con dos depósitos; las tareas llevan etiqueta de versión (If-Match).
const plans = [{ id: 'plan-ventas', title: 'Ventas Firplak', buckets: [{ id: 'bucket-seguimiento', name: 'Seguimiento' }, { id: 'bucket-cotizaciones', name: 'Cotizaciones' }] }];
const plannerTasks = new Map();
let etagSeq = 1;
// SharePoint: un sitio con su biblioteca de documentos (árbol de carpetas en memoria).
const site = { id: 'site-comercial', displayName: 'Comercial Firplak', webUrl: 'https://firplak.sharepoint.com/sites/Comercial' };
const drive = { id: 'drive-documentos', name: 'Documentos', webUrl: `${site.webUrl}/Documentos` };
const items = new Map([['root', { id: 'root', name: '', path: '', folder: { childCount: 0 } }]]);
const itemByPath = (path) => [...items.values()].find((i) => i.path === path);
const addItem = (parent, data) => {
  const path = parent.path ? `${parent.path}/${data.name}` : data.name;
  const item = { id: `item-${randomBytes(5).toString('hex')}`, parentId: parent.id, path, webUrl: `${drive.webUrl}/${encodeURI(path)}`, lastModifiedDateTime: new Date().toISOString(), ...data };
  items.set(item.id, item);
  return item;
};
const msCodes = new Map();
const msTokens = new Set();
const msRefresh = new Set();
const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(body === undefined ? '' : JSON.stringify(body)); };
const readRaw = (req) => new Promise((r) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => r(d)); });
const issue = () => {
  const access = `sim-access-${randomBytes(12).toString('hex')}`;
  const refresh = `sim-refresh-${randomBytes(12).toString('hex')}`;
  msTokens.add(access); msRefresh.add(refresh);
  return { token_type: 'Bearer', access_token: access, refresh_token: refresh, expires_in: 3600,
    scope: 'User.Read Calendars.ReadWrite Mail.Read Mail.Send Tasks.ReadWrite Files.ReadWrite.All Sites.Read.All' };
};
const ms = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${MS_PORT}`);
  try {
    if (url.pathname === `/${MS.tenant}/oauth2/v2.0/authorize`) {
      const code = `sim-code-${randomBytes(8).toString('hex')}`;
      msCodes.set(code, url.searchParams.get('code_challenge'));
      const back = new URL(url.searchParams.get('redirect_uri'));
      back.searchParams.set('code', code);
      back.searchParams.set('state', url.searchParams.get('state') ?? '');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(`<!doctype html><meta charset="utf-8"><title>Microsoft 365 (simulado)</title>
        <body style="font-family:system-ui;max-width:28rem;margin:4rem auto;line-height:1.5">
        <h1 style="font-size:1.2rem">Microsoft 365 · simulado</h1>
        <p><b>Firplak CRM (demo)</b> quiere acceder a tu perfil, calendario y correo como <b>${msUser.mail}</b>.</p>
        <p><a href="${back}" style="background:#0f6cbd;color:#fff;padding:.5rem 1rem;border-radius:4px;text-decoration:none">Aceptar</a></p></body>`);
    }
    if (url.pathname === `/${MS.tenant}/oauth2/v2.0/token` && req.method === 'POST') {
      const p = new URLSearchParams(await readRaw(req));
      if (p.get('client_id') !== MS.clientId || p.get('client_secret') !== MS.clientSecret) return json(res, 401, { error: 'invalid_client' });
      if (p.get('grant_type') === 'authorization_code') {
        const challenge = msCodes.get(p.get('code'));
        msCodes.delete(p.get('code'));
        const ok = challenge && createHash('sha256').update(p.get('code_verifier') ?? '').digest('base64url') === challenge;
        return ok ? json(res, 200, issue()) : json(res, 400, { error: 'invalid_grant', error_description: 'Código no válido' });
      }
      if (p.get('grant_type') === 'refresh_token' && msRefresh.delete(p.get('refresh_token'))) return json(res, 200, issue());
      return json(res, 400, { error: 'invalid_grant', error_description: 'Token de refresco no válido' });
    }
    // Solo para la demo: marca como completada en Planner la última tarea creada.
    if (url.pathname === '/sim/planner/completar' && req.method === 'POST') {
      const task = [...plannerTasks.values()].at(-1);
      if (!task) return json(res, 404, { error: 'Sin tareas en Planner' });
      Object.assign(task, { percentComplete: 100, '@odata.etag': `W/"${++etagSeq}"` });
      console.log(`[Planner simulado] completada en Planner: ${task.title}`);
      return json(res, 200, { id: task.id, title: task.title });
    }
    if (url.pathname.startsWith('/teams/webhook/') && req.method === 'POST') {
      const card = JSON.parse(await readRaw(req));
      const body = card.attachments?.[0]?.content?.body ?? [];
      console.log(`\n[Teams simulado · ${url.pathname.split('/').pop()}] ${body.map((b) => b.text).filter(Boolean).join(' — ')}\n`);
      return json(res, 202);
    }
    if (url.pathname.startsWith('/v1.0/')) {
      if (!msTokens.has((req.headers.authorization ?? '').replace(/^Bearer /, ''))) return json(res, 401, { error: { code: 'InvalidAuthenticationToken', message: 'Token no válido' } });
      const path = url.pathname.slice(5);
      if (path === '/me') return json(res, 200, msUser);
      if (path === '/me/calendarView') {
        const from = new Date(url.searchParams.get('startDateTime')), to = new Date(url.searchParams.get('endDateTime'));
        return json(res, 200, { value: [...msEvents.values()].filter((e) => new Date(`${e.start.dateTime}Z`) < to && new Date(`${e.end.dateTime}Z`) > from) });
      }
      if (path === '/me/events' && req.method === 'POST') {
        const ev = { ...JSON.parse(await readRaw(req)), id: `evt-${randomBytes(6).toString('hex')}`, lastModifiedDateTime: new Date().toISOString() };
        ev.webLink = `https://outlook.office.com/calendar/item/${ev.id}`;
        msEvents.set(ev.id, ev);
        console.log(`[Outlook simulado] reunión creada: ${ev.subject}`);
        return json(res, 201, ev);
      }
      const evMatch = path.match(/^\/me\/events\/([^/]+)$/);
      if (evMatch) {
        const ev = msEvents.get(decodeURIComponent(evMatch[1]));
        if (!ev) return json(res, 404, { error: { code: 'ErrorItemNotFound', message: 'No existe' } });
        if (req.method === 'DELETE') { msEvents.delete(ev.id); console.log(`[Outlook simulado] reunión eliminada: ${ev.subject}`); return json(res, 204); }
        if (req.method === 'PATCH') { Object.assign(ev, JSON.parse(await readRaw(req)), { lastModifiedDateTime: new Date().toISOString() }); return json(res, 200, ev); }
        return json(res, 200, ev);
      }
      if (path === '/me/messages') {
        const since = (url.searchParams.get('$filter') ?? '').match(/ge (\S+)/)?.[1];
        return json(res, 200, { value: msMessages.filter((m) => !since || m.receivedDateTime >= since) });
      }
      if (path === '/me/sendMail' && req.method === 'POST') {
        const { message } = JSON.parse(await readRaw(req));
        msMessages.unshift({ ...message, id: `msg-${randomBytes(6).toString('hex')}`, from: person(msUser.mail), bodyPreview: message.body?.content?.slice(0, 120),
          receivedDateTime: new Date().toISOString(), sentDateTime: new Date().toISOString() });
        console.log(`[Outlook simulado] correo enviado: ${message.subject}`);
        return json(res, 202);
      }
      // Planner
      if (path === '/me/planner/plans') return json(res, 200, { value: plans.map((p) => ({ id: p.id, title: p.title })) });
      const bucketsMatch = path.match(/^\/planner\/plans\/([^/]+)\/(buckets|tasks)$/);
      if (bucketsMatch) {
        const plan = plans.find((p) => p.id === bucketsMatch[1]);
        if (!plan) return json(res, 404, { error: { code: 'NotFound', message: 'Plan no encontrado' } });
        return json(res, 200, { value: bucketsMatch[2] === 'buckets' ? plan.buckets : [...plannerTasks.values()].filter((t) => t.planId === plan.id) });
      }
      if (path === '/planner/tasks' && req.method === 'POST') {
        const task = { ...JSON.parse(await readRaw(req)), id: `ptask-${randomBytes(5).toString('hex')}`, percentComplete: 0, '@odata.etag': `W/"${++etagSeq}"` };
        plannerTasks.set(task.id, task);
        console.log(`[Planner simulado] tarea creada: ${task.title}`);
        return json(res, 201, task);
      }
      const taskMatch = path.match(/^\/planner\/tasks\/([^/]+)$/);
      if (taskMatch) {
        const task = plannerTasks.get(taskMatch[1]);
        if (!task) return json(res, 404, { error: { code: 'NotFound', message: 'Tarea no encontrada' } });
        if (req.method === 'GET') return json(res, 200, task);
        if (req.headers['if-match'] !== task['@odata.etag']) return json(res, 412, { error: { code: 'PreconditionFailed', message: 'La tarea cambió' } });
        if (req.method === 'DELETE') { plannerTasks.delete(task.id); console.log(`[Planner simulado] tarea eliminada: ${task.title}`); return json(res, 204); }
        Object.assign(task, JSON.parse(await readRaw(req)), { '@odata.etag': `W/"${++etagSeq}"` });
        console.log(`[Planner simulado] tarea actualizada: ${task.title} (${task.percentComplete} %)`);
        return (req.headers.prefer ?? '').includes('return=representation') ? json(res, 200, task) : json(res, 204);
      }
      // SharePoint
      if (path === '/sites') {
        const q = (url.searchParams.get('search') ?? '').toLowerCase();
        return json(res, 200, { value: site.displayName.toLowerCase().includes(q) || !q ? [site] : [] });
      }
      if (path === `/sites/${site.id}/drives`) return json(res, 200, { value: [drive] });
      const byPath = path.match(new RegExp(`^/drives/${drive.id}/root:/(.+)$`));
      if (byPath) {
        const item = itemByPath(byPath[1].split('/').map(decodeURIComponent).join('/'));
        return item ? json(res, 200, item) : json(res, 404, { error: { code: 'itemNotFound', message: 'No existe' } });
      }
      const children = path.match(new RegExp(`^/drives/${drive.id}/items/([^/:]+)/children$`));
      if (children) {
        const parent = items.get(children[1]);
        if (!parent) return json(res, 404, { error: { code: 'itemNotFound', message: 'No existe' } });
        if (req.method === 'POST') {
          const body = JSON.parse(await readRaw(req));
          if ([...items.values()].some((i) => i.parentId === parent.id && i.name === body.name)) return json(res, 409, { error: { code: 'nameAlreadyExists', message: 'Ya existe' } });
          const folder = addItem(parent, { name: body.name, folder: { childCount: 0 } });
          console.log(`[SharePoint simulado] carpeta creada: ${folder.path}`);
          return json(res, 201, folder);
        }
        return json(res, 200, { value: [...items.values()].filter((i) => i.parentId === parent.id) });
      }
      const upload = path.match(new RegExp(`^/drives/${drive.id}/items/([^/:]+):/([^:]+):/content$`));
      if (upload && req.method === 'PUT') {
        const parent = items.get(upload[1]);
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const file = addItem(parent, { name: decodeURIComponent(upload[2]), file: { mimeType: req.headers['content-type'] }, size: Buffer.concat(chunks).length });
        console.log(`[SharePoint simulado] archivo subido: ${file.path} (${file.size} bytes)`);
        return json(res, 201, file);
      }
      return json(res, 404, { error: { code: 'NotFound', message: `No simulado: ${path}` } });
    }
    json(res, 404, { error: 'not_found' });
  } catch (e) {
    console.error(e);
    json(res, 500, { error: String(e) });
  }
});
await new Promise((r) => ms.listen(MS_PORT, '127.0.0.1', r));

// ---------------------------------------------------------------- SAP Business One simulado
// Service Layer (/b1s/v1) de solo lectura: inicio de sesión, socios de negocio, pedidos, facturas y artículos.
const SAP = { company: 'SBO_FIRPLAK_DEMO', user: 'crm.lectura', password: randomBytes(12).toString('hex') };
const sapDay = (offset) => new Date(Date.now() + offset * day).toISOString().slice(0, 10) + 'T00:00:00Z';
const sapSessions = new Set();
const partners = {
  C20001: { CardCode: 'C20001', CardName: 'ALMACENES CASA VIVA S.A.', FederalTaxID: '860045998-1', Phone1: '6014876600', EmailAddress: 'cartera@casaviva.example',
    CurrentAccountBalance: 186400000, OpenOrdersBalance: 245000000, OpenDeliveryNotesBalance: 38000000, CreditLimit: 600000000 },
  C20002: { CardCode: 'C20002', CardName: 'CONSTRUCTORA ALTOS DEL VALLE S.A.S.', FederalTaxID: '900512334-7', Phone1: '6044412200', EmailAddress: 'pagos@altosdelvalle.example',
    CurrentAccountBalance: 512000000, OpenOrdersBalance: 120000000, OpenDeliveryNotesBalance: 0, CreditLimit: 500000000 },
};
const doc = (n, card, date, due, total, paid, status, oc) => ({ DocEntry: n, DocNum: n, CardCode: card, DocDate: sapDay(date), DocDueDate: sapDay(due), DocTotal: total,
  PaidToDate: paid, VatSum: Math.round(total - total / 1.19), DocCurrency: 'COP', DocumentStatus: status, Cancelled: 'tNO', NumAtCard: oc });
const sapOrders = [
  doc(41210, 'C20001', -12, 18, 245000000, 0, 'bost_Open', 'OC-CV-2231'),
  doc(41188, 'C20002', -20, 10, 120000000, 0, 'bost_Open', 'ADV-T2-07'),
];
// El pedido 41210 se despacha en tres fechas: una línea ya entregada y dos pendientes (una con producción terminada).
const sapLine = (n, qty, open, ship, whs = 'PT-02') => ({ LineNum: n, VisualOrder: n, ItemCode: 'DEMO-MB-060', ItemDescription: 'MUEBLE DE BAÑO FLOTANTE 60 CM',
  Quantity: qty, RemainingOpenQuantity: open, ShipDate: sapDay(ship), LineStatus: open ? 'bost_Open' : 'bost_Close', LineTotal: qty * 1250000,
  WarehouseCode: whs, U_TipoTOC: 'MTOSTD', U_Fecha_Plan_Ent_Cli_Linea: sapDay(ship + 3) });
sapOrders[0].DocumentLines = [sapLine(0, 40, 0, -5), sapLine(1, 60, 60, 18), sapLine(2, 96, 96, 45)];
// Un pedido largo (seis líneas), para ver el resumen que solo aparece en pedidos de muchas líneas.
sapOrders[1].DocumentLines = [0, 1, 2, 3, 4, 5].map((n) => sapLine(n, 10, n < 2 ? 0 : 10, 10 + n * 7, 'PT-01'));
const sapProductionOrders = [
  { ItemNo: 'DEMO-MB-060', ProductionOrderStatus: 'boposReleased', CompletedQuantity: 25, ProductionOrderOriginNumber: 41210, U_NumLote: '41210-2-1' },
];
const sapDeliveries = [doc(52301, 'C20001', -3, -3, 38000000, 0, 'bost_Open', 'OC-CV-2204')];
const sapInvoices = [
  doc(87105, 'C20001', -40, -10, 92000000, 0, 'bost_Open', 'OC-CV-2190'),
  doc(87240, 'C20001', -10, 20, 94400000, 0, 'bost_Open', 'OC-CV-2204'),
  doc(86911, 'C20001', -75, -45, 130000000, 130000000, 'bost_Close', 'OC-CV-2150'),
  doc(87002, 'C20002', -65, -35, 312000000, 0, 'bost_Open', 'ADV-T1-15'),
  doc(87199, 'C20002', -25, 5, 200000000, 0, 'bost_Open', 'ADV-T2-03'),
];
const sapItems = {
  'DEMO-MB-060': { ItemCode: 'DEMO-MB-060', ItemName: 'MUEBLE BAÑO 60 CM BLANCO', QuantityOnStock: 340, QuantityOrderedByCustomers: 120, QuantityOrderedFromVendors: 200, SalesUnit: 'UN',
    ItemPrices: [{ PriceList: 1, PriceListName: 'Lista general', Price: 685000 }, { PriceList: 2, PriceListName: 'Distribuidores', Price: 590000 }, { PriceList: 3, PriceListName: 'Proyectos', Price: 610000 }],
    ItemWarehouseInfoCollection: [{ WarehouseCode: 'MED-PT', InStock: 260, Committed: 100, Ordered: 200 }, { WarehouseCode: 'BOG-CD', InStock: 80, Committed: 20, Ordered: 0 }] },
  'DEMO-LV-RD': { ItemCode: 'DEMO-LV-RD', ItemName: 'LAVAMANOS REDONDO SOBREPONER', QuantityOnStock: 45, QuantityOrderedByCustomers: 60, SalesUnit: 'UN',
    ItemPrices: [{ PriceList: 1, PriceListName: 'Lista general', Price: 289000 }, { PriceList: 2, PriceListName: 'Distribuidores', Price: 245000 }],
    ItemWarehouseInfoCollection: [{ WarehouseCode: 'MED-PT', InStock: 45, Committed: 60, Ordered: 150 }] },
};
// Catálogo de artículos (60, algunos que no son de venta) con campos de usuario U_Linea y U_Color.
const lines = [['MB', 'MUEBLE BAÑO', 'Muebles de baño'], ['LV', 'LAVAMANOS', 'Lavamanos y superficies'], ['CO', 'COCINA INTEGRAL', 'Cocinas'], ['DU', 'DUCHA', 'Duchas y bañeras']];
const colors = ['Blanco', 'Roble', 'Gris grafito', 'Nogal'];
for (let i = 1; i <= 56; i++) {
  const [code, name, linea] = lines[i % lines.length];
  const itemCode = `FP-${code}-${String(100 + i)}`;
  sapItems[itemCode] = { ItemCode: itemCode, ItemName: `${name} REF ${100 + i} ${colors[i % colors.length].toUpperCase()}`, SalesItem: i % 9 === 0 ? 'tNO' : 'tYES',
    ItemsGroupCode: 110 + (i % lines.length),
    U_Linea: linea, U_Color: colors[i % colors.length], QuantityOnStock: (i * 7) % 90, ItemPrices: [{ PriceList: 1, PriceListName: 'Lista general', Price: 150000 + i * 10000 }], ItemWarehouseInfoCollection: [] };
}
// Un kit de venta (lista de materiales de venta): un lavamanos y dos duchas.
sapItems['FP-CO-KIT1'] = { ItemCode: 'FP-CO-KIT1', ItemName: 'KIT COCINA CON LAVAMANOS', SalesItem: 'tYES', ItemsGroupCode: 112, TreeType: 'iSalesTree',
  QuantityOnStock: 0, ItemPrices: [], ItemWarehouseInfoCollection: [] };
const sapTrees = { 'FP-CO-KIT1': [{ ItemCode: 'FP-LV-101', ItemName: 'LAVAMANOS REF 101', Quantity: 1, ItemType: 'pit_Item' }, { ItemCode: 'FP-DU-103', ItemName: 'DUCHA REF 103', Quantity: 2, ItemType: 'pit_Item' }] };
// Todos los productos de ejemplo del CRM existen en SAP (para crear ofertas con los pedidos de la demo).
for (const p of demoProducts) {
  sapItems[p.product_code] ??= { ItemCode: p.product_code, ItemName: p.name.toUpperCase(), SalesItem: 'tYES', QuantityOnStock: 50,
    ItemPrices: [{ PriceList: 1, PriceListName: 'Lista general', Price: 500000 }], ItemWarehouseInfoCollection: [{ WarehouseCode: 'MED-PT', InStock: 50, Committed: 0, Ordered: 0 }] };
}
Object.assign(sapItems['DEMO-MB-060'], { SalesItem: 'tYES', U_Linea: 'Muebles de baño', U_Color: 'Blanco' });
Object.assign(sapItems['DEMO-LV-RD'], { SalesItem: 'tYES', U_Linea: 'Lavamanos y superficies', U_Color: 'Blanco' });
const quotations = new Map();
let quotationSeq = 3000;
const sapError = (res, status, value) => json(res, status, { error: { code: -1, message: { lang: 'es-ES', value } } });
const sapServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${SAP_PORT}`);
  const path = decodeURIComponent(url.pathname.replace(/^\/b1s\/v1/, ''));
  // Solo para la demo: el experto convierte en orden de venta la última oferta (queda cerrada).
  if (path === '/sim/convertir-oferta' && req.method === 'POST') {
    const doc = [...quotations.values()].at(-1);
    if (!doc) return sapError(res, 404, 'Sin ofertas');
    doc.DocumentStatus = 'bost_Close';
    console.log(`[SAP simulado] oferta ${doc.DocNum} convertida en orden de venta`);
    return json(res, 200, { DocNum: doc.DocNum });
  }
  if (path === '/Login' && req.method === 'POST') {
    const b = JSON.parse(await readRaw(req));
    if (b.CompanyDB !== SAP.company || b.UserName !== SAP.user || b.Password !== SAP.password) return sapError(res, 401, 'Usuario o contraseña incorrectos');
    const id = randomUUID();
    sapSessions.add(id);
    res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': [`B1SESSION=${id}; path=/b1s; HttpOnly`, 'ROUTEID=.node1; path=/b1s'] });
    return res.end(JSON.stringify({ SessionId: id, Version: '1000271', SessionTimeout: 30 }));
  }
  const session = (req.headers.cookie ?? '').match(/B1SESSION=([^;]+)/)?.[1];
  if (!session || !sapSessions.has(session)) return sapError(res, 401, 'Invalid session or session already timeout.');
  const key = path.match(/^\/(\w+)\('([^']+)'\)$/);
  if (key?.[1] === 'BusinessPartners') return partners[key[2]] ? json(res, 200, partners[key[2]]) : sapError(res, 404, 'No matching records found (ODBC -2028)');
  if (key?.[1] === 'Items') return sapItems[key[2]] ? json(res, 200, sapItems[key[2]]) : sapError(res, 404, 'No matching records found (ODBC -2028)');
  if (path === '/Items') {
    const select = (url.searchParams.get('$select') ?? 'ItemCode,ItemName').split(',');
    const filter = url.searchParams.get('$filter') ?? '';
    const prefix = filter.match(/startswith\(ItemCode,'([^']*)'\)/)?.[1];
    // Lote de códigos (el agente): ItemCode eq 'A' or ItemCode eq 'B' …
    const codes = [...filter.matchAll(/ItemCode eq '((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'"));
    const top = Number(url.searchParams.get('$top') ?? 0) || undefined;
    const skip = Number(url.searchParams.get('$skip') ?? 0);
    const all = Object.values(sapItems).filter((it) => (!filter.includes("SalesItem eq 'tYES'") || it.SalesItem === 'tYES') && (!prefix || it.ItemCode.startsWith(prefix)) && (!codes.length || codes.includes(it.ItemCode)))
      .sort((a, b) => a.ItemCode.localeCompare(b.ItemCode));
    const size = Math.min(top ?? 20, 20);
    const page = all.slice(skip, skip + size).map((it) => Object.fromEntries(select.map((f) => [f, it[f] ?? null])));
    const more = skip + size < all.length && (!top || skip + size < top);
    if (more) {
      const next = new URLSearchParams(url.searchParams);
      next.set('$skip', String(skip + size));
      return json(res, 200, { value: page, 'odata.nextLink': `Items?${next.toString()}` });
    }
    return json(res, 200, { value: page });
  }
  if (path === '/Quotations' && req.method === 'POST') {
    const q = JSON.parse(await readRaw(req));
    if (!partners[q.CardCode]) return sapError(res, 400, `Socio de negocio no válido: ${q.CardCode}`);
    const bad = (q.DocumentLines ?? []).find((l) => !sapItems[l.ItemCode]);
    if (bad) return sapError(res, 400, `Artículo no válido: ${bad.ItemCode}`);
    const entry = ++quotationSeq;
    const total = (q.DocumentLines ?? []).reduce((s, l) => s + l.Quantity * l.UnitPrice * (1 - (l.DiscountPercent ?? 0) / 100), 0);
    const doc = { ...q, DocEntry: entry, DocNum: entry + 3000, DocumentStatus: 'bost_Open', Cancelled: 'tNO', DocTotal: Math.round(total * 1.19) };
    quotations.set(entry, doc);
    console.log(`[SAP simulado] oferta de venta ${doc.DocNum} creada para ${q.CardCode} (${q.DocumentLines.length} líneas, NumAtCard ${q.NumAtCard})`);
    return json(res, 201, doc);
  }
  const qMatch = path.match(/^\/Quotations\((\d+)\)$/);
  if (qMatch) {
    const doc = quotations.get(Number(qMatch[1]));
    return doc ? json(res, 200, doc) : sapError(res, 404, 'No matching records found (ODBC -2028)');
  }
  // Grupos de artículos (ItemsGroupCode de cada artículo).
  if (path === '/ItemGroups') {
    return json(res, 200, { value: [[110, 'BAN05-Muebles Lavam'], [111, 'BAN02-Lavamanos ECO'], [112, 'COC03-Kit de cocinas'], [113, 'BAN08-Cabinas ducha']].map(([Number, GroupName]) => ({ Number, GroupName })) });
  }
  // Listas de materiales de los kits.
  if (path === '/ProductTrees') {
    const codes = [...(url.searchParams.get('$filter') ?? '').matchAll(/TreeCode eq '((?:[^']|'')*)'/g)].map((m) => m[1]);
    return json(res, 200, { value: codes.filter((c) => sapTrees[c]).map((c) => ({ TreeCode: c, ProductTreeLines: sapTrees[c] })) });
  }
  if (path === '/ProductionOrders') {
    const origins = [...(url.searchParams.get('$filter') ?? '').matchAll(/ProductionOrderOriginNumber eq (\d+)/g)].map((m) => Number(m[1]));
    return json(res, 200, { value: sapProductionOrders.filter((o) => origins.includes(o.ProductionOrderOriginNumber)) });
  }
  if (path === '/Orders' || path === '/Invoices' || path === '/DeliveryNotes') {
    const filter = url.searchParams.get('$filter') ?? '';
    const card = filter.match(/CardCode eq '([^']+)'/)?.[1];
    const openOnly = filter.includes("DocumentStatus eq 'bost_Open'");
    const list = (path === '/Orders' ? sapOrders : path === '/DeliveryNotes' ? sapDeliveries : sapInvoices).filter((d) => d.CardCode === card && (!openOnly || d.DocumentStatus === 'bost_Open'));
    return json(res, 200, { value: list.sort((a, b) => b.DocDate.localeCompare(a.DocDate)) });
  }
  sapError(res, 404, `No simulado: ${path}`);
});
await new Promise((r) => sapServer.listen(SAP_PORT, '127.0.0.1', r));
// Configuración del agente de SAP contra esta demo (la usan las pruebas; las claves son de esta corrida).
mkdirSync(join(root, 'test-results'), { recursive: true });
writeFileSync(join(root, 'test-results', 'agente-sap-demo.json'), JSON.stringify({
  sapUrl: `http://127.0.0.1:${SAP_PORT}/b1s/v1`, sapCompanyDb: SAP.company, sapUser: SAP.user,
  crmUrl: `http://127.0.0.1:${API_PORT}`, crmAnonKey: anonKey, crmUser: SAP_AGENT.email,
  ventasCsvDir: join(root, 'test-results', 'ventas-demo'),
  demoSapPassword: SAP.password, demoCrmPassword: SAP_AGENT.password,
}, null, 2));
// Carpeta de los CSV de ventas del agente: vacía hasta que una prueba deje archivos.
rmSync(join(root, 'test-results', 'ventas-demo'), { recursive: true, force: true });
mkdirSync(join(root, 'test-results', 'ventas-demo'), { recursive: true });

// ---------------------------------------------------------------- Push simulado
// Servicio de push de prueba, para probar sin un navegador real: entrega suscripciones, comprueba la
// firma VAPID y descifra cada mensaje (RFC 8291). Un navegador real usa su propio servicio (FCM…).
const VAPID = webpush.generateVAPIDKeys();
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const pushSubs = new Map();
const pushReceived = [];

function decryptPush(sub, body) {
  const salt = body.subarray(0, 16);
  const idLen = body[20];
  const serverKey = body.subarray(21, 21 + idLen);
  const data = body.subarray(21 + idLen);
  const secret = sub.ecdh.computeSecret(serverKey);
  const info = Buffer.concat([Buffer.from('WebPush: info\0'), sub.ecdh.getPublicKey(), serverKey]);
  const ikm = Buffer.from(hkdfSync('sha256', secret, sub.auth, info, 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(data.subarray(data.length - 16));
  const plain = Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]);
  let end = plain.length - 1;
  while (plain[end] === 0) end--;
  return JSON.parse(plain.subarray(0, end).toString());
}

function vapidValid(header) {
  const [, jwt, key] = /^vapid t=([^,]+), k=(.+)$/.exec(header ?? '') ?? [];
  if (!jwt || key !== VAPID.publicKey) return false;
  const [head, claims, signature] = jwt.split('.');
  const point = Buffer.from(key, 'base64url');
  const publicKey = createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: b64u(point.subarray(1, 33)), y: b64u(point.subarray(33)) } });
  const ok = createVerify('SHA256').update(`${head}.${claims}`).verify({ key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'));
  return ok && JSON.parse(Buffer.from(claims, 'base64url')).aud === `http://127.0.0.1:${PUSH_PORT}`;
}

const pushServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PUSH_PORT}`);
  const reply = (status, json) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(json ?? {})); };
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const [, id] = /^\/(?:enviar|sim\/vencer)\/(.+)$/.exec(url.pathname) ?? [];
  if (req.method === 'POST' && url.pathname === '/sim/suscribir') {
    const subId = randomUUID();
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    const auth = randomBytes(16);
    pushSubs.set(subId, { ecdh, auth, gone: false });
    return reply(200, { endpoint: `http://127.0.0.1:${PUSH_PORT}/enviar/${subId}`, expirationTime: null, keys: { p256dh: b64u(ecdh.getPublicKey()), auth: b64u(auth) } });
  }
  if (req.method === 'GET' && url.pathname === '/sim/recibidos') return reply(200, pushReceived);
  if (req.method === 'POST' && url.pathname.startsWith('/sim/vencer/') && pushSubs.has(id)) {
    pushSubs.get(id).gone = true;
    return reply(200);
  }
  if (req.method === 'POST' && url.pathname.startsWith('/enviar/') && pushSubs.has(id)) {
    const sub = pushSubs.get(id);
    if (sub.gone) return reply(410);
    if (!vapidValid(req.headers.authorization)) return reply(401);
    try {
      const message = decryptPush(sub, Buffer.concat(chunks));
      pushReceived.push({ to: id, ...message });
      console.log(`[push simulado] ${message.title}: ${message.body}`);
      return reply(201);
    } catch {
      return reply(400);
    }
  }
  reply(404);
});
await new Promise((r) => pushServer.listen(PUSH_PORT, '127.0.0.1', r));

// ---------------------------------------------------------------- App
// Estas variables tienen prioridad sobre .env.local: la app solo habla con la base de demo y con
// el Microsoft 365 simulado; nunca usa las claves reales ni envía correos aunque estén configurados.
const cronSecret = randomBytes(16).toString('hex');
const LIKE_VERCEL = process.argv.includes('--vercel');
const PRODUCTION = LIKE_VERCEL || process.argv.includes('--produccion');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const appEnv = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${API_PORT}`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
  NEXT_PUBLIC_SITE_URL: `http://localhost:${APP_PORT}`,
  // service_role de esta base de demo (no la real): la usa el servidor para publicar en Teams.
  SUPABASE_SERVICE_ROLE_KEY: sign({ role: 'service_role', iss: 'firplak-demo', iat: Math.floor(Date.now() / 1000), exp: 4102444800 }),
  MS365_TENANT_ID: MS.tenant,
  MS365_CLIENT_ID: MS.clientId,
  MS365_CLIENT_SECRET: MS.clientSecret,
  MS365_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  CRON_SECRET: cronSecret,
  VAPID_PUBLIC_KEY: VAPID.publicKey,
  VAPID_PRIVATE_KEY: VAPID.privateKey,
  VAPID_SUBJECT: 'mailto:demo@firplak.com',
  PUSH_EXTRA_ORIGINS: `http://127.0.0.1:${PUSH_PORT}`,
  SAP_SL_URL: `http://127.0.0.1:${SAP_PORT}/b1s/v1`,
  SAP_COMPANY_DB: SAP.company,
  SAP_USER: SAP.user,
  SAP_PASSWORD: SAP.password,
  MS365_LOGIN_URL: `http://127.0.0.1:${MS_PORT}`,
  MS365_GRAPH_URL: `http://127.0.0.1:${MS_PORT}/v1.0`,
  // El servidor MCP firma las sesiones de los tokens con el secreto de esta base de demo.
  SUPABASE_JWT_SECRET: SECRET,
  RESEND_API_KEY: '',
  EMAIL_FROM: '',
  ALLOWED_EMAIL_DOMAINS: '',
  // La lee next.config.ts.
  ...(LIKE_VERCEL ? { CRM_ARCHIVOS_COMO_VERCEL: '1' } : {}),
};
if (PRODUCTION) {
  // Las variables NEXT_PUBLIC_* quedan dentro de la compilación: por eso se compila aquí, con las de demo.
  const build = spawn(npx, ['next', 'build'], { cwd: root, stdio: 'inherit', env: appEnv });
  const code = await new Promise((resolve) => build.on('exit', resolve));
  if (code !== 0) {
    console.error('La compilación falló: no se inició la app.');
    for (const c of children) c.kill();
    rmSync(tmp, { recursive: true, force: true });
    process.exit(1);
  }
}
const next = spawn(npx, ['next', PRODUCTION ? 'start' : 'dev', '--hostname', 'localhost', '--port', String(APP_PORT)], { cwd: root, stdio: 'inherit', env: appEnv });
children.push(next);

// En producción lo despierta el webhook de la base; aquí se revisa cada pocos segundos.
const pushTimer = setInterval(() => {
  fetch(`http://localhost:${APP_PORT}/api/push/dispatch`, { method: 'POST', headers: { authorization: `Bearer ${cronSecret}` } }).catch(() => {});
}, 4000);

console.log(`
──────────────────────────────────────────────────────────────
  Firplak CRM · modo demo (datos de prueba en memoria)
  Abre http://localhost:${APP_PORT}  ·  contraseña de todos: ${PASSWORD}
${USERS.map((u) => `    ${u.email.padEnd(30)} ${u.note}`).join('\n')}
  Microsoft 365 simulado: Mis preferencias → Microsoft 365 → Conectar.
  Push: Mis preferencias → Notificaciones push → Activar (en Chrome o Edge, usa su servicio real).
  SAP simulado: pestaña SAP de Almacenes Casa Viva (C20001) y Altos del Valle (C20002).
  MCP: http://localhost:${APP_PORT}/api/mcp  ·  token de Luis:
    ${mcpToken}
  Al cerrar con Ctrl+C se borra todo. No toca tu Supabase real.
──────────────────────────────────────────────────────────────
`);

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  clearInterval(pushTimer);
  for (const c of children) c.kill();
  pushServer.close();
  api.close();
  ms.close();
  sapServer.close();
  await sock.stop().catch(() => {});
  await db.close().catch(() => {});
  rmSync(tmp, { recursive: true, force: true });
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
next.on('exit', stop);
