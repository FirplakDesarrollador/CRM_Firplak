// Prueba las migraciones, la semilla y las reglas RLS en un Postgres embebido (PGlite),
// con un esquema `auth` simulado. Uso: npm run db:test
import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
let passed = 0;
const check = async (name, fn) => {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}\n    ${error.message}`);
    process.exitCode = 1;
  }
};

await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text,
                           raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated, anon;
`);

console.log('Migraciones y semilla');
const migDir = join(root, 'supabase/migrations');
for (const file of readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort()) {
  await check(file, () => db.exec(readFileSync(join(migDir, file), 'utf8')));
}
await db.exec(`grant usage on schema public to authenticated, anon;
  grant all on all tables in schema public to authenticated;
  grant all on all sequences in schema public to authenticated;`);
const seed = readFileSync(join(root, 'supabase/seed.sql'), 'utf8');
await check('seed.sql', () => db.exec(seed));
await check('seed.sql es idempotente', async () => {
  await db.exec(seed);
  const [{ n }] = await q(`select count(*)::int n from accounts`);
  assert.equal(n, 12);
});

const [admin] = await q(`insert into auth.users (email, raw_user_meta_data) values ('admin@firplak.com', '{"full_name":"Ana Admin"}') returning id`);
const [rep] = await q(`insert into auth.users (email) values ('asesor@firplak.com') returning id`);
const [mgr] = await q(`insert into auth.users (email) values ('gerente@firplak.com') returning id`);
await db.exec(`
  update profiles set role_id = (select id from roles where name = 'Asesores Centro') where email = 'asesor@firplak.com';
  update profiles set role_id = (select id from roles where name = 'Gerencia Regional Centro') where email = 'gerente@firplak.com';`);

async function as(user, fn) {
  await db.exec(`set role authenticated`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user.id]);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role`);
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}
const count = async (sql, params) => Number((await q(sql, params))[0].n);

console.log('Usuarios');
await check('el primer usuario es administrador y recibe los datos demo', async () => {
  const [p] = await q(`select pp.is_admin, p.full_name from profiles p join permission_profiles pp on pp.id = p.permission_profile_id where p.id = $1`, [admin.id]);
  assert.equal(p.is_admin, true);
  assert.equal(p.full_name, 'Ana Admin');
  assert.equal(await count(`select count(*) n from opportunities where owner_id = $1`, [admin.id]), 26);
});
await check('los siguientes usuarios reciben el perfil por defecto', async () => {
  const [p] = await q(`select pp.name from profiles p join permission_profiles pp on pp.id = p.permission_profile_id where p.id = $1`, [rep.id]);
  assert.equal(p.name, 'Asesor comercial');
});
await check('un asesor no puede escalar su propio perfil', async () => {
  await assert.rejects(as(rep, () => q(`update profiles set permission_profile_id = (select id from permission_profiles where is_admin) where id = $1`, [rep.id])));
});
await check('un asesor puede cambiar sus preferencias', async () => {
  const rows = await as(rep, () => q(`update profiles set preferences = preferences || '{"theme":"dark"}' where id = $1 returning id`, [rep.id]));
  assert.equal(rows.length, 1);
});

console.log('Visibilidad (RLS)');
await check('cuentas y contactos son de lectura pública; oportunidades privadas', async () => {
  await as(rep, async () => {
    assert.equal(await count(`select count(*) n from accounts`), 12);
    assert.equal(await count(`select count(*) n from opportunities`), 0);
  });
});
await check('actividades de oportunidades ajenas no son visibles', async () => {
  assert.equal(await as(rep, () => count(`select count(*) n from activities where opportunity_id is not null`)), 0);
});
await check('un asesor no edita cuentas ajenas', async () => {
  const rows = await as(rep, () => q(`update accounts set name = name where owner_id = $1 returning id`, [admin.id]));
  assert.equal(rows.length, 0);
});
await check('un asesor no puede modificar etapas del pipeline', async () => {
  const rows = await as(rep, () => q(`update pipeline_stages set name = name returning id`));
  assert.equal(rows.length, 0);
});

let repOpp;
console.log('Oportunidades');
await check('crear oportunidad: propietario, pipeline y probabilidad automáticos', async () => {
  repOpp = await as(rep, async () => {
    const [acc] = await q(`insert into accounts (name) values ('Cuenta del asesor') returning id, owner_id, account_number`);
    assert.equal(acc.owner_id, rep.id);
    assert.match(acc.account_number, /^CU-\d+$/);
    const [st] = await q(`select s.id from pipeline_stages s join pipelines p on p.id = s.pipeline_id where p.is_default and s.name = 'Calificación'`);
    const [o] = await q(`insert into opportunities (name, account_id, stage_id, amount) values ('Opp asesor', $1, $2, 1000000)
                         returning id, pipeline_id, probability, owner_id, expected_revenue`, [acc.id, st.id]);
    assert.equal(o.probability, 20);
    assert.equal(Number(o.expected_revenue), 200000);
    return o;
  });
});
await check('pasar a Ganada cierra la oportunidad y registra el historial', async () => {
  await as(rep, async () => {
    const [won] = await q(`select s.id from pipeline_stages s join pipelines p on p.id = s.pipeline_id where p.is_default and s.category = 'won'`);
    const [u] = await q(`update opportunities set stage_id = $1 where id = $2 returning is_won, is_closed, probability`, [won.id, repOpp.id]);
    assert.deepEqual(u, { is_won: true, is_closed: true, probability: 100 });
    assert.equal(await count(`select count(*) n from opportunity_stage_history where opportunity_id = $1`, [repOpp.id]), 2);
  });
});
await check('una etapa de otro pipeline se rechaza', async () => {
  await assert.rejects(as(rep, async () => {
    const [st] = await q(`select s.id from pipeline_stages s join pipelines p on p.id = s.pipeline_id where not p.is_default limit 1`);
    await q(`update opportunities set stage_id = $1 where id = $2`, [st.id, repOpp.id]);
  }));
});
await check('el gerente ve las oportunidades de su equipo (jerarquía de roles)', async () => {
  assert.equal(await as(mgr, () => count(`select count(*) n from opportunities where id = $1`, [repOpp.id])), 1);
});
await check('la actividad hereda la cuenta de la oportunidad', async () => {
  await as(rep, async () => {
    const [a] = await q(`insert into activities (activity_type, subject, opportunity_id) values ('call', 'Llamada', $1) returning account_id, owner_id`, [repOpp.id]);
    assert.ok(a.account_id);
    assert.equal(a.owner_id, rep.id);
  });
});

console.log('Indicadores y búsqueda');
await check('crm_dashboard devuelve KPIs, embudo y series', async () => {
  const year = new Date().getFullYear();
  const [{ d }] = await as(admin, () => q(`select crm_dashboard($1::date, $2::date) d`, [`${year}-01-01`, `${year}-12-31`]));
  assert.ok(d.kpis.won_count > 0);
  assert.ok(d.funnel.length >= 5);
  assert.equal(d.by_month.length, 12);
});
await check('global_search respeta la RLS', async () => {
  const adminHits = await as(admin, () => q(`select * from global_search('casa viva')`));
  const repHits = await as(rep, () => q(`select * from global_search('casa viva') where object = 'opportunities'`));
  assert.ok(adminHits.some((h) => h.object === 'opportunities'));
  assert.equal(repHits.length, 0);
});

console.log('Fase 2');
await check('la semilla crea catálogo, precios, campañas, prospectos, cotizaciones y casos', async () => {
  const [r] = await q(`select (select count(*) from products)::int p, (select count(*) from price_book_entries)::int e,
    (select count(*) from campaigns)::int c, (select count(*) from leads)::int l, (select count(*) from quotes)::int qt,
    (select count(*) from cases)::int cs`);
  assert.deepEqual(r, { p: 13, e: 26, c: 3, l: 7, qt: 3, cs: 5 });
});
await check('totales de cotización: subtotal, descuento, IVA 19% y total', async () => {
  const [qt] = await as(admin, () => q(`select * from quotes where name like 'Torre 3%'`));
  const [{ sub, net }] = await q(`select sum(quantity * unit_price) sub, sum(line_total) net from quote_line_items where quote_id = $1`, [qt.id]);
  assert.equal(Number(qt.subtotal), Number(sub));
  assert.equal(Number(qt.net_total), Number(net));
  assert.equal(Number(qt.tax), Math.round(Number(net) * 0.19 * 100) / 100);
  assert.equal(Number(qt.grand_total), Number(qt.net_total) + Number(qt.tax) + Number(qt.shipping));
});
await check('sincronizar una cotización actualiza el valor de la oportunidad', async () => {
  await as(admin, async () => {
    const [qt] = await q(`select id, opportunity_id, net_total from quotes where name like 'Torre 3%'`);
    await q(`select sync_quote($1)`, [qt.id]);
    const [o] = await q(`select amount from opportunities where id = $1`, [qt.opportunity_id]);
    assert.equal(Number(o.amount), Number(qt.net_total));
    await q(`update quote_line_items set quantity = quantity + 1 where quote_id = $1 and sort_order = 1`, [qt.id]);
    const [o2] = await q(`select o.amount, q.net_total from opportunities o join quotes q on q.opportunity_id = o.id where q.id = $1`, [qt.id]);
    assert.equal(Number(o2.amount), Number(o2.net_total));
  });
});
await check('convertir un prospecto crea cuenta, contacto y oportunidad', async () => {
  await as(admin, async () => {
    const [lead] = await q(`select id, company from leads where company = 'Constructora Horizonte Verde'`);
    const [{ r }] = await q(`select convert_lead($1, null, null, true, 'Horizonte Verde · 180 aptos', null, 950000000, null, null) r`, [lead.id]);
    assert.ok(r.account_id && r.contact_id && r.opportunity_id);
    const [l] = await q(`select status, is_converted from leads where id = $1`, [lead.id]);
    assert.deepEqual(l, { status: 'Convertido', is_converted: true });
    const [o] = await q(`select amount, campaign_id is not null has_campaign from opportunities where id = $1`, [r.opportunity_id]);
    assert.equal(Number(o.amount), 950000000);
    assert.equal(o.has_campaign, true);
    await assert.rejects(q(`select convert_lead($1)`, [lead.id]));
  });
});
await check('cerrar un caso marca is_closed y closed_at', async () => {
  const [c] = await as(admin, () => q(`update cases set status = 'Cerrado' where subject like 'Puerta%' returning is_closed, closed_at is not null closed`));
  assert.deepEqual(c, { is_closed: true, closed: true });
});
await check('el asesor lee el catálogo pero no puede cambiar precios', async () => {
  await as(rep, async () => {
    assert.ok((await count(`select count(*) n from products`)) > 0);
    const rows = await q(`update price_book_entries set unit_price = 1 returning id`);
    assert.equal(rows.length, 0);
    assert.equal(await count(`select count(*) n from quotes`), 0);
  });
});
await check('crm_dashboard_extra devuelve indicadores de prospectos, casos y cotizaciones', async () => {
  const year = new Date().getFullYear();
  const [{ d }] = await as(admin, () => q(`select crm_dashboard_extra($1::date, $2::date) d`, [`${year}-01-01`, `${year}-12-31`]));
  assert.ok(d.leads_new >= 1);
  assert.ok(d.cases_open >= 1);
  assert.ok(d.quotes_open >= 1);
});

console.log(`\n${passed} comprobaciones superadas${process.exitCode ? ' (con fallos)' : ''}`);
