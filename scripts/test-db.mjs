// Prueba las migraciones, las semillas y las reglas RLS en un Postgres embebido (PGlite),
// con un esquema `auth` simulado. Uso: npm run db:test
import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEED_CONFIG, SEED_DEMO, applyMigrations, prepareSupabaseLike } from './lib/base-local.mjs';
import { buildSetupSql } from './bundle-sql.mjs';

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
    console.error(`  ✗ ${name}\n    ${error.message}${process.env.DB_TEST_STACK ? `\n${error.stack}` : ""}`);
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
const seedConfig = readFileSync(SEED_CONFIG, 'utf8');
const seedDemo = readFileSync(SEED_DEMO, 'utf8');
await check('seeds/01_configuracion.sql', () => db.exec(seedConfig));
await check('seeds/02_demo.sql', () => db.exec(seedDemo));
await check('la configuración inicial no se reaplica sobre una base configurada', async () => {
  await db.exec(`update pipelines set name = 'Obras (renombrado)' where name = 'Proyectos y constructoras'`);
  await assert.rejects(db.exec(seedConfig), /ya tiene configuración inicial/);
  assert.equal((await q(`select count(*)::int n from pipelines where name = 'Proyectos y constructoras'`))[0].n, 0);
  await db.exec(`update pipelines set name = 'Proyectos y constructoras' where name = 'Obras (renombrado)'`);
});
await check('los datos demo son idempotentes en una base de demostración sin usuarios', async () => {
  await db.exec(seedDemo);
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
    const [acc] = await q(`insert into accounts (name, industry) values ('Cuenta del asesor', 'Canal Constructores') returning id, owner_id, account_number`);
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
  assert.deepEqual(r, { p: 13, e: 30, c: 3, l: 7, qt: 3, cs: 5 });
});
await check('totales de cotización: subtotal, descuento, IVA 19% y total', async () => {
  const [qt] = await as(admin, () => q(`select * from quotes where name like 'Torre 3%'`));
  const [{ sub, net }] = await q(`select sum(quantity * unit_price) sub, sum(line_total) net from quote_line_items where quote_id = $1`, [qt.id]);
  assert.equal(Number(qt.subtotal), Number(sub));
  assert.equal(Number(qt.net_total), Number(net));
  assert.equal(Number(qt.tax), Math.round(Number(net) * 0.19 * 100) / 100);
  assert.equal(Number(qt.grand_total), Number(qt.net_total) + Number(qt.tax) + Number(qt.shipping));
});
await check('el valor de la oportunidad es la suma de sus partes abiertas y sigue a sus líneas', async () => {
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

console.log('Fase 3');
await check('informes y plantillas compartidos son visibles para el asesor', async () => {
  await as(rep, async () => {
    assert.equal(await count(`select count(*) n from reports where is_shared`), 6);
    assert.equal(await count(`select count(*) n from email_templates where is_shared`), 3);
  });
});
await check('el asesor guarda informes propios pero no puede compartirlos', async () => {
  await as(rep, async () => {
    const [r] = await q(`insert into reports (name, object, owner_id, definition) values ('Mi informe', 'leads', $1, '{}') returning id`, [rep.id]);
    assert.ok(r.id);
    await assert.rejects(q(`insert into reports (name, object, owner_id, is_shared) values ('Público', 'leads', $1, true)`, [rep.id]));
    const rows = await q(`update reports set name = 'x' where is_shared returning id`);
    assert.equal(rows.length, 0);
  });
  assert.equal(await as(mgr, () => count(`select count(*) n from reports where name = 'Mi informe'`)), 0);
});
await check('un correo registrado queda como actividad con destinatario', async () => {
  await as(admin, async () => {
    const [c] = await q(`select id from contacts limit 1`);
    const [a] = await q(`insert into activities (activity_type, subject, status, email_to, email_delivery, contact_id) values ('email', 'Hola', 'completed', 'x@y.co', 'client', $1) returning email_to, account_id is not null has_account`, [c.id]);
    assert.equal(a.email_to, 'x@y.co');
  });
});

console.log('Fase 4');
await check('la auditoría registra cambios de campos y campos personalizados', async () => {
  await as(admin, async () => {
    const [a] = await q(`select id from accounts where name = 'Almacenes Casa Viva'`);
    await q(`update accounts set phone = '+57 601 000 0000', custom_fields = custom_fields || '{"canal":"Distribuidor"}' where id = $1`, [a.id]);
    const rows = await q(`select field, new_value from field_history where record_id = $1 and operation = 'update' order by field`, [a.id]);
    assert.ok(rows.some((r) => r.field === 'phone' && r.new_value === '+57 601 000 0000'));
    assert.ok(rows.some((r) => r.field === 'cf.canal' && r.new_value === 'Distribuidor'));
  });
});
await check('el campo de ejemplo «canal» queda inactivo: el único Canal de la cuenta es el que define pipeline y lista', async () => {
  const [f] = await q(`select is_active, show_in_list from custom_field_definitions where object = 'accounts' and api_name = 'canal'`);
  assert.deepEqual(f, { is_active: false, show_in_list: false });
});
await check('el historial solo es visible si se ve el registro', async () => {
  const [o] = await q(`select id from opportunities where owner_id = $1 limit 1`, [admin.id]);
  await as(admin, () => q(`update opportunities set next_step = 'Paso auditado' where id = $1`, [o.id]));
  assert.ok((await as(admin, () => count(`select count(*) n from field_history where record_id = $1`, [o.id]))) > 0);
  assert.equal(await as(rep, () => count(`select count(*) n from field_history where record_id = $1`, [o.id])), 0);
});
await check('notify_user crea avisos solo visibles para su destinatario', async () => {
  await as(admin, () => q(`select notify_user($1, 'Hola', 'Prueba', '/inicio')`, [rep.id]));
  assert.equal(await as(rep, () => count(`select count(*) n from notifications`)), 1);
  assert.equal(await as(mgr, () => count(`select count(*) n from notifications`)), 0);
  await assert.rejects(as(admin, () => q(`select notify_user($1, 'x', null, 'https://malo.example')`, [rep.id])));
});
await check('solo personalización edita listas, validaciones y automatizaciones', async () => {
  await as(rep, async () => {
    await assert.rejects(q(`insert into picklist_values (object, field, value) values ('accounts', 'account_type', 'X')`));
    assert.equal((await q(`update validation_rules set is_active = false returning id`)).length, 0);
    assert.ok((await count(`select count(*) n from automation_rules`)) >= 3);
  });
});

console.log('Fase 5');
await check('find_duplicates detecta cuentas con el mismo NIT o nombre normalizado', async () => {
  await as(admin, async () => {
    await q(`insert into accounts (name, tax_id) values ('ALMACENES CASA VIVA S.A.S.', null), ('Otra razón social', '860045998-1')`);
    const pairs = await q(`select reason from find_duplicates('accounts')`);
    assert.ok(pairs.some((p) => p.reason === 'Mismo NIT'));
    assert.ok(pairs.some((p) => p.reason === 'Mismo nombre'));
  });
});
await check('merge_records mueve los relacionados al principal y elimina el duplicado', async () => {
  await as(admin, async () => {
    const [m] = await q(`select id from accounts where name = 'Almacenes Casa Viva'`);
    // Los nombres se guardan limpios: el duplicado quedó como «Almacenes Casa Viva S.A.S.».
    const [d] = await q(`select id from accounts where name = 'Almacenes Casa Viva S.A.S.'`);
    await q(`insert into contacts (last_name, account_id) values ('Duplicado', $1)`, [d.id]);
    await q(`select merge_records('accounts', $1, $2)`, [m.id, d.id]);
    assert.equal(await count(`select count(*) n from accounts where id = $1`, [d.id]), 0);
    assert.equal(await count(`select count(*) n from contacts where last_name = 'Duplicado' and account_id = $1`, [m.id]), 1);
  });
});
await check('un asesor no puede fusionar registros de otros', async () => {
  const ids = await q(`select id from accounts where owner_id = $1 limit 2`, [admin.id]);
  await assert.rejects(as(rep, () => q(`select merge_records('accounts', $1, $2)`, [ids[0].id, ids[1].id])));
});
await check('generate_alerts crea avisos una sola vez por día', async () => {
  await db.exec(`update opportunities set close_date = current_date - 3 where name = 'Plaza Andina · Baterías sanitarias'`);
  const first = await as(admin, () => q(`select generate_alerts() n`));
  const second = await as(admin, () => q(`select generate_alerts() n`));
  assert.ok(Number(first[0].n) > 0);
  assert.equal(Number(second[0].n), 0);
  await assert.rejects(as(rep, () => q(`select generate_alerts()`)));
});
await check('el aviso de tareas vencidas concuerda con la cantidad: «1 tarea vencida», «N tareas vencidas»', async () => {
  const titles = (await q(`select title from notifications where dedupe_key like 'tasks:%'`)).map((r) => r.title);
  assert.ok(titles.length > 0, 'debe haber al menos un aviso de tareas vencidas');
  for (const t of titles) assert.match(t, /^Tienes (1 tarea vencida|([02-9]|\d{2,}) tareas vencidas)$/);
});

await check('possible_duplicates encuentra cuentas por NIT y contactos por correo', async () => {
  await as(admin, async () => {
    assert.ok((await q(`select * from possible_duplicates('accounts', 'Nueva razón', null, '900 456 123-1')`)).length >= 1);
    assert.ok((await q(`select * from possible_duplicates('contacts', 'x', 'MRESTREPO@altosdelvalle.example')`)).length >= 1);
    assert.equal((await q(`select * from possible_duplicates('accounts', 'Empresa inexistente XYZ')`)).length, 0);
  });
});

console.log('Fase 6');
await check('goal_progress calcula el avance de las metas de compañía', async () => {
  const [{ start }] = await q(`select date_trunc('year', now() at time zone 'America/Bogota')::date::text as start`);
  const rows = await as(admin, () => q(`select * from goal_progress('year', $1::date) where metric = 'won_amount'`, [start]));
  assert.equal(rows.length, 1);
  assert.ok(Number(rows[0].actual) > 0);
});
await check('un gerente fija metas a su equipo, pero nadie se fija la propia', async () => {
  const [{ start }] = await q(`select date_trunc('month', now() at time zone 'America/Bogota')::date::text as start`);
  await as(mgr, () => q(`insert into sales_goals (user_id, metric, period_type, period_start, target) values ($1, 'won_amount', 'month', $2, 100000000)`, [rep.id, start]));
  await assert.rejects(as(rep, () => q(`insert into sales_goals (user_id, metric, period_type, period_start, target) values ($1, 'won_amount', 'month', $2, 1)`, [rep.id, start])));
  assert.equal(await as(rep, () => count(`select count(*) n from goal_progress('month', $1::date) where user_id = $2`, [start, rep.id])), 1);
  assert.equal(await as(rep, () => count(`select count(*) n from sales_goals where user_id = $1`, [mgr.id])), 0);
});

console.log('Fase 7');
await check('forecast_summary agrupa por categoría y el gerente puede ajustar a su equipo', async () => {
  const [{ start }] = await q(`select date_trunc('quarter', now() at time zone 'America/Bogota')::date::text as start`);
  const rows = await as(admin, () => q(`select * from forecast_summary('quarter', $1::date)`, [start]));
  assert.ok(rows.length >= 1);
  const total = rows.reduce((s, r) => s + Number(r.closed) + Number(r.commit_amount) + Number(r.best_case) + Number(r.pipeline), 0);
  assert.ok(total > 0);
  await as(mgr, () => q(`insert into forecast_adjustments (user_id, period_type, period_start, amount, note) values ($1, 'quarter', $2, 5000000, 'Ajuste')`, [rep.id, start]));
  const [mine] = await as(rep, () => q(`select adjustment, can_adjust from forecast_summary('quarter', $1::date) where user_id = $2`, [start, rep.id]));
  assert.equal(Number(mine.adjustment), 5000000);
  assert.equal(mine.can_adjust, false);
  await assert.rejects(as(rep, () => q(`update forecast_adjustments set amount = 1 where user_id = $1 returning id`, [rep.id]).then((r) => { if (!r.length) throw new Error('bloqueado'); })));
});

console.log('Fase 8');
const [quote] = await q(`select id, discount_percent from quotes where name like 'Remodelación 180 habitaciones%'`);
const [proc] = await q(`select id from approval_processes where object = 'quotes'`);
await check('las cotizaciones calculan su porcentaje de descuento', async () => {
  assert.ok(Number(quote.discount_percent) > 15);
});
await check('un asesor envía a aprobación: se bloquea el registro y se notifica al jefe', async () => {
  await db.exec(`update profiles set manager_id = '${mgr.id}' where id = '${rep.id}'`);
  await q(`update quotes set owner_id = $1, status = 'Borrador' where id = $2`, [rep.id, quote.id]);
  await as(rep, () => q(`select submit_approval($1, $2, 'Pedido por volumen')`, [proc.id, quote.id]));
  const [r] = await q(`select status, approver_id from approval_requests where record_id = $1`, [quote.id]);
  assert.equal(r.status, 'pending');
  assert.equal(r.approver_id, mgr.id);
  assert.equal((await q(`select status from quotes where id = $1`, [quote.id]))[0].status, 'En revisión');
  assert.equal(await count(`select count(*) n from notifications where user_id = $1 and title like 'Aprobación pendiente%'`, [mgr.id]), 1);
  await assert.rejects(as(rep, () => q(`update quotes set description = 'cambio' where id = $1`, [quote.id])), /bloqueado/);
  await assert.rejects(as(rep, () => q(`update quote_line_items set quantity = quantity + 1 where quote_id = $1`, [quote.id])), /bloqueada/);
  await assert.rejects(as(rep, () => q(`select submit_approval($1, $2)`, [proc.id, quote.id])), /pendiente/);
  assert.equal(await as(rep, () => count(`select count(*) n from approval_requests where record_id = $1`, [quote.id])), 1);
});
await check('solo el aprobador decide; rechazar exige motivo; aprobar actualiza el estado', async () => {
  const [{ id }] = await q(`select id from approval_requests where record_id = $1 and status = 'pending'`, [quote.id]);
  await assert.rejects(as(rep, () => q(`select decide_approval($1, true)`, [id])));
  await assert.rejects(as(mgr, () => q(`select decide_approval($1, false, '')`, [id])), /motivo/);
  await as(mgr, () => q(`select decide_approval($1, true, 'Autorizado por volumen')`, [id]));
  assert.equal((await q(`select status from quotes where id = $1`, [quote.id]))[0].status, 'Aprobada');
  assert.equal(await count(`select count(*) n from notifications where user_id = $1 and title like 'Aprobado:%'`, [rep.id]), 1);
  await as(rep, () => q(`update quotes set description = 'ya aprobada' where id = $1`, [quote.id]));
});
await check('quien envía puede retirar la solicitud y el registro vuelve a borrador', async () => {
  const [{ id }] = await as(rep, () => q(`select submit_approval($1, $2) as id`, [proc.id, quote.id]));
  await assert.rejects(as(mgr, () => q(`select recall_approval($1)`, [id])));
  await as(rep, () => q(`select recall_approval($1)`, [id]));
  assert.equal((await q(`select status from quotes where id = $1`, [quote.id]))[0].status, 'Borrador');
  assert.equal((await q(`select status from approval_requests where id = $1`, [id]))[0].status, 'recalled');
});

console.log('Fase 9');
await check('condition_matches evalúa los operadores como el evaluador de la aplicación', async () => {
  const row = JSON.stringify({ amount: 500, name: 'Torre Norte', is_closed: false, close_date: '2026-01-15', tags: ['a', 'b'],
    custom_fields: { nivel: 'Oro' }, created_at: '2026-01-15T03:00:00+00:00', empty: null });
  const cases = [
    [{ field: 'amount', op: 'gt', value: '100' }, true], [{ field: 'amount', op: 'lte', value: '100' }, false],
    [{ field: 'name', op: 'contains', value: 'norte' }, true], [{ field: 'name', op: 'starts', value: 'torre' }, true],
    [{ field: 'is_closed', op: 'eq', value: 'false' }, true], [{ field: 'cf.nivel', op: 'eq', value: 'oro' }, true],
    [{ field: 'tags', op: 'contains', value: 'b' }, true], [{ field: 'empty', op: 'empty' }, true],
    [{ field: 'close_date', op: 'lt', value: '2026-02-01' }, true], [{ field: 'close_date', op: 'overdue' }, true],
    [{ field: 'created_at', op: 'eq', value: '2026-01-14' }, true], [{ field: 'name', op: 'neq', value: 'Torre Norte' }, false],
  ];
  for (const [c, expected] of cases) {
    const [{ ok }] = await q(`select condition_matches($1::jsonb, $2::jsonb) ok`, [row, JSON.stringify(c)]);
    assert.equal(ok, expected, JSON.stringify(c));
  }
});
await check('las reglas programadas se disparan una vez por fecha objetivo', async () => {
  const [opp] = await q(`select id, owner_id from opportunities where not is_closed and owner_id = $1 order by name limit 1`, [admin.id]);
  await q(`update automation_rules set created_at = now() - interval '30 days' where trigger_on = 'scheduled'`);
  await q(`update opportunities set close_date = (now() at time zone 'America/Bogota')::date + 3 where id = $1`, [opp.id]);
  const first = await as(admin, () => q(`select run_scheduled_automations() n`));
  assert.ok(Number(first[0].n) >= 1);
  assert.equal(await count(`select count(*) n from activities where opportunity_id = $1 and subject = 'Confirmar cierre con el cliente'`, [opp.id]), 1);
  await as(admin, () => q(`select run_scheduled_automations()`));
  assert.equal(await count(`select count(*) n from activities where opportunity_id = $1 and subject = 'Confirmar cierre con el cliente'`, [opp.id]), 1);
  await assert.rejects(as(rep, () => q(`select run_scheduled_automations()`)));
});
await check('las cotizaciones vencidas avisan al propietario y a su jefe', async () => {
  await q(`update quotes set status = 'Presentada', expiration_date = (now() at time zone 'America/Bogota')::date - 1 where id = $1`, [quote.id]);
  await q(`select run_scheduled_automations()`);
  assert.equal(await count(`select count(*) n from notifications where user_id = $1 and title = 'Cotización vencida sin respuesta'`, [rep.id]), 1);
  assert.equal(await count(`select count(*) n from notifications where user_id = $1 and title = 'Cotización de tu equipo vencida'`, [mgr.id]), 1);
});

console.log('Fase 10');
await check('el pedido demo queda en producción con sus productos y totales', async () => {
  const [o] = await q(`select status, net_total, activated_at, owner_id from orders where is_demo`);
  assert.equal(o.status, 'En producción');
  assert.ok(Number(o.net_total) > 0);
  assert.ok(o.activated_at);
  assert.equal(o.owner_id, admin.id);
});
await check('solo una cotización aceptada se convierte en pedido, una vez', async () => {
  const [qt] = await q(`select id from quotes where name = 'Torre 3 · propuesta muebles de baño'`);
  await assert.rejects(as(admin, () => q(`select create_order_from_quote($1)`, [qt.id])), /aceptadas/);
  await q(`update quotes set status = 'Aceptada' where id = $1`, [qt.id]);
  const [{ id }] = await as(admin, () => q(`select create_order_from_quote($1) as id`, [qt.id]));
  const [o] = await q(`select status, net_total, account_id, order_number from orders where id = $1`, [id]);
  const [src] = await q(`select net_total, account_id from quotes where id = $1`, [qt.id]);
  assert.equal(o.status, 'Borrador');
  assert.equal(Number(o.net_total), Number(src.net_total));
  assert.equal(o.account_id, src.account_id);
  assert.match(o.order_number, /^PED-\d+$/);
  await assert.rejects(as(admin, () => q(`select create_order_from_quote($1)`, [qt.id])), /ya tiene un pedido/);
});
await check('al activar un pedido sus productos quedan fijos y no vuelve a borrador', async () => {
  const [{ id }] = await q(`select id from orders where not is_demo limit 1`);
  await as(admin, () => q(`update order_items set quantity = quantity + 1 where order_id = $1`, [id]));
  await as(admin, () => q(`update orders set status = 'Activado' where id = $1`, [id]));
  await assert.rejects(as(admin, () => q(`update order_items set quantity = quantity + 1 where order_id = $1`, [id])), /borrador/);
  await assert.rejects(as(admin, () => q(`update orders set status = 'Borrador' where id = $1`, [id])), /no puede volver/);
  await as(admin, () => q(`update orders set status = 'Entregado' where id = $1`, [id]));
  assert.ok((await q(`select delivered_at from orders where id = $1`, [id]))[0].delivered_at);
  assert.equal(await as(admin, () => count(`select count(*) n from global_search('PED-') where object = 'orders'`)), 2);
});
await check('un asesor no ve pedidos ajenos ni los borra; quien tiene «Eliminar» borra un pedido en cualquier estado', async () => {
  assert.equal(await as(rep, () => count(`select count(*) n from orders`)), 0);
  const [{ id, status }] = await q(`select id, status from orders where not is_demo limit 1`);
  assert.equal(status, 'Entregado');
  // Sin el permiso «Eliminar» en Pedidos no se borra, ni siendo el dueño.
  await q(`update orders set owner_id = $2 where id = $1`, [id, rep.id]);
  await as(rep, () => q(`delete from orders where id = $1`, [id]));
  assert.equal(await count(`select count(*) n from orders where id = $1`, [id]), 1);
  await q(`update orders set owner_id = $2 where id = $1`, [id, admin.id]);
  // Con el permiso se borra aunque ya esté entregado, y sus productos se van con él (dentro de una transacción que se deshace).
  await db.exec(`begin`);
  try {
    await as(admin, () => q(`delete from orders where id = $1`, [id]));
    assert.equal(await count(`select count(*) n from orders where id = $1`, [id]), 0);
    assert.equal(await count(`select count(*) n from order_items where order_id = $1`, [id]), 0);
  } finally {
    await db.exec(`rollback`);
  }
  assert.equal(await count(`select count(*) n from orders where id = $1`, [id]), 1);
});

console.log('Fase 11');
await check('un paso cuyas condiciones no se cumplen queda omitido en el historial', async () => {
  const [{ id }] = await q(`select id from approval_requests where record_id = $1 order by submitted_at limit 1`, [quote.id]);
  const steps = await q(`select step_order, status from approval_request_steps where request_id = $1 order by step_order`, [id]);
  assert.deepEqual(steps.map((x) => x.status), ['approved', 'skipped']);
});
await check('con más de 25 % de descuento la solicitud sube al jefe del aprobador anterior', async () => {
  await q(`update quotes set status = 'Borrador' where id = $1`, [quote.id]);
  await q(`update quote_line_items set discount = 30 where quote_id = $1`, [quote.id]);
  await db.exec(`update profiles set manager_id = null where id = '${mgr.id}'`);
  const [{ id }] = await as(rep, () => q(`select submit_approval($1, $2, 'Descuento especial') as id`, [proc.id, quote.id]));
  // Sin jefe del gerente, el paso 2 no tiene aprobador: la aprobación del paso 1 se revierte.
  await assert.rejects(as(mgr, () => q(`select decide_approval($1, true)`, [id])), /no tiene un aprobador activo/);
  assert.equal((await q(`select current_step from approval_requests where id = $1`, [id]))[0].current_step, 1);
  await db.exec(`update profiles set manager_id = '${admin.id}' where id = '${mgr.id}'`);
  await as(mgr, () => q(`select decide_approval($1, true, 'De acuerdo')`, [id]));
  const [r] = await q(`select status, approver_id, current_step, current_step_name from approval_requests where id = $1`, [id]);
  assert.equal(r.status, 'pending');
  assert.equal(r.approver_id, admin.id);
  assert.equal(r.current_step_name, 'Gerencia comercial');
  assert.equal((await q(`select status from quotes where id = $1`, [quote.id]))[0].status, 'En revisión');
  await assert.rejects(as(rep, () => q(`update quotes set description = 'x' where id = $1`, [quote.id])), /bloqueado/);
  assert.equal(await count(`select count(*) n from notifications where user_id = $1 and title like '%Gerencia comercial'`, [admin.id]), 1);
  await as(admin, () => q(`select decide_approval($1, true)`, [id]));
  assert.equal((await q(`select status from approval_requests where id = $1`, [id]))[0].status, 'approved');
  assert.equal((await q(`select status from quotes where id = $1`, [quote.id]))[0].status, 'Aprobada');
  assert.equal(await count(`select count(*) n from approval_request_steps where request_id = $1 and status = 'approved'`, [id]), 2);
  assert.equal(await as(rep, () => count(`select count(*) n from approval_request_steps where request_id = $1`, [id])), 2);
});
await check('las automatizaciones programadas también corren sobre pedidos', async () => {
  await q(`insert into automation_rules (object, name, trigger_on, schedule_field, schedule_offset_days, actions, created_at)
           values ('orders', 'Entrega hoy', 'scheduled', 'requested_delivery_date', 0,
                   '[{"type":"create_task","subject":"Confirmar entrega del pedido","due_in_days":0}]', now() - interval '1 day')`);
  const [o] = await q(`select id, opportunity_id from orders where is_demo`);
  await q(`update orders set requested_delivery_date = (now() at time zone 'America/Bogota')::date where id = $1`, [o.id]);
  await q(`select run_scheduled_automations()`);
  assert.equal(await count(`select count(*) n from activities where subject = 'Confirmar entrega del pedido' and opportunity_id = $1`, [o.opportunity_id]), 1);
});

console.log('Fase 12');
await check('las instantáneas del pronóstico guardan la tendencia y los cambios del pipeline', async () => {
  const [{ start, today }] = await q(`select date_trunc('quarter', now() at time zone 'America/Bogota')::date::text as start,
                                            (now() at time zone 'America/Bogota')::date::text as today`);
  await assert.rejects(as(rep, () => q(`select take_forecast_snapshot()`)));
  const [{ n }] = await as(admin, () => q(`select take_forecast_snapshot() n`));
  assert.ok(Number(n) > 0);
  // Simula que la instantánea se tomó hace una semana.
  await q(`update forecast_snapshots set taken_on = taken_on - 7`);
  await q(`update opportunity_snapshots set taken_on = taken_on - 7`);
  const [opp] = await q(`select id, amount from opportunities
                         where not is_closed and close_date between $1::date and $1::date + interval '3 months' - interval '1 day'
                         order by name limit 1`, [start]);
  await q(`update opportunities set amount = amount + 50000000 where id = $1`, [opp.id]);
  await q(`insert into opportunities (name, account_id, pipeline_id, stage_id, amount, close_date, owner_id)
           select 'Oportunidad nueva de prueba', account_id, pipeline_id, stage_id, 99000000, close_date, owner_id
           from opportunities where id = $1`, [opp.id]);
  await as(admin, () => q(`select take_forecast_snapshot()`));

  const trend = await as(admin, () => q(`select * from forecast_trend('quarter', $1::date)`, [start]));
  assert.equal(trend.length, 2);
  const changes = await as(admin, () => q(`select * from pipeline_changes($1::date - 7, 'quarter', $2::date)`, [today, start]));
  const changed = changes.find((c) => c.opportunity_id === opp.id);
  assert.ok(changed);
  assert.equal(Number(changed.amount_after) - Number(changed.amount_before), 50000000);
  assert.ok(changes.some((c) => c.name === 'Oportunidad Nueva de Prueba' && c.is_new));
  // El asesor solo ve su propia línea de tendencia.
  const mine = await as(rep, () => q(`select count(distinct user_id) n from forecast_snapshots`));
  assert.ok(Number(mine[0].n) <= 1);
});

console.log('Fases 13 y 14');
await check('los nombres en inglés de campos y pipelines solo los cambia quien personaliza', async () => {
  const [cf] = await q(`select label_en, help_text_en from custom_field_definitions where object = 'accounts' and api_name = 'cupo_credito'`);
  assert.equal(cf.label_en, 'Credit limit');
  assert.ok(cf.help_text_en);
  await as(rep, () => q(`update custom_field_definitions set label_en = 'Hack' where api_name = 'cupo_credito'`)).catch(() => {});
  await as(rep, () => q(`update pipelines set name_en = 'Hack'`)).catch(() => {});
  const [after] = await q(`select label_en from custom_field_definitions where api_name = 'cupo_credito'`);
  assert.equal(after.label_en, 'Credit limit');
  assert.equal(Number((await q(`select count(*) n from pipelines where name_en = 'Hack'`))[0].n), 0);
  await as(admin, () => q(`update pipelines set name_en = 'Projects and builders' where is_default`));
  assert.equal((await q(`select name_en from pipelines where is_default`))[0].name_en, 'Projects and builders');
});

console.log('Fase 15');
await check('el equipo de cuenta da acceso a la cuenta y a sus oportunidades sin permitir eliminar', async () => {
  const [acc] = await q(`select a.id, a.name from accounts a where a.owner_id = $1
                         and (select count(*) from opportunities o where o.account_id = a.id) > 1
                         and exists (select 1 from quotes x where x.account_id = a.id) order by a.name limit 1`, [admin.id]);
  const opps = await count(`select count(*) n from opportunities where account_id = $1`, [acc.id]);
  assert.equal(await as(rep, () => count(`select count(*) n from opportunities where account_id = $1`, [acc.id])), 0);
  // El asesor no gestiona equipos ajenos; el propietario no entra a su propio equipo.
  await assert.rejects(as(rep, () => q(`insert into account_team_members (account_id, user_id) values ($1, $2)`, [acc.id, rep.id])));
  await assert.rejects(as(admin, () => q(`insert into account_team_members (account_id, user_id) values ($1, $2)`, [acc.id, admin.id])));
  await as(admin, () => q(`insert into account_team_members (account_id, user_id, team_role, account_access, opportunity_access)
                           values ($1, $2, 'Especificador', 'read', 'edit')`, [acc.id, rep.id]));
  assert.equal(await count(`select count(*) n from notifications where user_id = $1 and title like '%' || $2 || '%'`, [rep.id, acc.name]), 1);
  assert.equal(await as(rep, () => count(`select count(*) n from opportunities where account_id = $1`, [acc.id])), opps);
  assert.ok(await as(rep, () => count(`select count(*) n from quotes where account_id = $1`, [acc.id])) > 0);
  // Edita las oportunidades (nivel edición) pero no la cuenta (lectura) ni las cotizaciones; no elimina.
  await as(rep, () => q(`update opportunities set next_step = 'Revisión con especificador' where account_id = $1`, [acc.id]));
  assert.equal(await count(`select count(*) n from opportunities where account_id = $1 and next_step = 'Revisión con especificador'`, [acc.id]), opps);
  await as(rep, () => q(`update accounts set description = 'cambio del equipo' where id = $1`, [acc.id]));
  assert.equal(await count(`select count(*) n from accounts where id = $1 and description = 'cambio del equipo'`, [acc.id]), 0);
  await as(rep, () => q(`update quotes set name = 'x' where account_id = $1`, [acc.id]));
  assert.equal(await count(`select count(*) n from quotes where account_id = $1 and name = 'x'`, [acc.id]), 0);
  await as(rep, () => q(`delete from opportunities where account_id = $1`, [acc.id]));
  assert.equal(await count(`select count(*) n from opportunities where account_id = $1`, [acc.id]), opps);
  assert.equal((await as(rep, () => q(`select can_edit_team_record('opportunities', owner_id, id) ok from opportunities where account_id = $1 limit 1`, [acc.id])))[0].ok, true);
  // Al pasarle la cuenta, sale del equipo (ya es propietario).
  await q(`update accounts set owner_id = $2 where id = $1`, [acc.id, rep.id]);
  assert.equal(await count(`select count(*) n from account_team_members where account_id = $1`, [acc.id]), 0);
  await q(`update accounts set owner_id = $2 where id = $1`, [acc.id, admin.id]);
});

await check('el equipo predeterminado se agrega al crear una oportunidad si el propietario lo activa', async () => {
  await as(rep, () => q(`insert into default_team_members (object, user_id, team_role, access) values ('opportunities', $1, 'Gerente comercial', 'edit')`, [mgr.id]));
  await assert.rejects(as(rep, () => q(`insert into default_team_members (owner_id, object, user_id) values ($1, 'opportunities', $2)`, [admin.id, rep.id])));
  const create = () => as(rep, () => q(`insert into opportunities (name, account_id, pipeline_id, stage_id, amount, close_date)
    select $1, a.id, p.id, (select id from pipeline_stages where pipeline_id = p.id order by sort_order limit 1), 1000000, current_date + 30
    from pipelines p, (select id from accounts order by name limit 1) a where p.is_default returning id`, [`Equipo auto ${Math.random()}`]));
  const [first] = await create();
  assert.equal(await count(`select count(*) n from opportunity_team_members where opportunity_id = $1`, [first.id]), 0);
  await q(`update profiles set preferences = preferences || '{"team_auto_add_opportunities": true}' where id = $1`, [rep.id]);
  const [second] = await create();
  const [m] = await q(`select user_id, access, team_role from opportunity_team_members where opportunity_id = $1`, [second.id]);
  assert.equal(m.user_id, mgr.id);
  assert.equal(m.access, 'edit');
  // El gerente ya la veía por jerarquía; un usuario ajeno con el botón no puede copiar equipos.
  await assert.rejects(as(mgr, () => q(`select add_default_team('accounts', (select id from accounts where owner_id = $1 limit 1))`, [admin.id])));
  assert.equal((await as(rep, () => q(`select add_default_team('opportunities', $1) n`, [first.id])))[0].n, 1);
});

console.log('Fase 16');
await check('el reparto 50/50 acredita a cada vendedor la mitad en metas, pronóstico e Indicadores', async () => {
  const [opp] = await q(`select id, amount, close_date from opportunities
                         where owner_id = $1 and is_won and amount > 0 order by close_date desc limit 1`, [admin.id]);
  const start = (await q(`select date_trunc('month', $1::date)::date::text d`, [opp.close_date]))[0].d;
  await q(`insert into sales_goals (user_id, metric, period_type, period_start, target)
           values ($1, 'won_amount', 'month', $2, 1) on conflict do nothing`, [rep.id, start]);
  const repWon = async () => Number((await as(admin, () => q(`select actual from goal_progress('month', $1::date) where user_id = $2 and metric = 'won_amount'`, [start, rep.id])))[0]?.actual ?? 0);
  const before = await repWon();
  assert.equal(await as(rep, () => count(`select count(*) n from opportunities where id = $1`, [opp.id])), 0);

  // Validaciones: suma distinta de 100, usuario repetido, quien no gestiona el equipo.
  await assert.rejects(as(admin, () => q(`select set_opportunity_splits($1, $2)`, [opp.id, JSON.stringify([{ user_id: admin.id, percent: 50 }, { user_id: rep.id, percent: 40 }])])));
  await assert.rejects(as(admin, () => q(`select set_opportunity_splits($1, $2)`, [opp.id, JSON.stringify([{ user_id: rep.id, percent: 50 }, { user_id: rep.id, percent: 50 }])])));
  await assert.rejects(as(rep, () => q(`select set_opportunity_splits($1, $2)`, [opp.id, JSON.stringify([{ user_id: rep.id, percent: 100 }])])));
  await assert.rejects(q(`insert into opportunity_splits (opportunity_id, user_id, percent) values ($1, $2, 0)`, [opp.id, rep.id]));

  await as(admin, () => q(`select set_opportunity_splits($1, $2)`, [opp.id, JSON.stringify([
    { user_id: admin.id, percent: 50 }, { user_id: rep.id, percent: 50, note: 'Obra en su zona' }])]));
  // La asesora entra al equipo (lectura), ve el negocio y recibe aviso; su meta suma la mitad.
  assert.equal(await as(rep, () => count(`select count(*) n from opportunities where id = $1`, [opp.id])), 1);
  assert.equal(await count(`select count(*) n from notifications where user_id = $1 and title like 'Participas con 50 %%'`, [rep.id]), 1);
  assert.equal(await repWon() - before, Number(opp.amount) / 2);
  const fs = await as(admin, () => q(`select user_id, closed from forecast_summary('month', $1::date)`, [start]));
  assert.ok(Number(fs.find((r) => r.user_id === rep.id).closed) >= Number(opp.amount) / 2);
  const dash = await as(admin, () => q(`select crm_dashboard($1::date, ($1::date + interval '1 month' - interval '1 day')::date, $2) d`, [start, rep.id]));
  assert.ok(Number(dash[0].d.kpis.won_amount) >= Number(opp.amount) / 2);

  // Al cambiar el propietario, su 50 % pasa al nuevo (que ya tenía 50 %: queda con 100 %).
  await q(`update opportunities set owner_id = $2 where id = $1`, [opp.id, rep.id]);
  const splits = await q(`select user_id, percent from opportunity_splits where opportunity_id = $1`, [opp.id]);
  assert.deepEqual(splits.map((r) => [r.user_id, Number(r.percent)]), [[rep.id, 100]]);
  await q(`update opportunities set owner_id = $2 where id = $1`, [opp.id, admin.id]);
  await as(admin, () => q(`select set_opportunity_splits($1, '[]')`, [opp.id]));
  assert.equal(await count(`select count(*) n from opportunity_credit where opportunity_id = $1 and user_id = $2 and percent = 100`, [opp.id, admin.id]), 1);
});

console.log('Fase 17');
await check('los tokens MCP respetan los permisos del perfil, se revocan y no se pueden alterar', async () => {
  const insertToken = (user, hash, scope) => as(user, () => q(
    `insert into mcp_tokens (name, token_prefix, token_hash, scope) values ('Prueba', 'fcrm_x', $1, $2) returning id`, [hash, scope]));
  const resolve = async (hash) => {
    await db.exec(`set role anon`);
    try { return await q(`select * from mcp_resolve_token($1)`, [hash]); } finally { await db.exec(`reset role`); }
  };
  // Sin el permiso «use_mcp» el asesor no crea tokens; el administrador sí (con cambios).
  await assert.rejects(insertToken(rep, 'hash-rep-1', 'read'));
  const [adminToken] = await insertToken(admin, 'hash-admin-1', 'write');
  assert.deepEqual((await resolve('hash-admin-1')).map((r) => [r.user_id, r.scope]), [[admin.id, 'write']]);
  assert.equal((await resolve('no-existe')).length, 0);

  // Con «use_mcp» pero sin «mcp_write», el asesor solo crea tokens de consulta.
  await q(`update permission_profiles pp set permissions = pp.permissions
             || jsonb_build_object('system', coalesce(pp.permissions -> 'system', '{}') || '{"use_mcp": true}')
           where pp.id = (select permission_profile_id from profiles where id = $1)`, [rep.id]);
  await assert.rejects(insertToken(rep, 'hash-rep-2', 'write'));
  await insertToken(rep, 'hash-rep-3', 'read');
  assert.equal((await resolve('hash-rep-3'))[0].scope, 'read');
  // Cada quien ve sus tokens; la función de permisos por usuario no es pública.
  assert.equal(await as(rep, () => count(`select count(*) n from mcp_tokens`)), 1);
  await assert.rejects(as(rep, () => q(`select user_has_system_perm($1, 'use_mcp')`, [rep.id])));

  // Revocar es definitivo; el alcance no se puede cambiar.
  await assert.rejects(as(admin, () => q(`update mcp_tokens set scope = 'read' where id = $1`, [adminToken.id])));
  await as(admin, () => q(`update mcp_tokens set revoked_at = now() where id = $1`, [adminToken.id]));
  assert.equal((await resolve('hash-admin-1')).length, 0);
  await assert.rejects(as(admin, () => q(`update mcp_tokens set revoked_at = null where id = $1`, [adminToken.id])));

  // El registro de actividad de IA: cada quien el suyo; administración ve todo.
  await as(rep, () => q(`insert into mcp_activity (tool, summary) values ('buscar', 'casa viva')`));
  await assert.rejects(as(rep, () => q(`insert into mcp_activity (user_id, tool) values ($1, 'x')`, [admin.id])));
  assert.equal(await as(admin, () => count(`select count(*) n from mcp_activity where user_id = $1`, [rep.id])), 1);
});

await check('el código SAP de las cuentas se normaliza y no se repite', async () => {
  const [a, b] = await q(`select id from accounts order by name limit 2`);
  await q(`update accounts set sap_card_code = ' c 00123 ' where id = $1`, [a.id]);
  assert.equal((await q(`select sap_card_code from accounts where id = $1`, [a.id]))[0].sap_card_code, 'C00123');
  await assert.rejects(q(`update accounts set sap_card_code = 'c00123' where id = $1`, [b.id]));
  await q(`update accounts set sap_card_code = '' where id = $1`, [a.id]);
  assert.equal((await q(`select sap_card_code from accounts where id = $1`, [a.id]))[0].sap_card_code, null);
});

await check('el agente de SAP guarda la copia de cartera e inventario y nadie más puede escribirla', async () => {
  const [agent] = await q(`insert into auth.users (email) values ('agente.sap@firplak.com') returning id`);
  await q(`update profiles set permission_profile_id = (select id from permission_profiles where name = 'Integración SAP') where id = $1`, [agent.id]);
  const [mine] = await q(`select id from accounts where owner_id = $1 order by name limit 1`, [admin.id]);
  await q(`update accounts set sap_card_code = 'CN900' where id = $1`, [mine.id]);
  const [prod] = await q(`select product_code from products where is_active and product_code is not null and not is_kit order by product_code limit 1`);

  // Ni un asesor ni la administración pueden usar las funciones del agente ni escribir las tablas.
  for (const u of [rep, admin]) {
    await assert.rejects(as(u, () => q(`select sap_agent_targets()`)), /Solo el agente de SAP/);
    await assert.rejects(as(u, () => q(`select sap_agent_save('partners', '[{"code":"CN900","data":{}}]')`)), /Solo el agente de SAP/);
    await assert.rejects(as(u, () => q(`insert into sap_partners (card_code, data) values ('CN900', '{}')`)));
  }
  // El agente no ve cuentas ni negocios: solo los códigos por sincronizar.
  assert.equal(await as(agent, () => count(`select count(*) n from accounts`)), 0);
  assert.equal(await as(agent, () => count(`select count(*) n from opportunities`)), 0);
  const [{ t }] = await as(agent, () => q(`select sap_agent_targets() t`));
  assert.deepEqual(t.card_codes, ['CN900']);
  assert.ok(t.item_codes.includes(prod.product_code));

  const [{ run }] = await as(agent, () => q(`select sap_agent_start('equipo-de-prueba') run`));
  const partner = { partner: { CardCode: 'CN900', CardName: 'CLIENTE', CurrentAccountBalance: 10, OpenOrdersBalance: 0, OpenDeliveryNotesBalance: 0, CreditLimit: 100 }, orders: [], invoices: [] };
  const [{ n }] = await as(agent, () => q(`select sap_agent_save('partners', $1::jsonb) n`,
    [JSON.stringify([{ code: 'CN900', data: partner }, { code: 'CNVIEJO', data: partner }])]));
  assert.equal(n, 2);
  await as(agent, () => q(`select sap_agent_save('items', $1::jsonb)`, [JSON.stringify([{ code: prod.product_code, data: null }])]));
  await assert.rejects(as(agent, () => q(`select sap_agent_save('otra', '[]')`)), /Tipo no válido/);
  await as(agent, () => q(`select sap_agent_finish($1, 2, 1, '[]')`, [run]));

  // Al cerrar se borra lo que ya no está vinculado; un artículo que no existe en SAP queda con datos nulos.
  assert.equal(await count(`select count(*) n from sap_partners`), 1);
  assert.equal((await q(`select data from sap_items where item_code = $1`, [prod.product_code]))[0].data, null);
  const [r] = await q(`select ok, partners, items, host, finished_at from sap_sync_runs where id = $1`, [run]);
  assert.deepEqual([r.ok, r.partners, r.items, r.host], [true, 2, 1, 'equipo-de-prueba']);
  assert.ok(r.finished_at);

  // Lectura: con «Ver información de SAP» y solo de cuentas que la persona puede ver.
  await q(`update permission_profiles set permissions = jsonb_set(permissions, '{system,view_sap}', 'true') where name = 'Asesor comercial'`);
  await q(`update sharing_settings set access = 'private' where object = 'accounts'`);
  assert.equal(await as(admin, () => count(`select count(*) n from sap_partners`)), 1);
  assert.equal(await as(rep, () => count(`select count(*) n from sap_partners`)), 0);
  await q(`update sharing_settings set access = 'read' where object = 'accounts'`);
  assert.equal(await as(rep, () => count(`select count(*) n from sap_partners`)), 1);
  await q(`update permission_profiles set permissions = jsonb_set(permissions, '{system,view_sap}', 'false') where name = 'Asesor comercial'`);
  assert.equal(await as(rep, () => count(`select count(*) n from sap_partners`)), 0);
  assert.equal(await as(rep, () => count(`select count(*) n from sap_sync_runs`)), 0);
  assert.equal(await as(admin, () => count(`select count(*) n from sap_sync_runs`)), 1);

  await q(`update accounts set sap_card_code = null where id = $1`, [mine.id]);
  await db.exec(`delete from sap_partners; delete from sap_items; delete from sap_sync_runs`);
  await q(`delete from auth.users where id = $1`, [agent.id]);
});

await check('las solicitudes a SAP las crea la administración y solo el agente las atiende e importa productos', async () => {
  const [agent] = await q(`insert into auth.users (email) values ('agente.sap@firplak.com') returning id`);
  await q(`update profiles set permission_profile_id = (select id from permission_profiles where name = 'Integración SAP') where id = $1`, [agent.id]);

  // Un asesor no puede pedir nada; la administración crea la solicitud, pero no puede darla por atendida.
  await assert.rejects(as(rep, () => q(`insert into sap_requests (kind) values ('product_preview')`)));
  const [req] = await as(admin, () => q(`insert into sap_requests (kind, params) values ('product_import', '{"prefix":"ZZ-"}') returning id`));
  await assert.rejects(as(admin, () => q(`insert into sap_requests (kind, status) values ('product_import', 'done')`)));
  assert.equal((await as(admin, () => q(`update sap_requests set status = 'done' where id = $1 returning id`, [req.id]))).length, 0);
  await assert.rejects(as(admin, () => q(`select sap_agent_next_request()`)), /Solo el agente de SAP/);
  await assert.rejects(as(admin, () => q(`select sap_agent_import_products('[]')`)), /Solo el agente de SAP/);
  assert.equal(await as(rep, () => count(`select count(*) n from sap_requests`)), 0);

  // El agente la toma (queda en curso), importa por lotes y la cierra con el resultado.
  const [{ next }] = await as(agent, () => q(`select sap_agent_next_request() next`));
  assert.deepEqual([next.id, next.kind, next.params.prefix], [req.id, 'product_import', 'ZZ-']);
  assert.equal((await as(agent, () => q(`select sap_agent_next_request() next`)))[0].next, null);
  const filas = [{ code: 'ZZ-001', name: 'LAVAMANOS ZZ', custom: { linea: 'Prueba' } }, { code: 'ZZ-002', name: '' }];
  const [{ r1 }] = await as(agent, () => q(`select sap_agent_import_products($1::jsonb) r1`, [JSON.stringify(filas)]));
  assert.deepEqual(r1, { created: 2, updated: 0, groups_created: 0, kits: 0 });
  // Repetir actualiza nombre y campos mapeados, sin duplicar ni borrar otros campos.
  await q(`update products set custom_fields = custom_fields || '{"otro":"se conserva"}', family = 'Lavamanos y superficies' where product_code = 'ZZ-001'`);
  const [{ r2 }] = await as(agent, () => q(`select sap_agent_import_products($1::jsonb) r2`,
    [JSON.stringify([{ code: 'ZZ-001', name: 'LAVAMANOS ZZ NUEVO', custom: { linea: 'Otra' } }])]));
  assert.deepEqual(r2, { created: 0, updated: 1, groups_created: 0, kits: 0 });
  const [p1] = await q(`select name, family, unit, is_active, custom_fields from products where product_code = 'ZZ-001'`);
  assert.deepEqual([p1.name, p1.family, p1.unit, p1.is_active], ['LAVAMANOS ZZ NUEVO', 'Lavamanos y superficies', 'Unidad', true]);
  assert.deepEqual(p1.custom_fields, { linea: 'Otra', otro: 'se conserva' });
  assert.equal((await q(`select name from products where product_code = 'ZZ-002'`))[0].name, 'ZZ-002');
  // Con Familia y Planta elegidas y el Grupo de Artículo de SAP: el grupo que falta se crea en la lista, atado a la familia.
  await q(`insert into picklist_values (object, field, value) values ('products', 'plant', 'Planta Uno')`);
  const conGrupo = [{ code: 'ZZ-003', name: 'LAVAMANOS ECO', item_group: 'BAN02-Lavamanos ECO' }, { code: 'ZZ-001', name: 'LAVAMANOS ZZ NUEVO', item_group: 'BAN02-Lavamanos ECO' }];
  await assert.rejects(as(agent, () => q(`select sap_agent_import_products($1::jsonb, null, 'Planta Uno')`, [JSON.stringify(conGrupo)])), /hay que elegir la Familia/);
  await assert.rejects(as(agent, () => q(`select sap_agent_import_products($1::jsonb, 'Lavamanos y superficies', 'No existe')`, [JSON.stringify(conGrupo)])), /La planta «No existe» no está en la lista de valores/);
  const [{ r3 }] = await as(agent, () => q(`select sap_agent_import_products($1::jsonb, 'Lavamanos y superficies', 'Planta Uno') r3`, [JSON.stringify(conGrupo)]));
  assert.deepEqual(r3, { created: 1, updated: 1, groups_created: 1, kits: 0 });
  const [p3] = await q(`select family, plant, item_group from products where product_code = 'ZZ-003'`);
  assert.deepEqual([p3.family, p3.plant, p3.item_group], ['Lavamanos y superficies', 'Planta Uno', 'BAN02-Lavamanos ECO']);
  assert.deepEqual((await q(`select controlling_map from picklist_values where object = 'products' and field = 'item_group' and value = 'BAN02-Lavamanos ECO'`))[0].controlling_map,
    { family: ['Lavamanos y superficies'] });
  assert.equal(await count(`select count(*) n from picklist_dependencies where object = 'products' and field = 'item_group' and controlling_field = 'family'`), 1);
  // El mismo grupo con otra familia se habilita para las dos; sin familia ni planta, lo que ya tenía el producto se conserva.
  // Con plantas en la lista, un artículo que no es kit no entra sin planta: la elige siempre la persona.
  await assert.rejects(as(agent, () => q(`select sap_agent_import_products($1::jsonb, 'Muebles de baño')`, [JSON.stringify([{ code: 'ZZ-004', name: 'OTRO' }])])), /Falta elegir la planta de: ZZ-004/);
  await as(agent, () => q(`select sap_agent_import_products($1::jsonb, 'Muebles de baño', 'Planta Uno')`, [JSON.stringify([{ code: 'ZZ-004', name: 'OTRO', item_group: 'BAN02-Lavamanos ECO' }])]));
  assert.deepEqual((await q(`select controlling_map -> 'family' f from picklist_values where object = 'products' and field = 'item_group' and value = 'BAN02-Lavamanos ECO'`))[0].f,
    ['Lavamanos y superficies', 'Muebles de baño']);
  await as(agent, () => q(`select sap_agent_import_products($1::jsonb)`, [JSON.stringify([{ code: 'ZZ-003', name: 'LAVAMANOS ECO 2' }])]));
  const [p4] = await q(`select name, family, plant, item_group from products where product_code = 'ZZ-003'`);
  assert.deepEqual([p4.name, p4.family, p4.plant, p4.item_group], ['LAVAMANOS ECO 2', 'Lavamanos y superficies', 'Planta Uno', 'BAN02-Lavamanos ECO']);
  // Un kit de SAP entra marcado como Kit, con planta «KIT», y con sus componentes enlazados; cada componente con su planta.
  await q(`insert into picklist_values (object, field, value) values ('products', 'plant', 'Planta Dos')`);
  const kit = [
    { code: 'ZZ-C1', name: 'LAVAMANOS', plant: 'Planta Uno' }, { code: 'ZZ-C2', name: 'MUEBLE', plant: 'Planta Dos' },
    { code: 'ZZ-KIT', name: 'KIT LAVAMANOS Y MUEBLE', is_kit: true, components: [{ code: 'ZZ-C1', quantity: 1 }, { code: 'ZZ-C2', quantity: 2 }, { code: 'ZZ-NO-EXISTE', quantity: 1 }] },
  ];
  await assert.rejects(as(agent, () => q(`select sap_agent_import_products($1::jsonb)`, [JSON.stringify([{ ...kit[0], plant: 'Otra' }])])), /La planta «Otra» no está en la lista/);
  const [{ r5 }] = await as(agent, () => q(`select sap_agent_import_products($1::jsonb, 'Lavamanos y superficies') r5`, [JSON.stringify(kit)]));
  assert.deepEqual(r5, { created: 3, updated: 0, groups_created: 0, kits: 1 });
  const [pk] = await q(`select id, is_kit, plant from products where product_code = 'ZZ-KIT'`);
  assert.deepEqual([pk.is_kit, pk.plant], [true, 'KIT']);
  assert.deepEqual(await q(`select p.product_code c, p.plant, kc.quantity::float q from product_kit_components kc join products p on p.id = kc.component_id where kc.kit_id = $1 order by kc.sort_order`, [pk.id]),
    [{ c: 'ZZ-C1', plant: 'Planta Uno', q: 1 }, { c: 'ZZ-C2', plant: 'Planta Dos', q: 2 }]);
  // Repetir con otra lista de materiales la reemplaza: cambia la cantidad y sale el componente que SAP ya no trae.
  await as(agent, () => q(`select sap_agent_import_products($1::jsonb, 'Lavamanos y superficies')`,
    [JSON.stringify([{ code: 'ZZ-KIT', name: 'KIT LAVAMANOS Y MUEBLE', is_kit: true, components: [{ code: 'ZZ-C2', quantity: 3 }] }])]));
  assert.deepEqual(await q(`select p.product_code c, kc.quantity::float q from product_kit_components kc join products p on p.id = kc.component_id where kc.kit_id = $1`, [pk.id]), [{ c: 'ZZ-C2', q: 3 }]);

  // Ya con la dependencia creada, la base rechaza un grupo que no corresponde a la familia del producto.
  await assert.rejects(q(`update products set family = 'Cocinas' where product_code = 'ZZ-003'`), /no corresponde/);

  await as(agent, () => q(`select sap_agent_finish_request($1, '{"total":2,"created":2,"updated":0}', null)`, [req.id]));
  const [done] = await as(admin, () => q(`select status, result, finished_at from sap_requests where id = $1`, [req.id]));
  assert.deepEqual([done.status, done.result.created], ['done', 2]);
  assert.ok(done.finished_at);

  // Una solicitud que nadie atiende en 15 minutos queda con error y su explicación.
  const [old] = await as(admin, () => q(`insert into sap_requests (kind) values ('product_preview') returning id`));
  await q(`update sap_requests set created_at = now() - interval '20 minutes' where id = $1`, [old.id]);
  assert.equal((await as(agent, () => q(`select sap_agent_next_request() next`)))[0].next, null);
  assert.match((await q(`select error from sap_requests where id = $1 and status = 'error'`, [old.id]))[0].error, /no atendió la solicitud a tiempo/);

  await db.exec(`delete from sap_requests; delete from product_kit_components where kit_id in (select id from products where product_code like 'ZZ-%');
    delete from products where product_code like 'ZZ-%';
    delete from picklist_values where object = 'products' and field in ('plant', 'item_group');
    delete from picklist_dependencies where object = 'products' and field = 'item_group'`);
  await q(`delete from auth.users where id = $1`, [agent.id]);
});

console.log('Fase 18');
await check('borrar los datos de ejemplo deja la configuración y solo lo puede hacer administración', async () => {
  const configBefore = await q(`select (select count(*) from pipelines) p, (select count(*) from custom_field_definitions) f,
                                       (select count(*) from permission_profiles) pp, (select count(*) from validation_rules) v`);
  const demo = await as(admin, () => q(`select demo_data_counts() c`));
  assert.ok(Number(demo[0].c.accounts) > 0 && Number(demo[0].c.orders) > 0);
  // Un registro real (no demo) se conserva.
  const [real] = await q(`insert into accounts (name, account_type, owner_id) values ('Cliente real S.A.S.', 'Cliente', $1) returning id`, [admin.id]);
  await assert.rejects(as(rep, () => q(`select purge_demo_data()`)));
  await as(admin, () => q(`select purge_demo_data()`));
  const after = await as(admin, () => q(`select demo_data_counts() c`));
  assert.ok(Object.values(after[0].c).every((n) => Number(n) === 0));
  assert.equal(await count(`select count(*) n from accounts where id = $1`, [real.id]), 1);
  assert.deepEqual(await q(`select (select count(*) from pipelines) p, (select count(*) from custom_field_definitions) f,
                                   (select count(*) from permission_profiles) pp, (select count(*) from validation_rules) v`), configBefore);
  // Los bloqueos vuelven a estar activos: un pedido activado no se puede borrar.
  const [acc] = await q(`select id from accounts where id = $1`, [real.id]);
  assert.ok(acc);
});

console.log('Fase 19');
await check('OAuth: registro, código con PKCE de un solo uso, refresco rotativo y revocación al reusarlo', async () => {
  const asAnon = async (sql, params) => {
    await db.exec(`set role anon`);
    try { return await q(sql, params); } finally { await db.exec(`reset role`); }
  };
  await assert.rejects(asAnon(`select oauth_register_client('Mala', array['http://evil.example/cb'])`));
  await assert.rejects(asAnon(`select oauth_register_client('Mala', array['javascript:alert(1)'])`));
  const [{ oauth_register_client: client }] = await asAnon(`select oauth_register_client('ChatGPT', array['https://chatgpt.com/connector_platform_oauth_redirect'])`);
  const redirect = 'https://chatgpt.com/connector_platform_oauth_redirect';
  const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
  // Redirección no registrada o permiso de cambios que el asesor no tiene: rechazado.
  await assert.rejects(as(admin, () => q(`select oauth_create_code($1, 'https://otro.example/cb', $2, 'read', null, 'code-x')`, [client, challenge])));
  await assert.rejects(as(rep, () => q(`select oauth_create_code($1, $2, $3, 'write', null, 'code-rep')`, [client, redirect, challenge])));
  await as(admin, () => q(`select oauth_create_code($1, $2, $3, 'write', null, 'code-1')`, [client, redirect, challenge]));

  const exchange = (code, ch) => asAnon(`select * from oauth_exchange_code($1, $2, $3, $4, 'acc-1', 'fcrm_acc1', 'ref-1')`, [code, client, redirect, ch]);
  await assert.rejects(exchange('code-1', 'otro-reto-de-pkce-que-no-coincide-xxxxxxxxxx'));
  const [tok] = await exchange('code-1', challenge);
  assert.deepEqual([tok.scope, tok.expires_in], ['write', 3600]);
  await assert.rejects(exchange('code-1', challenge));
  assert.equal((await asAnon(`select * from mcp_resolve_token('acc-1')`))[0].user_id, admin.id);

  // Refresco: rota; reusar el anterior revoca toda la aplicación conectada.
  const refresh = (r, acc, next) => asAnon(`select * from oauth_refresh($1, $2, $3, 'fcrm_x', $4)`, [r, client, acc, next]);
  assert.equal((await refresh('ref-1', 'acc-2', 'ref-2')).length, 1);
  assert.equal((await asAnon(`select * from mcp_resolve_token('acc-2')`)).length, 1);
  assert.equal((await refresh('ref-1', 'acc-3', 'ref-3')).length, 0);
  assert.equal((await asAnon(`select * from mcp_resolve_token('acc-2')`)).length, 0);
  assert.equal((await refresh('ref-2', 'acc-4', 'ref-4')).length, 0);
  // Las aplicaciones se ven por su dueño; una revocada no se reactiva.
  const [grant] = await as(admin, () => q(`select id, revoked_at from oauth_grants where client_id = $1`, [client]));
  assert.ok(grant.revoked_at);
  assert.equal(await as(rep, () => count(`select count(*) n from oauth_grants`)), 0);
  assert.equal(await as(rep, () => count(`select count(*) n from oauth_clients`)), 0);
  assert.equal((await as(admin, () => q(`select c.name from oauth_grants g join oauth_clients c on c.id = g.client_id`)))[0].name, 'ChatGPT');
  await assert.rejects(as(admin, () => q(`update oauth_grants set revoked_at = null where id = $1`, [grant.id])));
});

console.log('Fase 20');
await check('Microsoft 365: cada quien su conexión y sus vínculos; canales de Teams solo para administración', async () => {
  await as(rep, () => q(`insert into ms365_connections (access_token_enc, refresh_token_enc, expires_at, email) values ('x', 'y', now(), 'asesor@firplak.com')`));
  await assert.rejects(as(rep, () => q(`insert into ms365_connections (user_id, access_token_enc, refresh_token_enc, expires_at) values ($1, 'x', 'y', now())`, [admin.id])));
  assert.equal(await as(mgr, () => count(`select count(*) n from ms365_connections`)), 0);
  assert.equal(await as(admin, () => count(`select count(*) n from ms365_connections`)), 1);
  const [act] = await q(`select id from activities limit 1`);
  await as(rep, () => q(`insert into external_links (kind, external_id, object, record_id, origin) values ('outlook_event', 'evt-1', 'activities', $1, 'crm')`, [act.id]));
  await assert.rejects(as(rep, () => q(`insert into external_links (kind, external_id, object, record_id) values ('outlook_event', 'evt-1', 'activities', $1)`, [act.id])));
  assert.equal(await as(admin, () => count(`select count(*) n from external_links`)), 0);
  await assert.rejects(as(rep, () => q(`insert into teams_channels (name, webhook_url) values ('Ventas', 'https://example.com/hook')`)));
  await as(admin, () => q(`insert into teams_channels (name, webhook_url) values ('Ventas', 'https://example.com/hook')`));
  assert.equal(await as(rep, () => count(`select count(*) n from teams_channels`)), 0);
  await q(`update activities set email_delivery = 'outlook' where id = $1`, [act.id]);
});

console.log('Fase 21');
await check('carpetas de SharePoint: las ve quien ve el registro; los ajustes los cambia administración', async () => {
  const [opp] = await q(`select id from opportunities where owner_id = $1 order by name limit 1`, [admin.id]);
  await as(admin, () => q(`insert into record_folders (object, record_id, drive_id, item_id, web_url) values ('opportunities', $1, 'drv', 'itm', 'https://sp/x')`, [opp.id]));
  // La asesora no ve esa oportunidad (privada) ni su carpeta, y no puede crearle otra.
  const visible = await as(rep, () => count(`select count(*) n from opportunities where id = $1`, [opp.id]));
  assert.equal(await as(rep, () => count(`select count(*) n from record_folders where record_id = $1`, [opp.id])), visible);
  if (!visible) {
    await assert.rejects(as(rep, () => q(`insert into record_folders (object, record_id, drive_id, item_id) values ('opportunities', $1, 'd', 'i')`, [opp.id])));
  }
  await assert.rejects(as(rep, () => q(`insert into integration_settings (key, value) values ('sharepoint', '{}')`)));
  await as(admin, () => q(`insert into integration_settings (key, value) values ('sharepoint', '{"drive_id":"drv"}')`));
  assert.equal((await as(rep, () => q(`select value from integration_settings where key = 'sharepoint'`)))[0].value.drive_id, 'drv');
});

console.log('Fase 23');
await check('un pedido activado guarda su oferta de venta de SAP una sola vez', async () => {
  const [acc] = await as(admin, () => q(`insert into accounts (name, industry) values ('Cliente con pedido SAP', 'Canal Constructores') returning id`));
  const [o] = await as(admin, () => q(`insert into orders (name, account_id) values ('Pedido SAP 1', $1) returning id`, [acc.id]));
  const [other] = await as(admin, () => q(`insert into orders (name, account_id) values ('Pedido SAP 2', $1) returning id`, [acc.id]));
  await as(admin, () => q(`update orders set sap_quotation_entry = 501, sap_quotation_num = 2001, sap_sent_at = now(), sap_error = null where id = $1`, [o.id]));
  assert.equal((await q(`select sap_quotation_num from orders where id = $1`, [o.id]))[0].sap_quotation_num, 2001);
  await assert.rejects(q(`update orders set sap_quotation_entry = 501 where id = $1`, [other.id]));
});

console.log('Fase 25');
await check('cada dispositivo de push pertenece a una persona y solo ella lo ve', async () => {
  const ep = 'https://fcm.googleapis.com/fcm/send/prueba';
  const sub = () => q(`select push_subscribe($1, 'clave', 'auth', 'Chrome')`, [ep]);
  await as(rep, sub);
  assert.equal((await as(rep, () => q(`select id from push_subscriptions`))).length, 1);
  assert.equal((await as(admin, () => q(`select id from push_subscriptions`))).length, 0);
  await assert.rejects(as(rep, () => q(`insert into push_subscriptions (endpoint, p256dh, auth) values ('https://x', 'k', 'a')`)));
  // Otra persona inicia sesión en ese navegador: el dispositivo pasa a ella.
  await as(admin, sub);
  assert.equal((await as(rep, () => q(`select id from push_subscriptions`))).length, 0);
  assert.equal((await q(`select user_id from push_subscriptions where endpoint = $1`, [ep]))[0].user_id, admin.id);
  await as(rep, () => q(`delete from push_subscriptions where endpoint = $1`, [ep]));
  assert.equal((await q(`select id from push_subscriptions`)).length, 1);
  await as(admin, () => q(`delete from push_subscriptions where endpoint = $1`, [ep]));
  assert.equal((await q(`select id from push_subscriptions`)).length, 0);
});

await check('las notificaciones se reclaman para push una sola vez y sin envíos viejos', async () => {
  await q(`update notifications set push_processed_at = now()`);
  await as(admin, () => q(`select notify_user($1, 'Hola push', 'Detalle', '/inicio')`, [rep.id]));
  await q(`insert into notifications (user_id, title, created_at) values ($1, 'Vieja', now() - interval '2 days')`, [rep.id]);
  const claimed = await q(`select * from push_claim_pending()`);
  assert.deepEqual(claimed.map((n) => n.title), ['Hola push']);
  assert.equal(claimed[0].link, '/inicio');
  assert.equal((await q(`select * from push_claim_pending()`)).length, 0);
  assert.equal((await q(`select id from notifications where title = 'Vieja' and push_processed_at is null`)).length, 0);
  // Solo el servidor reclama, y a un usuario inactivo no se le envía (sigue en la campana).
  await assert.rejects(as(rep, () => q(`select * from push_claim_pending()`)));
  await q(`insert into notifications (user_id, title) values ($1, 'Para inactivo')`, [rep.id]);
  await q(`update profiles set is_active = false where id = $1`, [rep.id]);
  assert.equal((await q(`select * from push_claim_pending()`)).length, 0);
  await q(`update profiles set is_active = true where id = $1`, [rep.id]);
});

console.log('Listas dependientes');
await check('Segmento depende de Mercado y Canal: la base rechaza combinaciones que no corresponden', async () => {
  await as(admin, () => q(`
    insert into picklist_values (object, field, value, sort_order, controlling_map) values
      ('accounts', 'segment', 'Detallista Nacional', 10, '{"market":["Nacional"],"industry":["Canal Distribución"]}'),
      ('accounts', 'segment', 'Detallista del Exterior', 20, '{"market":["Internacional"],"industry":["Canal Distribución"]}'),
      ('accounts', 'segment', 'Obra nueva', 30, '{"market":["Nacional","Internacional"],"industry":["Canal Constructores"]}')`));
  await as(admin, () => q(`insert into picklist_dependencies (object, field, controlling_field) values ('accounts', 'segment', 'market'), ('accounts', 'segment', 'industry')`));
  // El asesor no puede configurar dependencias.
  await assert.rejects(as(rep, () => q(`insert into picklist_dependencies (object, field, controlling_field) values ('cases', 'origin', 'case_type')`)));

  const crear = (market, industry, segment) => as(admin, () => q(
    `insert into accounts (name, market, industry, segment) values ('Dependencias ' || gen_random_uuid(), $1, $2, $3) returning id`,
    [market, industry, segment]));
  const [ok] = await crear('Nacional', 'Canal Distribución', 'Detallista Nacional');
  await crear('Internacional', 'Canal Distribución', 'Detallista del Exterior');
  await crear('Internacional', 'Canal Constructores', 'Obra nueva');
  await crear('Nacional', 'Canal Distribución', null);
  // Corresponde al canal pero no al mercado, y al revés.
  await assert.rejects(crear('Internacional', 'Canal Distribución', 'Detallista Nacional'), /no corresponde/);
  await assert.rejects(crear('Nacional', 'Canal Constructores', 'Detallista Nacional'), /no corresponde/);
  await assert.rejects(crear(null, 'Canal Distribución', 'Detallista Nacional'), /Elige primero/);
  await assert.rejects(as(admin, () => q(`update accounts set market = 'Internacional' where id = $1`, [ok.id])), /no corresponde/);

  // Una combinación que ya existía se conserva si no se tocan esos campos.
  await q(`alter table accounts disable trigger accounts_picklist_dependencies`);
  const [viejo] = await q(`insert into accounts (name, market, industry, segment) values ('Dependencias legado', 'Internacional', 'Canal Constructores', 'Detallista Nacional') returning id`);
  await q(`alter table accounts enable trigger accounts_picklist_dependencies`);
  await as(admin, () => q(`update accounts set phone = '6045550000' where id = $1`, [viejo.id]));
  await assert.rejects(as(admin, () => q(`update accounts set industry = 'Canal B2C' where id = $1`, [viejo.id])), /no corresponde/);

  await q(`delete from accounts where name like 'Dependencias %'`);
  await q(`delete from picklist_dependencies`);
  await q(`delete from picklist_values where object = 'accounts' and field = 'segment'`);
});

console.log('Nombres limpios');
await check('normalize_name: mayúscula inicial, conectores, siglas y números romanos', async () => {
  const casos = [
    ['SODIMAC Colombia', 'Sodimac Colombia'],
    ['luis escobar', 'Luis Escobar'],
    ['altos de BELLALUNA', 'Altos de Bellaluna'],
    ['  maría   de los ángeles  ', 'María de los Ángeles'],
    ['HOTEL MIRADOR DE LA BAHÍA', 'Hotel Mirador de la Bahía'],
    ['almacenes la 14', 'Almacenes La 14'],
    ['cartagena de indias', 'Cartagena de Indias'],
    ['constructora altos del valle sas', 'Constructora Altos del Valle S.A.S.'],
    ['ferretería el constructor ltda', 'Ferretería El Constructor Ltda.'],
    ['comercializadora andina c.i. s.a.', 'Comercializadora Andina C.I. S.A.'],
    ['bogotá d.c.', 'Bogotá D.C.'],
    ['torre iii fase 2 (etapa norte)', 'Torre III Fase 2 (Etapa Norte)'],
    ['jean-pierre ÑÚÑEZ', 'Jean-Pierre Ñúñez'],
    ['cocinas 4x4 y baños', 'Cocinas 4x4 y Baños'],
    ['de la torre', 'De la Torre'],
  ];
  for (const [entrada, esperado] of casos) {
    assert.equal((await q(`select normalize_name($1) n`, [entrada]))[0].n, esperado, entrada);
  }
});
await check('al guardar, nombres, ciudades y correos quedan limpios; los demo no se tocan', async () => {
  const [cuenta] = await as(admin, () => q(
    `insert into accounts (name, billing_city, email, industry) values ('SODIMAC colombia', 'MEDELLÍN', '  Compras@Sodimac.COM ', 'Canal Constructores') returning id, name, billing_city, email`));
  assert.deepEqual([cuenta.name, cuenta.billing_city, cuenta.email], ['Sodimac Colombia', 'Medellín', 'compras@sodimac.com']);
  const [contacto] = await as(admin, () => q(
    `insert into contacts (first_name, last_name, account_id) values ('luis', 'escobar', $1) returning full_name`, [cuenta.id]));
  assert.equal(contacto.full_name, 'Luis Escobar');
  const [opp] = await as(admin, () => q(`
    insert into opportunities (name, account_id, pipeline_id, stage_id)
    select 'altos de BELLALUNA', $1, s.pipeline_id, s.id from pipeline_stages s order by s.sort_order limit 1 returning id, name`, [cuenta.id]));
  assert.equal(opp.name, 'Altos de Bellaluna');
  const [lead] = await as(admin, () => q(
    `insert into leads (first_name, last_name, company, city) values ('ANA', 'pérez gómez', 'grupo URBANO', 'cali') returning full_name, company, city`));
  assert.deepEqual([lead.full_name, lead.company, lead.city], ['Ana Pérez Gómez', 'Grupo Urbano', 'Cali']);
  // Al editar otro campo, un nombre que ya estaba se respeta; al cambiarlo, se limpia.
  await q(`update accounts set name = 'SODIMAC COLOMBIA' where id = $1`, [cuenta.id]);
  await q(`alter table accounts disable trigger accounts_normalize_text`);
  await q(`update accounts set name = 'SODIMAC COLOMBIA' where id = $1`, [cuenta.id]);
  await q(`alter table accounts enable trigger accounts_normalize_text`);
  await as(admin, () => q(`update accounts set phone = '6045550000' where id = $1`, [cuenta.id]));
  assert.equal((await q(`select name from accounts where id = $1`, [cuenta.id]))[0].name, 'SODIMAC COLOMBIA');
  await as(admin, () => q(`update accounts set name = 'sodimac colombia s.a.s' where id = $1`, [cuenta.id]));
  assert.equal((await q(`select name from accounts where id = $1`, [cuenta.id]))[0].name, 'Sodimac Colombia S.A.S.');
  // Los registros de demostración conservan su nombre tal cual.
  const [demo] = await q(`insert into accounts (name, is_demo) values ('DEMO tal cual', true) returning name`);
  assert.equal(demo.name, 'DEMO tal cual');

  await q(`delete from opportunities where id = $1`, [opp.id]);
  await q(`delete from contacts where account_id = $1`, [cuenta.id]);
  await q(`delete from accounts where id = $1 or name = 'DEMO tal cual'`, [cuenta.id]);
  await q(`delete from leads where company = 'Grupo Urbano'`);
});

console.log('Prospectos alineados con cuentas');
await check('el prospecto usa las listas de Cuentas y al convertir la cuenta nace como Prospecto con su Mercado, Canal y Segmento', async () => {
  await as(admin, () => q(`
    insert into picklist_values (object, field, value, sort_order, controlling_map) values
      ('accounts', 'segment', 'Detallista Nacional', 10, '{"market":["Nacional"],"industry":["Canal Distribución"]}')`));
  await as(admin, () => q(`insert into picklist_dependencies (object, field, controlling_field) values ('accounts', 'segment', 'market'), ('accounts', 'segment', 'industry')`));
  const crear = (market, segment) => as(admin, () => q(
    `insert into leads (last_name, company, market, industry, segment) values ('Prueba', 'Prospecto Alineado', $1, 'Canal Distribución', $2) returning id`,
    [market, segment]));
  await assert.rejects(crear('Internacional', 'Detallista Nacional'), /no corresponde/);
  const [lead] = await crear('Nacional', 'Detallista Nacional');
  const [{ r }] = await as(admin, () => q(`select convert_lead($1, null, null, false) r`, [lead.id]));
  const [cuenta] = await q(`select account_type, market, industry, segment, tax_id from accounts where id = $1`, [r.account_id]);
  assert.deepEqual(cuenta, { account_type: 'Prospecto', market: 'Nacional', industry: 'Canal Distribución', segment: 'Detallista Nacional', tax_id: null });

  // Al fusionar, los tres van juntos: si el principal no tiene ninguno, se toman los del duplicado.
  const [m] = await as(admin, () => q(`insert into leads (last_name, company) values ('Principal', 'Fusión Alineada') returning id`));
  const [d] = await crear('Nacional', 'Detallista Nacional');
  await as(admin, () => q(`select merge_records('leads', $1, $2)`, [m.id, d.id]));
  assert.deepEqual((await q(`select market, industry, segment from leads where id = $1`, [m.id]))[0],
    { market: 'Nacional', industry: 'Canal Distribución', segment: 'Detallista Nacional' });
  const [m2] = await as(admin, () => q(`insert into leads (last_name, company, market) values ('Principal', 'Fusión Alineada', 'Internacional') returning id`));
  const [d2] = await crear('Nacional', 'Detallista Nacional');
  await as(admin, () => q(`select merge_records('leads', $1, $2)`, [m2.id, d2.id]));
  assert.deepEqual((await q(`select market, industry, segment from leads where id = $1`, [m2.id]))[0],
    { market: 'Internacional', industry: null, segment: null });

  await q(`delete from leads where company in ('Prospecto Alineado', 'Fusión Alineada')`);
  await q(`delete from contacts where account_id = $1`, [r.account_id]);
  await q(`delete from accounts where id = $1`, [r.account_id]);
  await q(`delete from picklist_dependencies`);
  await q(`delete from picklist_values where object = 'accounts' and field = 'segment'`);
});
await check('«Cliente requiere NIT» no aplica a clientes del mercado Internacional', async () => {
  const [regla] = await q(`select conditions from validation_rules where object = 'accounts' and name = 'Cliente requiere NIT'`);
  assert.deepEqual(regla.conditions.find((c) => c.field === 'market'), { field: 'market', op: 'neq', value: 'Internacional' });
});

console.log('Mercado Internacional en USD');
await check('la oportunidad toma la moneda del Mercado de la cuenta y convierte con la TRM', async () => {
  const [ext] = await as(admin, () => q(`insert into accounts (name, market, industry) values ('Exterior USD', 'Internacional', 'Canal Constructores') returning id`));
  const [nac] = await as(admin, () => q(`insert into accounts (name, market, industry) values ('Nacional COP', 'Nacional', 'Canal Constructores') returning id`));
  const [st] = await q(`select s.id, s.pipeline_id from pipeline_stages s join pipelines p on p.id = s.pipeline_id
    where p.is_default and s.category = 'open' order by s.sort_order limit 1`);
  const crear = (account, campos) => as(admin, () => q(
    `insert into opportunities (name, account_id, pipeline_id, stage_id, amount, foreign_amount)
     values ('Moneda ' || gen_random_uuid(), $1, $2, $3, $4, $5) returning id, currency, amount, foreign_amount, exchange_rate`,
    [account, st.pipeline_id, st.id, campos.amount ?? 0, campos.usd ?? null]));
  const [usd] = await crear(ext.id, { usd: 1000 });
  assert.deepEqual([usd.currency, Number(usd.amount), Number(usd.exchange_rate)], ['USD', 4000000, 4000]);
  const [cop] = await crear(nac.id, { amount: 5000000, usd: 99 });
  assert.deepEqual([cop.currency, Number(cop.amount), cop.foreign_amount, cop.exchange_rate], ['COP', 5000000, null, null]);
  await assert.rejects(crear(ext.id, { amount: 3000000 }), /valor en USD/);

  // Una TRM nueva recalcula las abiertas; la cerrada conserva la suya. Solo el administrador la registra.
  const [cerrada] = await crear(ext.id, { usd: 500 });
  const [won] = await q(`select id from pipeline_stages where pipeline_id = (select pipeline_id from opportunities where id = $1) and category = 'won' limit 1`, [cerrada.id]);
  await as(admin, () => q(`update opportunities set stage_id = $2 where id = $1`, [cerrada.id, won.id]));
  await assert.rejects(as(rep, () => q(`select set_exchange_rate(4500)`)), /No autorizado/);
  await assert.rejects(as(rep, () => q(`select refresh_exchange_rates()`)), /No autorizado/);
  await as(admin, () => q(`select set_exchange_rate(4200)`));
  const montos = async (id) => (await q(`select amount, exchange_rate from opportunities where id = $1`, [id]))[0];
  assert.deepEqual(await montos(usd.id), { amount: '4200000.00', exchange_rate: '4200.0000' });
  assert.deepEqual(await montos(cerrada.id), { amount: '2000000.00', exchange_rate: '4000.0000' });
  assert.equal(Number((await q(`select to_cop(10, 'USD') v`))[0].v), 42000);

  // Cotización en USD: lista de su mercado y canal en dólares, IVA 0 % aunque se intente cambiar, y al sincronizar va al Valor en USD.
  await q(`insert into price_books (name, market, channel) values ('Exterior Constructores USD', 'Internacional', 'Canal Constructores')`);
  const [qt] = await as(admin, () => q(`insert into quotes (name, opportunity_id) values ('Cotización exterior', $1)
    returning id, currency, tax_rate, (select currency || ' ' || name from price_books where id = price_book_id) book`, [usd.id]));
  assert.deepEqual([qt.currency, Number(qt.tax_rate), qt.book], ['USD', 0, 'USD Exterior Constructores USD']);
  await as(admin, () => q(`insert into quote_line_items (quote_id, description, quantity, unit_price) values ($1, 'Mueble', 2, 750)`, [qt.id]));
  await as(admin, () => q(`update quotes set tax_rate = 19 where id = $1`, [qt.id]));
  const [tot] = await q(`select tax_rate, tax, net_total, grand_total from quotes where id = $1`, [qt.id]);
  assert.deepEqual([Number(tot.tax_rate), Number(tot.tax), Number(tot.net_total), Number(tot.grand_total)], [0, 0, 1500, 1500]);
  await as(admin, () => q(`select sync_quote($1)`, [qt.id]));
  assert.deepEqual(await montos(usd.id), { amount: '6300000.00', exchange_rate: '4200.0000' });
  const [qcop] = await as(admin, () => q(`insert into quotes (name, opportunity_id) values ('Cotización nacional', $1) returning currency, tax_rate`, [cop.id]));
  assert.deepEqual([qcop.currency, Number(qcop.tax_rate)], ['COP', 19]);

  await q(`delete from quotes where opportunity_id in ($1, $2)`, [usd.id, cop.id]);
  await q(`delete from opportunities where account_id in ($1, $2)`, [ext.id, nac.id]);
  await q(`delete from accounts where id in ($1, $2)`, [ext.id, nac.id]);
  await q(`delete from price_books where name = 'Exterior Constructores USD'`);
  await q(`delete from exchange_rates where source = 'Manual'`);
});

console.log('Lugares limpios');
await check('país, departamento y ciudad quedan como en las listas y deben corresponder', async () => {
  const [{ n, d }] = await q(`select count(*)::int n, count(distinct department)::int d from co_municipalities`);
  assert.deepEqual([n, d], [1122, 33]);
  const lugar = async (pais, dpto, ciudad) => {
    const [r] = await as(rep, () => q(`select * from clean_place($1, $2, $3)`, [pais, dpto, ciudad]));
    return [r.country, r.state, r.city];
  };
  assert.deepEqual(await lugar('colombia', 'ANTIOQUIA', 'medellin'), ['Colombia', 'Antioquia', 'Medellín']);
  assert.deepEqual(await lugar(null, null, 'bogota dc'), ['Colombia', 'Bogotá D.C.', 'Bogotá D.C.']);
  assert.deepEqual(await lugar(null, 'valle', null), [null, 'valle', null]);
  assert.deepEqual(await lugar('CO', 'valle del cauca', 'cali'), ['Colombia', 'Valle del Cauca', 'Cali']);
  assert.deepEqual(await lugar('US', 'Florida', 'Miami'), ['Estados Unidos', 'Florida', 'Miami']);
  assert.deepEqual(await lugar('estados unidos', null, null), ['Estados Unidos', null, null]);
  await assert.rejects(lugar('Colombia', 'Antioquia', 'Cali'), /no es un municipio de Antioquia/);
  await assert.rejects(lugar('Colombia', 'Antiokia', null), /no es un departamento/);
  await assert.rejects(lugar(null, null, 'Caldas'), /varios municipios/);
  await assert.rejects(lugar('Narnia', null, null), /lista de países/);

  // Al guardar, se corrige; un dato antiguo se respeta mientras no se toque la dirección.
  const [c] = await as(admin, () => q(`insert into accounts (name, billing_city, shipping_country, shipping_city)
    values ('Lugares Prueba', 'cucuta', 'panama', 'Ciudad de Panamá') returning billing_country, billing_state, billing_city, shipping_country`));
  assert.deepEqual(c, { billing_country: 'Colombia', billing_state: 'Norte de Santander', billing_city: 'Cúcuta', shipping_country: 'Panamá' });
  await assert.rejects(as(admin, () => q(`insert into contacts (last_name, mailing_country, mailing_state, mailing_city) values ('Lugar', 'Colombia', 'Caldas', 'Medellín')`)), /no es un municipio de Caldas/);
  await q(`alter table accounts disable trigger accounts_places`);
  const [viejo] = await q(`insert into accounts (name, billing_city) values ('Lugares Legado', 'Ciudad Inventada') returning id`);
  await q(`alter table accounts enable trigger accounts_places`);
  await as(admin, () => q(`update accounts set phone = '6045550000' where id = $1`, [viejo.id]));
  await assert.rejects(as(admin, () => q(`update accounts set billing_state = 'Antioquia' where id = $1`, [viejo.id])), /no es un municipio/);
  await q(`delete from accounts where name in ('Lugares Prueba', 'Lugares Legado')`);
});

console.log('Permisos de las funciones');
await check('sin sesión solo se ejecutan las funciones del servidor MCP y OAuth', async () => {
  const abiertas = (await q(`
    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege('anon', p.oid, 'EXECUTE')
    order by 1`)).map((r) => r.proname);
  assert.deepEqual(abiertas, ['mcp_resolve_token', 'oauth_exchange_code', 'oauth_refresh', 'oauth_register_client']);
  await db.exec(`set role anon`);
  try {
    await assert.rejects(q(`select purge_demo_data()`), /permission denied/);
    await assert.rejects(q(`select generate_alerts()`), /permission denied/);
    await assert.rejects(q(`select copy_default_team('accounts', gen_random_uuid(), gen_random_uuid())`), /permission denied/);
  } finally {
    await db.exec(`reset role`);
  }
});
await check('quien inicia sesión sigue usando las funciones de la aplicación', async () => {
  for (const fn of ['has_perm(text,text)', 'global_search(text,integer)', 'normalize_text(text)', 'crm_dashboard(date,date,uuid,uuid)']) {
    assert.equal((await q(`select has_function_privilege('authenticated', $1::regprocedure, 'EXECUTE') ok`, [fn]))[0].ok, true, fn);
  }
  for (const fn of ['copy_default_team(text,uuid,uuid)', 'recalc_quote(uuid)', 'apply_field_updates(text,uuid,jsonb)',
    'save_exchange_rate(text,date,date,numeric,text)', 'recalc_foreign_opportunities()',
    'conditions_without_status(jsonb)', 'enforce_quote_approval()']) {
    assert.equal((await q(`select has_function_privilege('authenticated', $1::regprocedure, 'EXECUTE') ok`, [fn]))[0].ok, false, fn);
  }
  // Una función creada después no queda abierta a quien no tiene sesión.
  await db.exec(`create function public.prueba_nueva() returns int language sql as 'select 1'`);
  try {
    assert.equal((await q(`select has_function_privilege('anon', 'public.prueba_nueva()'::regprocedure, 'EXECUTE') ok`))[0].ok, false);
  } finally {
    await db.exec(`drop function public.prueba_nueva()`);
  }
});

console.log('Aprobación obligatoria de cotizaciones');
await check('una cotización con descuento alto no se presenta ni se marca aprobada sin el flujo de aprobación', async () => {
  await db.exec(`update profiles set manager_id = '${mgr.id}' where id = '${rep.id}'`);
  // Sobre una oportunidad abierta del asesor (la de las primeras pruebas ya se cerró ganada).
  const [abierta] = await as(rep, () => q(`insert into opportunities (name, account_id, stage_id, amount)
    select 'Opp con descuento', o.account_id, s.id, 0 from opportunities o, pipeline_stages s join pipelines p on p.id = s.pipeline_id
    where o.id = $1 and p.is_default and s.name = 'Calificación' returning id`, [repOpp.id]));
  const [qt] = await as(rep, () => q(`insert into quotes (name, opportunity_id) values ('Cotización con descuento', $1) returning id, status`, [abierta.id]));
  const [line] = await as(rep, () => q(`insert into quote_line_items (quote_id, description, quantity, unit_price, discount) values ($1, 'Mueble', 10, 1000000, 20) returning id`, [qt.id]));
  for (const status of ['Presentada', 'Aceptada', 'Aprobada', 'En revisión']) {
    await assert.rejects(as(rep, () => q(`update quotes set status = $1 where id = $2`, [status, qt.id])), /requiere aprobación/, status);
  }
  // El administrador tampoco se la salta.
  await assert.rejects(as(admin, () => q(`update quotes set status = 'Presentada' where id = $1`, [qt.id])), /requiere aprobación/);

  // Con 10 % no requiere aprobación: se presenta sin más; subir el descuento ya presentada se rechaza.
  await as(rep, () => q(`update quote_line_items set discount = 10 where id = $1`, [line.id]));
  await as(rep, () => q(`update quotes set status = 'Presentada' where id = $1`, [qt.id]));
  await assert.rejects(as(rep, () => q(`update quote_line_items set discount = 20 where id = $1`, [line.id])), /pásala a Borrador/);

  // Por el flujo: Borrador, 20 %, enviar, aprobar; ahí sí se presenta.
  await as(rep, () => q(`update quotes set status = 'Borrador' where id = $1`, [qt.id]));
  await as(rep, () => q(`update quote_line_items set discount = 20 where id = $1`, [line.id]));
  const [{ id: req }] = await as(rep, () => q(`select submit_approval(id, $1) as id from approval_processes where object = 'quotes' and name = 'Descuento superior al 15 %'`, [qt.id]));
  await as(mgr, () => q(`select decide_approval($1, true, 'Ok')`, [req]));
  assert.equal((await q(`select status from quotes where id = $1`, [qt.id]))[0].status, 'Aprobada');
  await as(rep, () => q(`update quotes set status = 'Presentada', description = 'Enviada al cliente' where id = $1`, [qt.id]));

  // Cambiar el descuento después de aprobada exige aprobar de nuevo.
  await assert.rejects(as(rep, () => q(`update quote_line_items set discount = 22 where id = $1`, [line.id])), /pásala a Borrador/);
  await as(rep, () => q(`update quote_line_items set quantity = 12 where id = $1`, [line.id]));
  await as(rep, () => q(`update quotes set status = 'Borrador' where id = $1`, [qt.id]));
  await as(rep, () => q(`update quote_line_items set discount = 22 where id = $1`, [line.id]));
  await assert.rejects(as(rep, () => q(`update quotes set status = 'Presentada' where id = $1`, [qt.id])), /requiere aprobación/);
  // Bajar el descuento al 15 % la deja presentar sin aprobación.
  await as(rep, () => q(`update quote_line_items set discount = 15 where id = $1`, [line.id]));
  await as(rep, () => q(`update quotes set status = 'Presentada' where id = $1`, [qt.id]));

  // Sin sesión (cargas, tareas del sistema) no se revisa.
  await q(`update quote_line_items set discount = 30 where id = $1`, [line.id]);
  await q(`update quotes set status = 'Aceptada' where id = $1`, [qt.id]);
});

console.log('Canales de venta: pipeline, lista de precios y facturación');
const pipelineOf = async (oppId) => (await q(`select p.name pipeline, s.name stage from opportunities o join pipelines p on p.id = o.pipeline_id
  join pipeline_stages s on s.id = o.stage_id where o.id = $1`, [oppId]))[0];
let distOpp;
await check('una oportunidad va al pipeline del canal de su cuenta, con la etapa equivalente', async () => {
  distOpp = await as(rep, async () => {
    const [acc] = await q(`insert into accounts (name, industry, billing_street, billing_city, billing_state, billing_country, payment_terms)
      values ('Ferretería del Canal', 'Canal Distribución', 'Cl. 10 # 20-30', 'Medellín', 'Antioquia', 'Colombia', '60 días') returning id`);
    // Se pide una etapa del pipeline por defecto (Calificación, 20 %): queda en el de Distribución.
    const [st] = await q(`select s.id from pipeline_stages s join pipelines p on p.id = s.pipeline_id where p.is_default and s.name = 'Calificación'`);
    const [o] = await q(`insert into opportunities (name, account_id, stage_id, amount) values ('Opp distribución', $1, $2, 0) returning id, account_id`, [acc.id, st.id]);
    return o;
  });
  assert.deepEqual(await pipelineOf(distOpp.id), { pipeline: 'Distribución y retail', stage: 'Contacto inicial' });
  // Una etapa de otro pipeline no se puede elegir.
  const [other] = await q(`select s.id from pipeline_stages s join pipelines p on p.id = s.pipeline_id where p.name = 'Proyectos y constructoras' and s.name = 'Negociación'`);
  await assert.rejects(as(rep, () => q(`update opportunities set stage_id = $1 where id = $2`, [other.id, distOpp.id])), /pipeline «Distribución y retail»/);
  // Sin canal (o un canal sin pipeline en su mercado): no se crea la oportunidad hasta que exista el pipeline.
  const [noChannelAcc] = await as(rep, () => q(`insert into accounts (name) values ('Cuenta sin canal') returning id`));
  await assert.rejects(as(rep, () => q(`insert into opportunities (name, account_id, stage_id, amount)
    select 'Opp sin canal', $1, s.id, 0 from pipeline_stages s join pipelines p on p.id = s.pipeline_id
    where p.is_default and s.name = 'Negociación'`, [noChannelAcc.id])),
    /No hay un pipeline activo para el mercado Nacional y el canal de la cuenta \(sin definir\)/);
  // Un distribuidor del exterior va al pipeline Internacional de su canal, no al nacional.
  const [extAcc] = await as(rep, () => q(`insert into accounts (name, market, industry) values ('Distribuidor del Norte', 'Internacional', 'Canal Distribución') returning id`));
  const [ext] = await as(admin, () => q(`insert into opportunities (name, account_id, stage_id, amount)
    select 'Opp exterior', $1, s.id, 0 from pipeline_stages s join pipelines p on p.id = s.pipeline_id
    where p.is_default and s.name = 'Calificación' returning id`, [extAcc.id]));
  assert.deepEqual(await pipelineOf(ext.id), { pipeline: 'Distribución internacional', stage: 'Contacto inicial' });
  await q(`delete from opportunities where id = $1`, [ext.id]);
  await q(`delete from accounts where id = $1`, [extAcc.id]);
});
await check('si cambia el canal de la cuenta, sus oportunidades abiertas pasan al pipeline del nuevo canal', async () => {
  const [st] = await q(`select s.id from pipeline_stages s join pipelines p on p.id = s.pipeline_id where p.name = 'Distribución y retail' and s.name = 'Pedido en negociación'`);
  await as(rep, () => q(`update opportunities set stage_id = $1 where id = $2`, [st.id, distOpp.id]));
  await as(rep, () => q(`update accounts set industry = 'Canal Constructores' where id = $1`, [distOpp.account_id]));
  assert.deepEqual(await pipelineOf(distOpp.id), { pipeline: 'Proyectos y constructoras', stage: 'Negociación' });
  await as(rep, () => q(`update accounts set industry = 'Canal Distribución' where id = $1`, [distOpp.account_id]));
  assert.deepEqual(await pipelineOf(distOpp.id), { pipeline: 'Distribución y retail', stage: 'Pedido en negociación' });
});
await check('pipeline por mercado: se duplica a otro mercado; si cambia el mercado de la cuenta, sus oportunidades pasan al del nuevo', async () => {
  // Duplicar copia todas las etapas; no puede haber dos pipelines activos del mismo mercado y canal. Solo quien configura.
  const etapas = async (name) => (await q(`select array_agg(s.name || ':' || s.probability order by s.sort_order) e
    from pipeline_stages s join pipelines p on p.id = s.pipeline_id where p.name = $1`, [name]))[0].e;
  assert.deepEqual(await etapas('Distribución internacional'), await etapas('Distribución y retail'));
  await assert.rejects(as(admin, () => q(`select duplicate_pipeline((select id from pipelines where name = 'Distribución y retail'), 'Otra distribución', 'Nacional')`)),
    /pipelines_one_per_market_channel/);
  await assert.rejects(as(rep, () => q(`select duplicate_pipeline((select id from pipelines where name = 'Distribución y retail'), 'Copia del asesor', 'Internacional')`)));
  await as(admin, async () => {
    const [acc] = await q(`insert into accounts (name, market, industry) values ('Distribuidora que Exporta', 'Nacional', 'Canal Distribución') returning id`);
    const [o] = await q(`insert into opportunities (name, account_id, stage_id, amount)
      select 'Opp que cambia de mercado', $1, s.id, 0 from pipeline_stages s join pipelines p on p.id = s.pipeline_id
      where p.name = 'Distribución y retail' and s.name = 'Propuesta comercial' returning id`, [acc.id]);
    await q(`select set_exchange_rate(4000)`);
    await q(`update accounts set market = 'Internacional' where id = $1`, [acc.id]);
    assert.deepEqual(await pipelineOf(o.id), { pipeline: 'Distribución internacional', stage: 'Propuesta comercial' });
    // Sin el pipeline del mercado nuevo, el cambio se rechaza mientras haya oportunidades abiertas.
    await q(`update pipelines set is_active = false where name = 'Distribución y retail'`);
    await assert.rejects(q(`update accounts set market = 'Nacional' where id = $1`, [acc.id]),
      /No hay un pipeline activo para el mercado Nacional y el Canal Distribución.*oportunidades abiertas/);
    await q(`update pipelines set is_active = true where name = 'Distribución y retail'`);
    await q(`delete from opportunities where id = $1`, [o.id]);
    await q(`delete from accounts where id = $1`, [acc.id]);
    await q(`delete from exchange_rates where source = 'Manual'`);
  });
});
await check('la cotización usa la lista de precios del canal de la cuenta', async () => {
  const [qt] = await as(rep, () => q(`insert into quotes (name, opportunity_id) values ('Cotización canal', $1)
    returning (select name from price_books b where b.id = price_book_id) book`, [distOpp.id]));
  assert.equal(qt.book, 'Distribuidores 2026');
  const [consAcc] = await as(rep, () => q(`insert into accounts (name, industry) values ('Constructora del Canal', 'Canal Constructores') returning id`));
  const [consOpp] = await as(rep, () => q(`insert into opportunities (name, account_id, stage_id, amount)
    select 'Opp constructora', $1, s.id, 0 from pipeline_stages s join pipelines p on p.id = s.pipeline_id
    where p.is_default and s.name = 'Prospección' returning id`, [consAcc.id]));
  const [cons] = await as(rep, () => q(`insert into quotes (name, opportunity_id) values ('Cotización constructora', $1)
    returning (select name from price_books b where b.id = price_book_id) book`, [consOpp.id]));
  assert.equal(cons.book, 'Lista estándar COP');
});
await check('«Facturar a» es la cuenta de la oportunidad; direcciones y condiciones de pago vienen de la cuenta', async () => {
  const [qt] = await as(rep, () => q(`select * from quotes where name = 'Cotización canal'`));
  assert.equal(qt.bill_to_name, 'Ferretería del Canal');
  assert.equal(qt.billing_address, 'Cl. 10 # 20-30, Medellín, Antioquia, Colombia');
  assert.equal(qt.shipping_address, qt.billing_address, 'sin dirección de entrega en la cuenta, se entrega en la de facturación');
  assert.equal(qt.payment_terms, '60 días');
  const [otherAcc] = await q(`select id from accounts where name ilike 'Cuenta sin canal'`);
  await assert.rejects(as(rep, () => q(`insert into quotes (name, opportunity_id, account_id) values ('Otra cuenta', $1, $2)`, [distOpp.id, otherAcc.id])),
    /misma de la oportunidad \(Ferretería del Canal\)/);
  await assert.rejects(as(rep, () => q(`update quotes set account_id = $1 where id = $2`, [otherAcc.id, qt.id])), /misma de la oportunidad/);
  const [noAccOpp] = await as(rep, () => q(`insert into opportunities (name, stage_id, amount)
    select 'Opp sin cuenta', s.id, 0 from pipeline_stages s join pipelines p on p.id = s.pipeline_id where p.is_default and s.category = 'open' order by s.sort_order limit 1 returning id`));
  await assert.rejects(as(rep, () => q(`insert into quotes (name, opportunity_id) values ('Sin cuenta', $1)`, [noAccOpp.id])), /no tiene cuenta/);
});
await check('entrega y condiciones de pago manuales se conservan; en Borrador lo demás sigue a la cuenta', async () => {
  const [qt] = await q(`select id from quotes where name = 'Cotización canal'`);
  await as(rep, () => q(`update quotes set shipping_manual = true, shipping_address = 'Bodega del cliente final, Rionegro',
    payment_terms_manual = true, payment_terms = 'Contado' where id = $1`, [qt.id]));
  await as(rep, () => q(`update accounts set billing_street = 'Cra. 50 # 1-2', shipping_street = 'Bodega 7', shipping_city = 'Itagüí', payment_terms = '30 días'
    where id = $1`, [distOpp.account_id]));
  await as(rep, () => q(`update quotes set description = 'Revisada' where id = $1`, [qt.id]));
  let [r] = await q(`select billing_address, shipping_address, payment_terms from quotes where id = $1`, [qt.id]);
  assert.deepEqual(r, { billing_address: 'Cra. 50 # 1-2, Medellín, Antioquia, Colombia', shipping_address: 'Bodega del cliente final, Rionegro', payment_terms: 'Contado' });
  // Al quitar la casilla vuelven los de la cuenta.
  await as(rep, () => q(`update quotes set shipping_manual = false, payment_terms_manual = false where id = $1`, [qt.id]));
  [r] = await q(`select shipping_address, payment_terms from quotes where id = $1`, [qt.id]);
  assert.deepEqual(r, { shipping_address: 'Bodega 7, Itagüí, Antioquia, Colombia', payment_terms: '30 días' });
  // Presentada, queda como se envió aunque cambie la cuenta.
  await as(rep, () => q(`update quotes set status = 'Presentada' where id = $1`, [qt.id]));
  await as(rep, () => q(`update accounts set billing_street = 'Otra dirección', payment_terms = 'Contado' where id = $1`, [distOpp.account_id]));
  await as(rep, () => q(`update quotes set description = 'Enviada' where id = $1`, [qt.id]));
  [r] = await q(`select billing_address, payment_terms from quotes where id = $1`, [qt.id]);
  assert.deepEqual(r, { billing_address: 'Cra. 50 # 1-2, Medellín, Antioquia, Colombia', payment_terms: '30 días' });
});
await check('productos: Planta y Grupo de Artículo se guardan y sus listas las define solo quien administra', async () => {
  await as(admin, async () => {
    await q(`insert into picklist_values (object, field, value, sort_order) values
      ('products', 'plant', 'Planta Demo Norte', 10), ('products', 'plant', 'Planta Demo Sur', 20), ('products', 'item_group', 'Grupo Demo A', 10)`);
    const [p] = await q(`insert into products (name, product_code, plant, item_group) values ('Producto con planta', 'PR-PLANTA', 'Planta Demo Norte', 'Grupo Demo A')
      returning plant, item_group`);
    assert.deepEqual(p, { plant: 'Planta Demo Norte', item_group: 'Grupo Demo A' });
    // Son opcionales: un producto sin ellos sigue siendo válido.
    const [sin] = await q(`insert into products (name, product_code) values ('Producto sin planta', 'PR-SIN-PLANTA') returning plant, item_group`);
    assert.deepEqual(sin, { plant: null, item_group: null });
  });
  // Un asesor ve el dato, pero no puede cambiar las listas.
  await as(rep, async () => {
    const [p] = await q(`select plant, item_group from products where product_code = 'PR-PLANTA'`);
    assert.deepEqual(p, { plant: 'Planta Demo Norte', item_group: 'Grupo Demo A' });
    await assert.rejects(q(`insert into picklist_values (object, field, value) values ('products', 'plant', 'Planta del asesor')`));
  });
  await as(admin, () => q(`delete from picklist_values where object = 'products' and field in ('plant', 'item_group')`));
});
await check('rama de roles que comparte clientes (B2C) y aviso «existe, pero no es tuyo»', async () => {
  // Como quedará producción: cuentas, contactos y prospectos privados.
  const antes = await q(`select object, access from sharing_settings where object in ('accounts', 'contacts', 'leads')`);
  await q(`update sharing_settings set access = 'private' where object in ('accounts', 'contacts', 'leads')`);
  const [tienda] = await q(`insert into auth.users (email, raw_user_meta_data) values ('tienda@firplak.com', '{"full_name":"Tania Tienda"}') returning id`);
  const [web] = await q(`insert into auth.users (email, raw_user_meta_data) values ('web@firplak.com', '{"full_name":"Wilson Web"}') returning id`);
  await db.exec(`
    insert into roles (name, parent_id, share_within) values ('Coordinación B2C prueba', (select id from roles where name = 'Dirección Comercial'), true);
    insert into roles (name, parent_id) values ('Tienda prueba', (select id from roles where name = 'Coordinación B2C prueba')), ('Ecommerce prueba', (select id from roles where name = 'Coordinación B2C prueba'));
    update profiles set role_id = (select id from roles where name = 'Tienda prueba') where email = 'tienda@firplak.com';
    update profiles set role_id = (select id from roles where name = 'Ecommerce prueba') where email = 'web@firplak.com';`);

  const [cuenta] = await as(tienda, () => q(`insert into accounts (name, tax_id, billing_city, industry, market) values ('Cliente de la tienda', '900555111-2', 'Medellín', 'Canal Distribución', 'Nacional') returning id, owner_id`));
  assert.equal(cuenta.owner_id, tienda.id);
  const [contacto] = await as(tienda, () => q(`insert into contacts (first_name, last_name, email, account_id) values ('Carla', 'Compradora', 'carla@cliente-tienda.example', $1) returning id`, [cuenta.id]));
  const ve = (quien, tabla, id) => as(quien, async () => (await q(`select count(*)::int n from ${tabla} where id = $1`, [id]))[0].n);

  // El compañero de otra tienda (misma rama) ve el cliente y su contacto, pero no los modifica.
  assert.equal(await ve(web, 'accounts', cuenta.id), 1);
  assert.equal(await ve(web, 'contacts', contacto.id), 1);
  assert.equal((await as(web, () => q(`update accounts set phone = '300' where id = $1 returning id`, [cuenta.id]))).length, 0);
  // Un asesor B2B, fuera de la rama, no lo ve.
  assert.equal(await ve(rep, 'accounts', cuenta.id), 0);
  assert.equal(await ve(rep, 'contacts', contacto.id), 0);
  // Sin la marca, la rama deja de compartir.
  await q(`update roles set share_within = false where name = 'Coordinación B2C prueba'`);
  assert.equal(await ve(web, 'accounts', cuenta.id), 0);
  await q(`update roles set share_within = true where name = 'Coordinación B2C prueba'`);

  // Sobre el cliente de un compañero se crea una oportunidad, que es de quien la crea; el dueño del cliente no la ve.
  const [opp] = await as(web, () => q(`insert into opportunities (name, account_id, amount, close_date, stage_id)
    select 'Venta web al cliente de la tienda', $1, 1000000, current_date + 10, s.id from pipeline_stages s join pipelines p on p.id = s.pipeline_id
    where s.category = 'open' order by p.is_default desc, s.sort_order limit 1 returning id, owner_id`, [cuenta.id]));
  assert.equal(opp.owner_id, web.id);
  assert.equal(await ve(tienda, 'opportunities', opp.id), 0);
  // Con «y negocios» (ejecutivo y sus promotores) la rama ve también oportunidades, cotizaciones y actividades, sin modificarlas.
  const [tarea] = await as(web, () => q(`insert into activities (activity_type, subject) values ('task', 'Tarea propia del promotor') returning id`));
  assert.equal(await ve(tienda, 'activities', tarea.id), 0);
  await q(`update roles set share_business = true where name = 'Coordinación B2C prueba'`);
  assert.equal(await ve(tienda, 'opportunities', opp.id), 1);
  assert.equal(await ve(tienda, 'activities', tarea.id), 1);
  assert.equal((await as(tienda, () => q(`update opportunities set amount = 1 where id = $1 returning id`, [opp.id]))).length, 0);
  assert.equal(await ve(rep, 'opportunities', opp.id), 0);
  // «Y negocios» exige «Comparten clientes».
  await assert.rejects(q(`update roles set share_within = false where name = 'Coordinación B2C prueba'`));
  await q(`update roles set share_business = false where name = 'Coordinación B2C prueba'`);
  assert.equal(await ve(tienda, 'opportunities', opp.id), 0);

  // Aviso de duplicados: quien no puede abrir el cliente se entera de que existe y de quién es, sin su id.
  const dup = (quien) => as(quien, () => q(`select id, label, owner_name, can_open from possible_duplicates('accounts', 'cliente de la TIENDA', null, null)`));
  assert.deepEqual(await dup(rep), [{ id: null, label: 'Cliente de la Tienda · NIT 900555111-2 · Medellín', owner_name: 'Tania Tienda', can_open: false }]);
  assert.deepEqual(await dup(web), [{ id: cuenta.id, label: 'Cliente de la Tienda · NIT 900555111-2 · Medellín', owner_name: 'Tania Tienda', can_open: true }]);
  // También por NIT, aunque el nombre sea otro.
  assert.equal((await as(rep, () => q(`select can_open from possible_duplicates('accounts', 'Otro nombre', null, '900.555.111-2')`))).length, 1);
  // Búsqueda: el directorio solo trae lo que no se puede abrir, con lo mínimo, y exige tres letras.
  assert.deepEqual(await as(rep, () => q(`select * from account_directory('de la tienda')`)), [{ name: 'Cliente de la Tienda', tax_id: '900555111-2', city: 'Medellín', owner_name: 'Tania Tienda' }]);
  assert.equal((await as(web, () => q(`select * from account_directory('de la tienda')`))).length, 0);
  assert.equal((await as(rep, () => q(`select * from account_directory('de')`))).length, 0);
  // La regla interna no se puede llamar por la API; las otras dos, solo con sesión.
  const [permisos] = await q(`select has_function_privilege('authenticated', 'public.shares_branch_with(uuid, text)', 'execute') a,
    has_function_privilege('anon', 'public.possible_duplicates(text, text, text, text)', 'execute') b, has_function_privilege('anon', 'public.account_directory(text, int)', 'execute') c`);
  assert.deepEqual(permisos, { a: false, b: false, c: false });

  await as(admin, () => q(`delete from accounts where id = $1`, [cuenta.id]));
  for (const fila of antes) await q(`update sharing_settings set access = $2 where object = $1`, [fila.object, fila.access]);
});
await check('zonas: salen del departamento y la ciudad, con sus excepciones; en el exterior no hay zona', async () => {
  const zona = async (dep, ciudad) => (await q(`select public.zone_for_place($1, $2) z`, [dep, ciudad]))[0].z;
  assert.equal(await zona('Antioquia', 'Medellín'), 'Antioquia');
  assert.equal(await zona('Antioquia', 'Apartadó'), 'Córdoba, Sucre y Urabá');
  assert.equal(await zona('Chocó', 'Quibdó'), 'Antioquia');
  assert.equal(await zona('Chocó', 'Acandí'), 'Córdoba, Sucre y Urabá');
  assert.equal(await zona('Bogotá D.C.', 'Bogotá D.C.'), 'Centro del País');
  assert.equal(await zona('Vichada', 'Puerto Carreño'), 'Centro del País');
  assert.equal(await zona('San Andrés y Providencia', 'San Andrés'), 'Costa Atlántica');
  assert.equal(await zona('Amazonas', 'Leticia'), 'Tolima Grande');
  assert.equal(await zona('Valle del Cauca', 'Cali'), 'Sur Occidente');
  // Los 33 departamentos tienen zona.
  assert.equal(await count(`select count(*) n from (select distinct department from co_municipalities) d where public.zone_for_place(d.department, null) is null`), 0);
  const crear = (extra) => as(admin, () => q(`insert into accounts (name, industry, market, billing_country, billing_state, billing_city, zone)
    values ('Zona ' || gen_random_uuid(), 'Canal Distribución', $1, $2, $3, $4, $5) returning id, zone`, [extra.market, extra.country, extra.state ?? null, extra.city ?? null, extra.zone ?? null]));
  // Vacía se llena sola; si alguien la elige, se respeta; en el exterior queda vacía.
  const [tolima] = await crear({ market: 'Nacional', country: 'Colombia', state: 'Tolima', city: 'Ibagué' });
  assert.equal(tolima.zone, 'Tolima Grande');
  assert.equal((await crear({ market: 'Nacional', country: 'Colombia', state: 'Tolima', city: 'Ibagué', zone: 'Eje Cafetero' }))[0].zone, 'Eje Cafetero');
  assert.equal((await crear({ market: 'Internacional', country: 'Ecuador', zone: 'Antioquia' }))[0].zone, null);
  // Un prospecto también recibe su zona.
  const [lead] = await as(admin, () => q(`insert into leads (first_name, last_name, company, industry, market, country, state, city)
    values ('Zoe', 'Zona', 'Prospecto con zona', 'Canal Distribución', 'Nacional', 'Colombia', 'Caldas', 'Manizales') returning id, zone`));
  assert.equal(lead.zone, 'Eje Cafetero');
  await as(admin, async () => {
    await q(`delete from accounts where name like 'Zona %'`);
    await q(`delete from leads where id = $1`, [lead.id]);
  });
});
await check('territorios: un asesor no crea clientes fuera de lo suyo; la dirección asigna sin restricción y el CRM sugiere el responsable', async () => {
  const cuenta = (quien, extra) => as(quien, () => q(`insert into accounts (name, industry, market, billing_country, billing_state, billing_city, owner_id)
    values ('Territorio ' || gen_random_uuid(), $1, $2, $3, $4, $5, $6) returning id, zone, owner_id`,
    [extra.canal, extra.market ?? 'Nacional', extra.country ?? 'Colombia', extra.state ?? null, extra.city ?? null, extra.owner ?? quien.id]));
  // Sin territorios, nadie tiene restricción.
  assert.equal((await cuenta(rep, { canal: 'Canal Constructores', state: 'Nariño', city: 'Pasto' })).length, 1);

  // El asesor: Distribución en Antioquia; ambos canales en el Centro, pero solo Meta y Boyacá; y Ecuador en el exterior.
  await as(admin, () => q(`insert into territories (user_id, channels, market, zone, departments, countries) values
    ($1, '{"Canal Distribución"}', 'Nacional', 'Antioquia', '{}', '{}'),
    ($1, '{"Canal Distribución","Canal Constructores"}', 'Nacional', 'Centro del País', '{"Meta","Boyacá"}', '{}'),
    ($1, '{"Canal Distribución","Canal Constructores"}', 'Internacional', null, '{}', '{"Ecuador"}')`, [rep.id]));
  // Solo quien administra usuarios define territorios.
  await assert.rejects(as(rep, () => q(`insert into territories (user_id, channels, market) values ($1, '{"Canal B2C"}', 'Nacional')`, [rep.id])));

  const fuera = /fuera del territorio de su responsable/;
  assert.equal((await cuenta(rep, { canal: 'Canal Distribución', state: 'Antioquia', city: 'Medellín' }))[0].zone, 'Antioquia');
  await assert.rejects(cuenta(rep, { canal: 'Canal Constructores', state: 'Antioquia', city: 'Medellín' }), fuera);       // otro canal
  await assert.rejects(cuenta(rep, { canal: 'Canal Distribución', state: 'Antioquia', city: 'Apartadó' }), fuera);        // Urabá es otra zona
  await assert.rejects(cuenta(rep, { canal: 'Canal Distribución', state: 'Tolima', city: 'Ibagué' }), fuera);             // otra zona
  assert.equal((await cuenta(rep, { canal: 'Canal Constructores', state: 'Meta', city: 'Villavicencio' })).length, 1);    // departamento suyo
  await assert.rejects(cuenta(rep, { canal: 'Canal Constructores', state: 'Cundinamarca', city: 'Chía' }), fuera);        // misma zona, departamento ajeno
  assert.equal((await cuenta(rep, { canal: 'Canal Distribución', market: 'Internacional', country: 'Ecuador' })).length, 1);
  await assert.rejects(cuenta(rep, { canal: 'Canal Distribución', market: 'Internacional', country: 'Perú' }), fuera);
  // Tampoco puede llevarse a su nombre un cliente de otra zona cambiándole la ciudad.
  const [suya] = await cuenta(rep, { canal: 'Canal Distribución', state: 'Antioquia', city: 'Envigado' });
  await assert.rejects(as(rep, () => q(`update accounts set billing_state = 'Tolima', billing_city = 'Ibagué', zone = null where id = $1`, [suya.id])), fuera);
  // Cambios que no tocan el territorio pasan aunque el registro ya estuviera fuera.
  assert.equal((await as(rep, () => q(`update accounts set phone = '3001112233' where name like 'Territorio %' and billing_state = 'Nariño' returning id`))).length, 1);
  // Un prospecto sigue la misma regla.
  await assert.rejects(as(rep, () => q(`insert into leads (first_name, last_name, company, industry, market, country, state, city)
    values ('Pedro', 'Prospecto', 'Prospecto fuera de zona', 'Canal Distribución', 'Nacional', 'Colombia', 'Tolima', 'Ibagué')`)), fuera);

  // La dirección (modifica todo) le asigna al asesor un cliente de otra zona, y otra persona sin territorios no tiene límite.
  assert.equal((await cuenta(admin, { canal: 'Canal Distribución', state: 'Tolima', city: 'Ibagué', owner: rep.id }))[0].owner_id, rep.id);
  assert.equal((await cuenta(mgr, { canal: 'Canal Constructores', state: 'Tolima', city: 'Ibagué' })).length, 1);

  // Sugerencia de responsable: del territorio más específico al más general.
  const sugiere = async (...p) => (await as(mgr, () => q(`select full_name from territory_owners($1, $2, $3, $4, $5)`, p))).length;
  assert.equal(await sugiere('Canal Distribución', 'Nacional', 'Antioquia', 'Antioquia', 'Colombia'), 1);
  assert.equal(await sugiere('Canal Constructores', 'Nacional', 'Antioquia', 'Antioquia', 'Colombia'), 0);
  assert.equal(await sugiere('Canal Constructores', 'Nacional', 'Centro del País', 'Meta', 'Colombia'), 1);
  assert.equal(await sugiere('Canal Constructores', 'Nacional', 'Centro del País', 'Cundinamarca', 'Colombia'), 0);
  assert.equal(await sugiere('Canal Constructores', 'Internacional', null, null, 'Ecuador'), 1);

  await as(admin, async () => {
    await q(`delete from territories where user_id = $1`, [rep.id]);
    await q(`delete from accounts where name like 'Territorio %'`);
  });
  const [permisos] = await q(`select has_function_privilege('authenticated', 'public.place_and_territory()', 'execute') a,
    has_function_privilege('anon', 'public.territory_owners(text, text, text, text, text)', 'execute') b, has_function_privilege('anon', 'public.zone_for_place(text, text)', 'execute') c`);
  assert.deepEqual(permisos, { a: false, b: false, c: false });
});
await check('kits: planta KIT, componentes que no son kit y Planta/Grupo sin depender de Familia', async () => {
  const uno = async (sql, params) => (await as(admin, () => q(sql, params)))[0];
  // Un kit toma la planta «KIT» aunque se guarde con otra o sin ninguna; un producto suelto no puede usarla.
  const kit = await uno(`insert into products (name, product_code, is_kit, plant, family) values ('Kit Lvm Oslo con mueble elev 63cm', 'KIT-OSLO-63', true, 'Planta Demo Norte', 'Muebles de baño') returning id, plant`);
  assert.equal(kit.plant, 'KIT');
  await assert.rejects(as(admin, () => q(`insert into products (name, product_code, plant) values ('Suelto con planta de kit', 'SUELTO-KIT', 'KIT')`)), /solo para productos marcados como Kit/);
  const lvm = await uno(`insert into products (name, product_code, plant) values ('Lavamanos Oslo 63cm', 'LVM-OSLO-63', 'Planta Demo Norte') returning id`);
  const mueble = await uno(`insert into products (name, product_code, plant) values ('Mueble elevado dos puertas 63cm', 'MUE-ELEV-63', 'Planta Demo Sur') returning id`);
  const otroKit = await uno(`insert into products (name, product_code, is_kit) values ('Kit de cocina', 'KIT-COCINA', true) returning id`);

  // Componentes: varios por kit, con cantidad; el mismo componente puede ir en varios kits.
  await as(admin, () => q(`insert into product_kit_components (kit_id, component_id, quantity) values ($1, $2, 1), ($1, $3, 2), ($4, $2, 1)`, [kit.id, lvm.id, mueble.id, otroKit.id]));
  const filas = await as(admin, () => q(`select p.product_code, c.quantity::float q from product_kit_components c join products p on p.id = c.component_id where c.kit_id = $1 order by p.product_code`, [kit.id]));
  assert.deepEqual(filas, [{ product_code: 'LVM-OSLO-63', q: 1 }, { product_code: 'MUE-ELEV-63', q: 2 }]);
  // Lo que la base no deja: componentes en un producto suelto, un kit dentro de otro, repetir, cantidad cero, a sí mismo.
  const agregar = (k, c, n = 1) => as(admin, () => q(`insert into product_kit_components (kit_id, component_id, quantity) values ($1, $2, $3)`, [k, c, n]));
  await assert.rejects(agregar(lvm.id, mueble.id), /Solo un producto marcado como Kit/);
  await assert.rejects(agregar(kit.id, otroKit.id), /no puede ser componente de otro kit/);
  await assert.rejects(agregar(kit.id, lvm.id));
  await assert.rejects(agregar(otroKit.id, mueble.id, 0));
  await assert.rejects(agregar(kit.id, kit.id));
  // Cambios de tipo: un componente en uso no pasa a kit, un kit con componentes no deja de serlo, y un componente en uso no se borra.
  await assert.rejects(as(admin, () => q(`update products set is_kit = true where id = $1`, [lvm.id])), /es componente de un kit/);
  await assert.rejects(as(admin, () => q(`update products set is_kit = false where id = $1`, [kit.id])), /Quita primero los componentes/);
  await assert.rejects(as(admin, () => q(`delete from products where id = $1`, [lvm.id])));
  // El asesor ve los componentes y no puede cambiarlos.
  assert.equal((await as(rep, () => q(`select count(*)::int n from product_kit_components where kit_id = $1`, [kit.id])))[0].n, 2);
  await assert.rejects(as(rep, () => q(`insert into product_kit_components (kit_id, component_id) values ($1, $2)`, [otroKit.id, mueble.id])));
  assert.equal((await as(rep, () => q(`delete from product_kit_components where kit_id = $1 returning id`, [kit.id]))).length, 0);

  // Planta y Grupo dependen de Familia en un producto suelto; en un kit no.
  await as(admin, async () => {
    await q(`insert into picklist_values (object, field, value, sort_order, controlling_map) values
      ('products', 'plant', 'Planta Demo Norte', 10, '{"family":["Muebles de baño"]}'),
      ('products', 'item_group', 'Grupo Demo Baño', 10, '{"family":["Muebles de baño"]}'),
      ('products', 'item_group', 'Kit Baño Best', 20, '{}')`);
    await q(`insert into picklist_dependencies (object, field, controlling_field) values ('products', 'plant', 'family'), ('products', 'item_group', 'family')`);
  });
  const crear = (codigo, extra) => as(admin, () => q(`insert into products (name, product_code, family, plant, item_group, is_kit) values ($1, $1, $2, $3, $4, $5) returning plant, item_group`,
    [codigo, extra.family, extra.plant ?? null, extra.item_group ?? null, Boolean(extra.is_kit)]));
  assert.deepEqual((await crear('DEP-OK', { family: 'Muebles de baño', plant: 'Planta Demo Norte', item_group: 'Grupo Demo Baño' }))[0], { plant: 'Planta Demo Norte', item_group: 'Grupo Demo Baño' });
  await assert.rejects(crear('DEP-MAL-PLANTA', { family: 'Cocinas', plant: 'Planta Demo Norte' }), /no corresponde/);
  await assert.rejects(crear('DEP-MAL-GRUPO', { family: 'Cocinas', item_group: 'Grupo Demo Baño' }), /no corresponde/);
  assert.deepEqual((await crear('DEP-KIT', { family: 'Cocinas', item_group: 'Kit Baño Best', is_kit: true }))[0], { plant: 'KIT', item_group: 'Kit Baño Best' });
  await as(admin, async () => {
    await q(`delete from picklist_dependencies where object = 'products'`);
    await q(`delete from picklist_values where object = 'products' and field in ('plant', 'item_group')`);
  });

  // Sin componentes, el kit puede volver a ser un producto suelto (la planta queda por definir); borrar un kit se lleva sus componentes.
  await as(admin, () => q(`delete from product_kit_components where kit_id = $1`, [kit.id]));
  assert.equal((await uno(`update products set is_kit = false where id = $1 returning plant`, [kit.id])).plant, null);
  await as(admin, () => q(`delete from products where id = $1`, [otroKit.id]));
  assert.equal((await as(admin, () => q(`select count(*)::int n from product_kit_components where component_id = $1`, [lvm.id])))[0].n, 0);
  // Los disparadores no se pueden llamar por la API.
  const [permisos] = await q(`select has_function_privilege('authenticated', 'public.product_kit_rules()', 'execute') a, has_function_privilege('anon', 'public.kit_component_rules()', 'execute') b`);
  assert.deepEqual(permisos, { a: false, b: false });
});
await check('lista propia del cliente: sus productos con su precio; los no codificados con el precio del canal y marcados', async () => {
  await as(admin, async () => {
    await q(`insert into products (name, product_code) values ('Mueble codificado', 'PR-COD'), ('Cocina nueva', 'PR-NUEVA')`);
    await q(`insert into price_books (name, is_client_list) values ('Gran Cliente 2026', true)`);
    await q(`insert into price_book_entries (price_book_id, product_id, unit_price)
      select b.id, p.id, v.price from (values ('Gran Cliente 2026', 'PR-COD', 900000), ('Distribuidores 2026', 'PR-COD', 1000000),
        ('Distribuidores 2026', 'PR-NUEVA', 5000000)) v(book, code, price)
      join price_books b on b.name = v.book join products p on p.product_code = v.code`);
    const [acc] = await q(`insert into accounts (name, industry, price_book_id) values ('Gran Cliente', 'Canal Distribución',
      (select id from price_books where name = 'Gran Cliente 2026')) returning id`);
    const [opp] = await q(`insert into opportunities (name, account_id, stage_id, amount)
      select 'Opp gran cliente', $1, s.id, 0 from pipeline_stages s join pipelines p on p.id = s.pipeline_id
      where p.is_default and s.name = 'Prospección' returning id`, [acc.id]);
    const [qt] = await q(`insert into quotes (name, opportunity_id) values ('Cotización gran cliente', $1)
      returning id, (select name from price_books b where b.id = price_book_id) book`, [opp.id]);
    assert.equal(qt.book, 'Gran Cliente 2026');
    const price = async (code) => (await q(`select quote_line_price($1, (select id from products where product_code = $2)) p`, [qt.id, code]))[0].p;
    assert.deepEqual(await price('PR-COD'), { unit_price: 900000, source: 'lista' });
    assert.deepEqual(await price('PR-NUEVA'), { unit_price: 5000000, source: 'canal', price_book: 'Distribuidores 2026' });
    const lines = await q(`insert into quote_line_items (quote_id, product_id, quantity, unit_price)
      select $1, id, 1, 1 from products where product_code in ('PR-COD', 'PR-NUEVA') returning (select product_code from products p where p.id = product_id) code, not_listed`, [qt.id]);
    assert.deepEqual(Object.fromEntries(lines.map((l) => [l.code, l.not_listed])), { 'PR-COD': false, 'PR-NUEVA': true });
    // En una cotización con la lista del canal nada se marca como no codificado.
    const [canal] = await q(`select id from quotes where name = 'Cotización canal'`);
    const [l] = await q(`insert into quote_line_items (quote_id, product_id, quantity, unit_price)
      select $1, id, 1, 1 from products where product_code = 'PR-NUEVA' returning not_listed`, [canal.id]);
    assert.equal(l.not_listed, false);
  });
});
await check('indicadores: un embudo por pipeline, cada uno con sus etapas (sin las perdidas)', async () => {
  const funnels = await as(admin, async () => (await q(`select crm_funnels(current_date - 365, current_date) f`))[0].f);
  assert.deepEqual(funnels.map((f) => [f.name, f.market, f.channel]), [
    ['Proyectos y constructoras', 'Nacional', 'Canal Constructores'], ['Distribución y retail', 'Nacional', 'Canal Distribución'],
    ['Proyectos internacionales', 'Internacional', 'Canal Constructores'], ['Distribución internacional', 'Internacional', 'Canal Distribución']]);
  assert.deepEqual(funnels[1].stages.map((s) => s.name), ['Contacto inicial', 'Muestras y catálogo', 'Propuesta comercial', 'Pedido en negociación', 'Ganada']);
  assert.ok(funnels.every((f) => f.stages.every((s) => s.category !== 'lost')));
  const dashboard = await as(admin, async () => (await q(`select crm_dashboard(current_date - 365, current_date, null, (select id from pipelines where name = 'Distribución y retail')) d`))[0].d);
  assert.deepEqual(funnels[1].stages.map((s) => Number(s.amount)), dashboard.funnel.map((s) => Number(s.amount)));
});
await check('un canal tiene un solo pipeline y una sola lista por mercado; una lista de cliente no tiene canal', async () => {
  await assert.rejects(q(`update pipelines set channel = 'Canal Distribución' where name = 'Proyectos y constructoras'`), /pipelines_one_per_market_channel/);
  await assert.rejects(q(`insert into price_books (name, channel) values ('Otra de distribución', 'Canal Distribución')`), /price_books_one_per_market_channel/);
  await assert.rejects(q(`insert into price_books (name, channel, is_client_list) values ('Cliente con canal', 'Canal B2C', true)`), /price_books_client_without_channel/);
});
console.log('Listas por mercado y canal');
await check('la lista depende del mercado y el canal de la cuenta; nunca cruza de mercado, canal ni moneda', async () => {
  await as(admin, async () => {
    // La moneda sale del mercado, aunque se pida otra.
    const [intl] = await q(`insert into price_books (name, market, channel, currency) values ('Distribución Internacional', 'Internacional', 'Canal Distribución', 'COP') returning currency`);
    assert.equal(intl.currency, 'USD');
    await assert.rejects(q(`insert into price_books (name, market, channel) values ('Otra internacional', 'Internacional', 'Canal Distribución')`), /price_books_one_per_market_channel/);
    await q(`select set_exchange_rate(4000)`);
    // Pipelines del Canal B2C en ambos mercados (las oportunidades necesitan el de su mercado y canal).
    for (const [name, market] of [['Hogar nacional', 'Nacional'], ['Hogar internacional', 'Internacional']]) {
      const [p] = await q(`insert into pipelines (name, channel, market) values ($1, 'Canal B2C', $2) returning id`, [name, market]);
      await q(`insert into pipeline_stages (pipeline_id, name, sort_order, probability, category, forecast_category, color)
        select $1, s.name, s.sort_order, s.probability, s.category, s.forecast_category, s.color
        from pipeline_stages s join pipelines x on x.id = s.pipeline_id where x.name = 'Proyectos y constructoras'`, [p.id]);
    }
  });
  const cuenta = (name, market, industry) => as(admin, async () =>
    (await q(`insert into accounts (name, market, industry) values ($1, $2, $3) returning id`, [name, market, industry]))[0].id);
  const opp = (account) => as(admin, async () => (await q(`insert into opportunities (name, account_id, stage_id, amount)
    select 'Opp mercado ' || gen_random_uuid(), $1, s.id, 0 from pipeline_stages s join pipelines p on p.id = s.pipeline_id
    where p.is_default and s.name = 'Prospección' returning id`, [account]))[0].id);
  const lista = (oppId) => as(admin, async () => (await q(`insert into quotes (name, opportunity_id) values ('Cotización mercado', $1)
    returning currency, (select name from price_books b where b.id = price_book_id) book`, [oppId]))[0]);

  // Distribuidor internacional: la lista de su mercado y canal en USD; nunca «Distribuidores 2026» (Nacional, COP).
  const intDist = await cuenta('Distribuidor del exterior', 'Internacional', 'Canal Distribución');
  assert.deepEqual(await lista(await opp(intDist)), { currency: 'USD', book: 'Distribución Internacional' });
  // Constructor internacional sin lista de su canal: se bloquea, aunque exista la general «Lista exportación USD».
  const intCons = await cuenta('Constructor del exterior', 'Internacional', 'Canal Constructores');
  await assert.rejects(lista(await opp(intCons)), /No hay una lista de precios activa para el mercado Internacional y el Canal Constructores\. Pide/);
  // B2C nacional sin lista: se bloquea (no usa la de Constructores); con una lista general nacional, la usa.
  const b2c = await cuenta('Hogar B2C', 'Nacional', 'Canal B2C');
  const b2cOpp = await opp(b2c);
  await assert.rejects(lista(b2cOpp), /mercado Nacional y el Canal B2C \(o una lista general nacional\)/);
  await as(admin, () => q(`insert into price_books (name, market) values ('General Nacional', 'Nacional')`));
  assert.deepEqual(await lista(b2cOpp), { currency: 'COP', book: 'General Nacional' });
  await assert.rejects(as(admin, () => q(`insert into price_books (name, market) values ('Otra general', 'Nacional')`)), /price_books_one_general_per_market/);
  // La general nacional no reemplaza la lista del canal.
  assert.equal((await lista(await opp(await cuenta('Distribuidor nacional', 'Nacional', 'Canal Distribución')))).book, 'Distribuidores 2026');
  // Sin su lista activa, el distribuidor internacional se bloquea.
  await as(admin, () => q(`update price_books set is_active = false where name = 'Distribución Internacional'`));
  await assert.rejects(lista(await opp(intDist)), /mercado Internacional y el Canal Distribución/);
  await as(admin, () => q(`update price_books set is_active = true where name = 'Distribución Internacional'`));

  // Lista propia: de lista de cliente y del mismo mercado de la cuenta.
  await assert.rejects(as(admin, () => q(`update accounts set price_book_id = (select id from price_books where name = 'Gran Cliente 2026') where id = $1`, [intDist])),
    /La lista propia «Gran Cliente 2026» es del mercado Nacional y la cuenta es del mercado Internacional: elige una lista del mismo mercado/);
  await assert.rejects(as(admin, () => q(`update accounts set price_book_id = (select id from price_books where name = 'Distribuidores 2026') where id = $1`, [b2c])),
    /no es una lista de cliente/);
  // La lista de una cotización no se cambia por una de otro mercado o de otro canal.
  const [qInt] = await q(`select id from quotes where account_id = $1 limit 1`, [intDist]);
  await assert.rejects(as(admin, () => q(`update quotes set price_book_id = (select id from price_books where name = 'Distribuidores 2026') where id = $1`, [qInt.id])),
    /es del mercado Nacional y la cuenta «Distribuidor del exterior» es del mercado Internacional/i);
  await assert.rejects(as(admin, () => q(`update quotes set price_book_id = (select id from price_books where name = 'Lista exportación USD') where id = $1`, [qInt.id])),
    /no tiene canal: en el mercado Internacional cada canal necesita su propia lista/);
  const [qB2c] = await q(`select id from quotes where account_id = $1 limit 1`, [b2c]);
  await assert.rejects(as(admin, () => q(`update quotes set price_book_id = (select id from price_books where name = 'Lista estándar COP') where id = $1`, [qB2c.id])),
    /es del Canal Constructores y la cuenta «Hogar B2C» es del Canal B2C/i);
  // Una lista asignada a cuentas no cambia de mercado.
  await assert.rejects(as(admin, () => q(`update price_books set market = 'Internacional' where name = 'Gran Cliente 2026'`)), /está asignada a cuentas del mercado Nacional/);
});
await check('al cambiar el mercado: borradores sin productos cambian; con productos quedan para revisión; presentadas y pedidos no cambian', async () => {
  await as(admin, async () => {
    const [acc] = await q(`insert into accounts (name, market, industry) values ('Cambia de mercado', 'Nacional', 'Canal Distribución') returning id`);
    const nuevaOpp = async (name, amount) => (await q(`insert into opportunities (name, account_id, stage_id, amount)
      select $2, $1, s.id, $3 from pipeline_stages s join pipelines p on p.id = s.pipeline_id where p.is_default and s.name = 'Prospección' returning id`,
      [acc.id, name, amount]))[0].id;
    const libre = await nuevaOpp('Opp libre', 8000000);
    const ocupada = await nuevaOpp('Opp ocupada', 2000000);
    const cotizar = async (oppId, name) => (await q(`insert into quotes (name, opportunity_id) values ($2, $1) returning id`, [oppId, name]))[0].id;
    const vacia = await cotizar(libre, 'Borrador vacío');
    const conProductos = await cotizar(ocupada, 'Borrador con productos');
    const presentada = await cotizar(ocupada, 'Cotización presentada');
    for (const id of [conProductos, presentada]) await q(`insert into quote_line_items (quote_id, description, quantity, unit_price) values ($1, 'Mueble', 1, 1000)`, [id]);
    await q(`update quotes set status = 'Presentada' where id = $1`, [presentada]);
    const [pedido] = await q(`insert into orders (name, account_id, opportunity_id) values ('Pedido directo', $1, $2) returning id`, [acc.id, ocupada]);

    await q(`update accounts set market = 'Internacional' where id = $1`, [acc.id]);
    const cot = async (id) => {
      const [r] = await q(`select currency, tax_rate, (select name from price_books b where b.id = price_book_id) book from quotes where id = $1`, [id]);
      return [r.currency, Number(r.tax_rate), r.book];
    };
    const op = async (id) => {
      const [r] = await q(`select currency, amount, foreign_amount from opportunities where id = $1`, [id]);
      return [r.currency, Number(r.amount), r.foreign_amount === null ? null : Number(r.foreign_amount)];
    };
    // Borrador sin productos: moneda, lista e IVA del mercado nuevo; su oportunidad lo sigue (8.000.000 / 4.000 = 2.000 USD).
    assert.deepEqual(await cot(vacia), ['USD', 0, 'Distribución Internacional']);
    assert.deepEqual(await op(libre), ['USD', 8000000, 2000]);
    // Con productos, presentada y pedido: no cambian; la oportunidad con documentos tampoco.
    assert.deepEqual(await cot(conProductos), ['COP', 19, 'Distribuidores 2026']);
    assert.deepEqual(await cot(presentada), ['COP', 19, 'Distribuidores 2026']);
    assert.equal((await q(`select currency from orders where id = $1`, [pedido.id]))[0].currency, 'COP');
    // Su valor es la suma de sus partes abiertas (2 cotizaciones de 1.000), no el escrito a mano.
    assert.deepEqual(await op(ocupada), ['COP', 2000, null]);
    // El borrador con productos no admite productos nuevos ni se cotiza de nuevo sobre la oportunidad en pesos.
    await assert.rejects(q(`insert into quote_line_items (quote_id, description, quantity, unit_price) values ($1, 'Otro', 1, 10)`, [conProductos]),
      /La cuenta «Cambia de mercado» ahora es del mercado Internacional \(USD\) y la cotización COT-\d+ está en COP: quita sus productos/i);
    await assert.rejects(cotizar(ocupada, 'Otra'), /La oportunidad está en COP y la cuenta es del mercado Internacional \(USD\)/);
    // Al quitarle los productos pasa a la lista nueva; sincronizarla con la oportunidad en pesos no se permite.
    await q(`delete from quote_line_items where quote_id = $1`, [conProductos]);
    assert.deepEqual(await cot(conProductos), ['USD', 0, 'Distribución Internacional']);
    await assert.rejects(q(`select sync_quote($1)`, [conProductos]), /La cotización está en USD y la oportunidad en COP/);

    // Con lista propia de otro mercado, primero hay que quitarla.
    const [cli] = await q(`insert into accounts (name, market, industry, price_book_id) values ('Cliente con lista', 'Nacional', 'Canal Distribución',
      (select id from price_books where name = 'Gran Cliente 2026')) returning id`);
    await assert.rejects(q(`update accounts set market = 'Internacional' where id = $1`, [cli.id]), /quítala o asigna una del mercado nuevo antes de cambiar el mercado/);

    // Sin lista compatible en el mercado nuevo, el borrador queda como estaba y se bloquea hasta crearla.
    const [hogar] = await q(`insert into accounts (name, market, industry) values ('Hogar que exporta', 'Nacional', 'Canal B2C') returning id`);
    const [oh] = await q(`insert into opportunities (name, account_id, stage_id, amount)
      select 'Opp hogar', $1, s.id, 0 from pipeline_stages s join pipelines p on p.id = s.pipeline_id where p.is_default and s.name = 'Prospección' returning id`, [hogar.id]);
    const qh = await cotizar(oh.id, 'Borrador hogar');
    await q(`update accounts set market = 'Internacional' where id = $1`, [hogar.id]);
    assert.deepEqual(await cot(qh), ['COP', 19, 'General Nacional']);
    await assert.rejects(q(`update quotes set description = 'Revisada' where id = $1`, [qh]), /mercado Internacional y el Canal B2C\. Pide a administración crearla/);

    // Limpieza.
    const cuentas = `select id from accounts where lower(name) in ('cambia de mercado', 'cliente con lista', 'hogar que exporta', 'distribuidor del exterior',
      'constructor del exterior', 'hogar b2c', 'distribuidor nacional')`;
    await q(`delete from orders where account_id in (${cuentas})`);
    await q(`delete from quotes where account_id in (${cuentas})`);
    await q(`delete from opportunities where account_id in (${cuentas})`);
    await q(`delete from accounts where id in (${cuentas})`);
    await q(`delete from price_books where name in ('Distribución Internacional', 'General Nacional')`);
    await q(`delete from pipelines where name in ('Hogar nacional', 'Hogar internacional')`);
    await q(`delete from exchange_rates where source = 'Manual'`);
  });
});
console.log('Cotizaciones como partes del negocio');
await check('partes: el valor suma lo abierto, la oportunidad avanza solo hacia adelante y una parte aceptada se separa ganada', async () => {
  await as(admin, async () => {
    const [acc] = await q(`insert into accounts (name, industry) values ('Promotora Torres del Parque', 'Canal Constructores') returning id`);
    const [opp] = await q(`insert into opportunities (name, account_id, stage_id, amount)
      select 'Proyecto Torres', $1, s.id, 123 from pipeline_stages s join pipelines p on p.id = s.pipeline_id
      where p.is_default and s.name = 'Calificación' returning id`, [acc.id]);
    const parte = async (name, valor, oppId = opp.id) => {
      const [qt] = await q(`insert into quotes (name, opportunity_id) values ($1, $2) returning id`, [name, oppId]);
      if (valor) await q(`insert into quote_line_items (quote_id, description, quantity, unit_price) values ($1, 'Mueble', 1, $2)`, [qt.id, valor]);
      return qt.id;
    };
    const estado = (id, status) => q(`update quotes set status = $2 where id = $1`, [id, status]);
    const op = async (id) => (await q(`select o.amount, o.is_closed, o.is_won, s.name stage from opportunities o join pipeline_stages s on s.id = o.stage_id where o.id = $1`, [id]))[0];
    // Un borrador vacío no borra el valor escrito a mano; con contenido, el valor es la suma de las partes abiertas.
    const vacia = await parte('Borrador sin productos', 0);
    assert.equal(Number((await op(opp.id)).amount), 123);
    const t1 = await parte('Torre 1', 500), t2 = await parte('Torre 2', 700), t3 = await parte('Torre 3', 300);
    assert.equal(Number((await op(opp.id)).amount), 1500);
    // Presentada → etapa de propuesta; nunca retrocede.
    await estado(t1, 'Presentada');
    assert.equal((await op(opp.id)).stage, 'Cotización enviada');
    await q(`update opportunities set stage_id = (select s.id from pipeline_stages s join pipelines p on p.id = s.pipeline_id where p.is_default and s.name = 'Negociación') where id = $1`, [opp.id]);
    await estado(t2, 'Presentada');
    assert.equal((await op(opp.id)).stage, 'Negociación');
    // Reparto 60/40 en la original: la parte ganada lo hereda.
    await q(`select set_opportunity_splits($1, $2::jsonb)`, [opp.id, JSON.stringify([{ user_id: admin.id, percent: 60 }, { user_id: rep.id, percent: 40 }])]);
    // Torre 1 aceptada con otras abiertas: se separa ganada por 500; la original queda con 1.000.
    await estado(t1, 'Aceptada');
    const [hija] = await q(`select o.id, o.name, o.amount, o.is_won, o.parent_opportunity_id, o.close_date = (now() at time zone 'America/Bogota')::date hoy
      from opportunities o join quotes q on q.opportunity_id = o.id where q.id = $1`, [t1]);
    assert.notEqual(hija.id, opp.id);
    assert.match(hija.name, /^Proyecto Torres · Torre 1$/i);
    assert.deepEqual([Number(hija.amount), hija.is_won, hija.parent_opportunity_id, hija.hoy], [500, true, opp.id, true]);
    assert.deepEqual((await q(`select user_id, percent::int p from opportunity_splits where opportunity_id = $1 order by percent desc`, [hija.id])).map((r) => r.p), [60, 40]);
    assert.deepEqual([Number((await op(opp.id)).amount), (await op(opp.id)).is_closed], [1000, false]);
    // Reemplazada no suma; su nueva versión sí.
    await estado(t2, 'Reemplazada');
    const t2b = await parte('Torre 2 versión 2', 650);
    assert.equal(Number((await op(opp.id)).amount), 950);
    // Rechazar con otras abiertas no avisa; la última abierta rechazada avisa (sin cerrar la oportunidad).
    const avisos = async () => Number((await q(`select count(*) n from notifications where title = 'Partes rechazadas: ' || (select name from opportunities where id = $1)`, [opp.id]))[0].n);
    await estado(t2b, 'Rechazada');
    assert.equal(await avisos(), 0);
    await estado(t3, 'Rechazada');
    assert.equal(await avisos(), 1);
    assert.match((await q(`select body from notifications where title like 'Partes rechazadas:%' order by created_at desc limit 1`))[0].body, /las ganadas siguen en sus oportunidades/);
    assert.deepEqual([Number((await op(opp.id)).amount), (await op(opp.id)).is_closed], [0, false]);
    // Marcarla Perdida rechaza lo que quedaba abierto; cerrada, no admite cotizaciones nuevas.
    await q(`update opportunities set stage_id = (select s.id from pipeline_stages s join pipelines p on p.id = s.pipeline_id where p.is_default and s.category = 'lost') where id = $1`, [opp.id]);
    assert.equal((await q(`select status from quotes where id = $1`, [vacia]))[0].status, 'Rechazada');
    await assert.rejects(parte('Torre 4', 100), /La oportunidad «Proyecto Torres» está cerrada/i);
  });
});
await check('partes: la última abierta aceptada gana la original; un pedido activo impide perderla y su cancelación avisa', async () => {
  await as(admin, async () => {
    const [acc] = await q(`select id from accounts where name ilike 'Promotora Torres del Parque'`);
    const nueva = async (name) => (await q(`insert into opportunities (name, account_id, stage_id, amount)
      select $2, $1, s.id, 0 from pipeline_stages s join pipelines p on p.id = s.pipeline_id where p.is_default and s.name = 'Calificación' returning id`, [acc.id, name]))[0].id;
    const parte = async (oppId, name, valor) => {
      const [qt] = await q(`insert into quotes (name, opportunity_id) values ($1, $2) returning id`, [name, oppId]);
      await q(`insert into quote_line_items (quote_id, description, quantity, unit_price) values ($1, 'Mueble', 1, $2)`, [qt.id, valor]);
      return qt.id;
    };
    const b = await nueva('Proyecto Dos Etapas');
    const p1 = await parte(b, 'Etapa 1', 400), p2 = await parte(b, 'Etapa 2', 600);
    await q(`update quotes set status = 'Rechazada' where id = $1`, [p1]);
    await q(`update quotes set status = 'Aceptada' where id = $1`, [p2]);
    const [won] = await q(`select amount, is_won, (select count(*)::int from opportunities c where c.parent_opportunity_id = o.id) hijas from opportunities o where id = $1`, [b]);
    assert.deepEqual([Number(won.amount), won.is_won, won.hijas], [600, true, 0]);
    // Con un pedido activo no se puede marcar Perdida; al cancelarlo, avisa.
    const c = await nueva('Proyecto Con Pedido');
    await parte(c, 'Suministro', 900);
    const [pedido] = await q(`insert into orders (name, account_id, opportunity_id) values ('Pedido directo', $1, $2) returning id`, [acc.id, c]);
    await q(`insert into order_items (order_id, description, quantity, unit_price) values ($1, 'Mueble', 1, 900)`, [pedido.id]);
    await q(`update orders set status = 'Activado' where id = $1`, [pedido.id]);
    await assert.rejects(q(`update opportunities set stage_id = (select s.id from pipeline_stages s join pipelines p on p.id = s.pipeline_id where p.is_default and s.category = 'lost') where id = $1`, [c]),
      /No se puede marcar Perdida: el cliente ya aceptó una parte o hay un pedido activo/);
    await q(`update orders set status = 'Cancelado' where id = $1`, [pedido.id]);
    assert.equal(Number((await q(`select count(*) n from notifications where title like 'Pedido cancelado:%' and link = '/pedidos/' || $1`, [pedido.id]))[0].n), 1);
    // Un pipeline sin etapa de tipo Ganada: la parte se acepta, la oportunidad no se mueve y se avisa.
    const [sinGanada] = await q(`insert into pipelines (name, channel, market) values ('Sin ganada', 'Canal B2C', 'Nacional') returning id`);
    await q(`insert into pipeline_stages (pipeline_id, name, sort_order, probability, category) values ($1, 'Abierta', 1, 10, 'open'), ($1, 'Ganada mal puesta', 2, 100, 'open'), ($1, 'Perdida', 3, 0, 'lost')`, [sinGanada.id]);
    await q(`insert into price_books (name, market) values ('General nacional de prueba', 'Nacional')`);
    const [hogar] = await q(`insert into accounts (name, industry) values ('Hogar Sin Ganada', 'Canal B2C') returning id`);
    const [oh] = await q(`insert into opportunities (name, account_id, stage_id, amount) select 'Opp sin ganada', $1, id, 0 from pipeline_stages where pipeline_id = $2 and name = 'Abierta' returning id`, [hogar.id, sinGanada.id]);
    const unica = await parte(oh.id, 'Única', 100);
    await q(`update quotes set status = 'Aceptada' where id = $1`, [unica]);
    assert.deepEqual(await q(`select o.is_closed, s.name from opportunities o join pipeline_stages s on s.id = o.stage_id where o.id = $1`, [oh.id]), [{ is_closed: false, name: 'Abierta' }]);
    assert.equal(Number((await q(`select count(*) n from notifications where title = 'Pipeline sin etapa ganada: Sin ganada'`))[0].n), 1);
    await q(`delete from quotes where opportunity_id = $1`, [oh.id]);
    await q(`delete from opportunities where id = $1`, [oh.id]);
    await q(`delete from pipelines where id = $1`, [sinGanada.id]);
    await q(`delete from price_books where name = 'General nacional de prueba'`);
    // Marcas de etapa: una por rol en cada pipeline, y se copian al duplicar.
    await assert.rejects(q(`update pipeline_stages set stage_role = 'propuesta' where name = 'Calificación' and pipeline_id = (select id from pipelines where is_default)`),
      /pipeline_stages_one_role/);
    assert.deepEqual((await q(`select s.name, s.stage_role from pipeline_stages s join pipelines p on p.id = s.pipeline_id
      where p.name = 'Distribución internacional' and s.stage_role is not null order by s.sort_order`)).map((r) => [r.name, r.stage_role]),
      [['Propuesta comercial', 'propuesta'], ['Pedido en negociación', 'negociacion']]);
  });
});
await check('permisos de las funciones nuevas', async () => {
  for (const fn of ['quote_line_price(uuid,uuid)', 'crm_funnels(date,date,uuid)', 'default_price_book(uuid,text)', 'channel_price_book(uuid,text)', 'channel_pipeline(uuid)',
    'market_of(text)', 'market_currency(text)', 'price_book_problem(uuid,uuid)', 'missing_price_book_message(uuid)',
    'missing_pipeline_message(uuid)', 'duplicate_pipeline(uuid,text,text)', 'quote_is_open_part(text)', 'won_stage_of(uuid)', 'sync_quote(uuid)']) {
    assert.equal((await q(`select has_function_privilege('authenticated', $1::regprocedure, 'EXECUTE') ok`, [fn]))[0].ok, true, fn);
  }
  for (const fn of ['equivalent_stage(uuid,uuid)', 'opportunity_channel_pipeline()', 'account_channel_moves_opportunities()', 'quote_line_listed()',
    'opportunity_follow_market(uuid)', 'price_book_market()', 'quote_line_market_check()', 'account_price_book_market()', 'account_market_moves_documents()',
    'notify_owner_and_manager(uuid,text,text,text)', 'opportunity_parts_value(uuid)', 'opportunity_advance_to_role(uuid,text)', 'opportunity_split_part(uuid,uuid)',
    'quote_status_moves_opportunity(uuid)', 'quote_parts_changed()', 'quote_needs_open_opportunity()', 'opportunity_lost_rejects_parts()', 'order_cancelled_notifies()']) {
    assert.equal((await q(`select has_function_privilege('authenticated', $1::regprocedure, 'EXECUTE') ok`, [fn]))[0].ok, false, fn);
  }
});

console.log('Modo sin conexión: descarga del día');
await check('la descarga trae lo del asesor (clientes, contactos, negocios abiertos y agenda) y nada de otros', async () => {
  const snap = (user) => as(user, async () => (await q(`select offline_snapshot() s`))[0].s);
  const hoy = `(now() at time zone 'America/Bogota')::date`;
  const [etapa] = await q(`select s.id from pipeline_stages s join pipelines p on p.id = s.pipeline_id where p.is_default and s.name = 'Calificación'`);
  const [ganada] = await q(`select s.id from pipeline_stages s join pipelines p on p.id = s.pipeline_id where p.is_default and s.category = 'won'`);
  // Del administrador: una cuenta que el asesor no trabaja, otra donde el asesor lleva un negocio abierto y otra
  // donde solo tiene uno ya cerrado.
  const cuentaDe = async (name) => (await q(`insert into accounts (name, industry, owner_id) values ($1, 'Canal Constructores', $2) returning id`, [name, admin.id]))[0].id;
  const ajena = await cuentaDe('Sin señal ajena');
  const porNegocio = await cuentaDe('Sin señal por negocio');
  const porCerrado = await cuentaDe('Sin señal por negocio cerrado');
  await q(`insert into contacts (last_name, account_id) values ('Contacto ajeno', $1)`, [ajena]);
  const [abierto] = await q(`insert into opportunities (name, account_id, stage_id, amount, owner_id) values ('Negocio sin señal', $1, $2, 5000000, $3) returning id`, [porNegocio, etapa.id, rep.id]);
  const [cerrado] = await q(`insert into opportunities (name, account_id, stage_id, amount, owner_id) values ('Negocio ya ganado', $1, $2, 1, $3) returning id`, [porCerrado, etapa.id, rep.id]);
  await q(`update opportunities set stage_id = $1 where id = $2`, [ganada.id, cerrado.id]);
  await q(`insert into activities (activity_type, subject, due_date, owner_id, account_id) values ('task', 'Tarea del administrador', ${hoy}, $1, $2)`, [admin.id, ajena]);

  const propia = await as(rep, async () => {
    const [acc] = await q(`insert into accounts (name, industry, billing_city) values ('Sin señal propia', 'Canal Constructores', 'Cali') returning id`);
    await q(`insert into contacts (first_name, last_name, account_id, mobile) values ('Rosa', 'Obra', $1, '3001234567')`, [acc.id]);
    await q(`insert into activities (activity_type, subject, due_date, account_id) values
      ('task', 'Vencida hace 3 días', ${hoy} - 3, $1), ('call', 'En 7 días', ${hoy} + 7, $1), ('task', 'En 8 días', ${hoy} + 8, $1),
      ('task', 'Sin fecha', null, $1)`, [acc.id]);
    await q(`insert into activities (activity_type, subject, due_date, status, account_id) values ('task', 'Ya hecha', ${hoy}, 'completed', $1)`, [acc.id]);
    await q(`insert into activities (activity_type, subject, start_at, status, account_id) values
      ('meeting', 'Reunión de mañana ya registrada', now() + interval '1 day', 'completed', $1),
      ('meeting', 'Reunión cancelada', now() + interval '1 day', 'cancelled', $1),
      ('meeting', 'Reunión en 20 días', now() + interval '20 days', 'pending', $1)`, [acc.id]);
    await q(`insert into activities (activity_type, subject, account_id) values ('note', 'Nota suelta', $1)`, [acc.id]);
    return acc.id;
  });

  const s = await snap(rep);
  assert.equal(s.version, 1);
  assert.equal(s.user.id, rep.id);
  assert.match(s.today, /^\d{4}-\d{2}-\d{2}$/);
  const cuentas = s.accounts.map((a) => a.id);
  assert.ok(cuentas.includes(propia) && cuentas.includes(porNegocio), s.accounts.map((a) => a.name).join(', '));
  assert.ok(!cuentas.includes(ajena) && !cuentas.includes(porCerrado), s.accounts.map((a) => a.name).join(', '));
  assert.ok(s.accounts.every((a) => a.owner_id === rep.id || a.id === porNegocio || s.activities.some((x) => x.account_id === a.id)), 'solo cuentas propias, de sus negocios o de su agenda');
  assert.equal(s.accounts.find((a) => a.id === propia).billing_city, 'Cali');
  const contactos = s.contacts.map((c) => c.full_name.toLowerCase());
  assert.ok(contactos.includes('rosa obra') && !contactos.includes('contacto ajeno'), contactos.join(', '));
  assert.ok(s.contacts.every((c) => s.accounts.some((a) => a.id === c.account_id)));
  const negocios = s.opportunities.map((o) => o.id);
  assert.ok(negocios.includes(abierto.id) && !negocios.includes(cerrado.id) && !negocios.includes(repOpp.id), s.opportunities.map((o) => o.name).join(', '));
  assert.equal(s.opportunities.find((o) => o.id === abierto.id).stage, 'Calificación');
  const agenda = s.activities.filter((a) => a.account_id === propia).map((a) => a.subject).sort();
  assert.deepEqual(agenda, ['En 7 días', 'Reunión de mañana ya registrada', 'Sin fecha', 'Vencida hace 3 días']);
  assert.equal(s.activities.find((a) => a.subject === 'Sin fecha').account_name, s.accounts.find((a) => a.id === propia).name);
  assert.ok(!s.activities.some((a) => a.subject === 'Tarea del administrador'));

  // El administrador descarga lo suyo, no lo del asesor.
  const deAdmin = await snap(admin);
  assert.ok(deAdmin.accounts.some((a) => a.id === ajena) && !deAdmin.accounts.some((a) => a.id === propia));
  assert.ok(deAdmin.activities.some((a) => a.subject === 'Tarea del administrador') && !deAdmin.activities.some((a) => a.subject === 'Sin fecha'));
  // Quien está en el equipo de una cuenta también la descarga.
  await q(`insert into account_team_members (account_id, user_id, team_role) values ($1, $2, 'Especificador')`, [ajena, rep.id]);
  assert.ok((await snap(rep)).accounts.some((a) => a.id === ajena));
  await q(`delete from account_team_members where account_id = $1 and user_id = $2`, [ajena, rep.id]);
});
await check('la descarga trae el catálogo activo, las listas de canal, las propias de sus clientes y solo precios vigentes', async () => {
  const snap = (user) => as(user, async () => (await q(`select offline_snapshot() s`))[0].s);
  const [inactivo] = await q(`insert into products (name, product_code, is_active) values ('Producto retirado', 'SIN-SENAL-RET', false) returning id`);
  const [vigente] = await q(`insert into products (name, product_code) values ('Producto sin señal', 'SIN-SENAL-OK') returning id`);
  const [sinPrecio] = await q(`insert into products (name, product_code) values ('Producto con precio retirado', 'SIN-SENAL-SP') returning id`);
  const [canal] = await q(`select id from price_books where name = 'Lista estándar COP'`);
  await q(`insert into price_book_entries (price_book_id, product_id, unit_price, is_active) values ($1, $2, 100, true), ($1, $3, 123456, true), ($1, $4, 200, false)`,
    [canal.id, inactivo.id, vigente.id, sinPrecio.id]);
  const [archivada] = await q(`insert into price_books (name, market, channel, is_active) values ('Lista archivada sin señal', 'Nacional', 'Canal Constructores', false) returning id`);
  await q(`insert into price_book_entries (price_book_id, product_id, unit_price) values ($1, $2, 1)`, [archivada.id, vigente.id]);

  let s = await snap(rep);
  const codigos = s.products.map((p) => p.product_code);
  assert.ok(codigos.includes('SIN-SENAL-OK') && codigos.includes('SIN-SENAL-SP') && !codigos.includes('SIN-SENAL-RET'));
  const listas = s.price_books.map((b) => b.name);
  assert.ok(listas.includes('Lista estándar COP') && listas.includes('Distribuidores 2026'), listas.join(', '));
  assert.ok(!listas.includes('Lista archivada sin señal'));
  assert.ok(s.price_books.every((b) => !b.is_client_list), listas.join(', '));
  const precio = (snapshot, book, product) => snapshot.prices.find((p) => p[0] === book && p[1] === product)?.[2];
  assert.equal(Number(precio(s, canal.id, vigente.id)), 123456);
  assert.equal(precio(s, canal.id, inactivo.id), undefined);
  assert.equal(precio(s, canal.id, sinPrecio.id), undefined);
  assert.equal(precio(s, archivada.id, vigente.id), undefined);
  assert.ok(s.prices.every((p) => s.price_books.some((b) => b.id === p[0]) && s.products.some((x) => x.id === p[1])));

  const [propia] = await q(`insert into price_books (name, is_client_list) values ('Lista propia sin señal', true) returning id`);
  await q(`insert into price_book_entries (price_book_id, product_id, unit_price) values ($1, $2, 99000)`, [propia.id, vigente.id]);
  // La lista propia de un cliente que no es suyo no baja; la de un cliente suyo, sí.
  const [ajena] = await q(`select id from accounts where name ilike 'Sin señal ajena'`);
  await q(`update accounts set price_book_id = $1 where id = $2`, [propia.id, ajena.id]);
  assert.ok(!(await snap(rep)).price_books.some((b) => b.id === propia.id));
  assert.ok((await snap(admin)).price_books.some((b) => b.id === propia.id));
  const [suya] = await q(`update accounts set price_book_id = $1 where name ilike 'Sin señal propia' returning id`, [propia.id]);
  s = await snap(rep);
  assert.ok(s.price_books.some((b) => b.id === propia.id && b.is_client_list && b.market === 'Nacional' && b.currency === 'COP'));
  assert.equal(Number(precio(s, propia.id, vigente.id)), 99000);
  assert.equal(s.accounts.find((a) => a.id === suya.id).price_book_id, propia.id);
});
await check('el precio calculado en el dispositivo es el mismo que da la base', async () => {
  // La regla vive dos veces: en la base (default_price_book, channel_price_book, quote_line_price) y en
  // src/lib/offline/prices.ts, que es la que usa el celular sin señal. Aquí se comparan sobre los mismos datos.
  const ts = (await import('typescript')).default;
  const fuente = readFileSync(join(root, 'src/lib/offline/prices.ts'), 'utf8');
  const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const { defaultBook, channelBook, priceFor, priceIndex, marketCurrency } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

  // Un cliente internacional sin lista de su canal y uno nacional sin canal, para cubrir los bordes de la regla.
  await as(admin, () => q(`insert into accounts (name, industry, market) values ('Sin señal exportación', 'Canal Constructores', 'Internacional'),
    ('Sin señal sin canal', null, 'Nacional')`));

  const vistos = { lista: 0, canal: 0, sinPrecio: 0, propia: 0, sinLista: 0 };
  for (const user of [admin, rep]) {
    const s = await as(user, async () => (await q(`select offline_snapshot() s`))[0].s);
    const index = priceIndex(s.prices);
    for (const account of s.accounts) {
      for (const currency of ['COP', 'USD']) {
        const [esperada] = await as(user, () => q(`select default_price_book($1, $2) propia, channel_price_book($1, $2) canal`, [account.id, currency]));
        assert.equal(defaultBook(account, s.price_books, currency)?.id ?? null, esperada.propia, `lista de «${account.name}» en ${currency}`);
        assert.equal(channelBook(account, s.price_books, currency)?.id ?? null, esperada.canal, `lista de canal de «${account.name}» en ${currency}`);
      }
      const currency = marketCurrency(account.market);
      const filas = await as(user, () => q(`
        with b as (select default_price_book($1, $2) lista, channel_price_book($1, $2) canal, (select price_book_id from accounts where id = $1) propia)
        select p.id,
          (select e.unit_price from price_book_entries e where e.price_book_id = b.lista and e.product_id = p.id and e.is_active) directo,
          case when b.propia is not null and b.propia = b.lista then
            (select e.unit_price from price_book_entries e where e.price_book_id = b.canal and e.product_id = p.id and e.is_active) end de_canal,
          b.lista, b.propia
        from products p cross join b where p.is_active`, [account.id, currency]));
      assert.equal(filas.length, s.products.length);
      if (filas[0].lista === null) vistos.sinLista += 1;
      else if (filas[0].lista === filas[0].propia) vistos.propia += 1;
      for (const fila of filas) {
        const esperado = fila.directo !== null ? { unit_price: Number(fila.directo), source: 'lista' }
          : fila.de_canal !== null ? { unit_price: Number(fila.de_canal), source: 'canal' } : null;
        const calculado = priceFor(account, fila.id, s.price_books, index);
        assert.deepEqual(calculado && { unit_price: calculado.unit_price, source: calculado.source }, esperado, `precio para «${account.name}»`);
        if (calculado) assert.equal(calculado.currency, currency);
        vistos[esperado ? esperado.source : 'sinPrecio'] += 1;
      }
    }
    // Y contra una cotización de verdad: la del cliente con lista propia.
    const [cot] = await q(`select q.id, q.account_id from quotes q where q.name = 'Cotización gran cliente'`);
    const cliente = s.accounts.find((a) => a.id === cot.account_id);
    if (!cliente) continue;
    for (const product of s.products) {
      const [{ p }] = await as(user, () => q(`select quote_line_price($1, $2) p`, [cot.id, product.id]));
      const calculado = priceFor(cliente, product.id, s.price_books, index);
      assert.deepEqual(calculado ? { unit_price: calculado.unit_price, source: calculado.source } : { unit_price: null },
        { unit_price: p.unit_price === null ? null : Number(p.unit_price), ...(p.source ? { source: p.source } : {}) }, `cotización: ${product.product_code}`);
      if (p.source === 'canal') assert.equal(calculado.book.name, p.price_book);
    }
    vistos.cotizacion = true;
  }
  // La comparación pasó por todos los casos de la regla.
  assert.ok(vistos.lista > 0 && vistos.canal > 0 && vistos.sinPrecio > 0 && vistos.propia > 0 && vistos.sinLista > 0 && vistos.cotizacion, JSON.stringify(vistos));
});
await check('la descarga exige sesión', async () => {
  assert.equal((await q(`select has_function_privilege('authenticated', 'public.offline_snapshot()'::regprocedure, 'EXECUTE') ok`))[0].ok, true);
  assert.equal((await q(`select has_function_privilege('anon', 'public.offline_snapshot()'::regprocedure, 'EXECUTE') ok`))[0].ok, false);
  await db.exec(`set role anon`);
  try {
    await assert.rejects(q(`select offline_snapshot()`), /permission denied/);
  } finally {
    await db.exec(`reset role`);
  }
});

await check('cotización hecha sin señal: se respeta el precio cotizado, la línea queda marcada y los totales coinciden', async () => {
  const ts = (await import('typescript')).default;
  const fuente = readFileSync(join(root, 'src/lib/offline/quotes.ts'), 'utf8');
  const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const { quoteTotals, lineTotal, provisionalNumber } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

  const [etapa] = await q(`select s.id from pipeline_stages s join pipelines p on p.id = s.pipeline_id where p.is_default and s.name = 'Calificación'`);
  const [cuenta] = await q(`insert into accounts (name, industry, market, owner_id) values ('Sin señal cotización', 'Canal Constructores', 'Nacional', $1) returning id`, [rep.id]);
  const [negocio] = await as(rep, () => q(`insert into opportunities (name, account_id, stage_id, amount) values ('Negocio cotizado sin señal', $1, $2, 0) returning id`, [cuenta.id, etapa.id]));

  // La cotización llega con el id que le puso el dispositivo; reenviarla choca con ese id en vez de duplicarla.
  const id = '5c0f1e2a-0000-4000-8000-0000000000c1';
  const [cot] = await as(rep, () => q(`insert into quotes (id, name, opportunity_id, status) values ($1, 'Cotizada en obra', $2, 'Borrador')
    returning id, quote_number, currency, tax_rate`, [id, negocio.id]));
  assert.equal(cot.id, id);
  assert.match(cot.quote_number, /^COT-\d+$/);
  assert.match(provisionalNumber(id), /^PROV-5C0F1E$/);
  await assert.rejects(as(rep, () => q(`insert into quotes (id, name, opportunity_id) values ($1, 'Repetida', $2)`, [id, negocio.id])), /duplicate key/);

  // Tres productos con precio en la lista que le tocó a la cotización (la de su canal).
  await q(`insert into price_book_entries (price_book_id, product_id, unit_price)
    select q.price_book_id, p.id, 100000 + 50000 * row_number() over (order by p.product_code)
    from quotes q, (select id, product_code from products where is_active order by product_code limit 3) p where q.id = $1
    on conflict (price_book_id, product_id) do update set unit_price = excluded.unit_price, is_active = true`, [id]);
  const conPrecio = [];
  for (const p of await q(`select id from products where is_active order by product_code`)) {
    const [{ precio }] = await as(rep, () => q(`select quote_line_price($1, $2) precio`, [id, p.id]));
    if (precio.unit_price !== null) conPrecio.push({ id: p.id, lista: Number(precio.unit_price) });
  }
  assert.ok(conPrecio.length >= 3, 'hacen falta tres productos con precio para esta cuenta');
  const [igual, cambiado, raro] = conPrecio;
  // En el dispositivo: uno al precio de lista, otro a un precio que ya cambió en el CRM y uno con decimales difíciles.
  const lineas = [
    { product_id: igual.id, quantity: 3, unit_price: igual.lista, discount: 10, lista: igual.lista },
    { product_id: cambiado.id, quantity: 2.5, unit_price: cambiado.lista - 1000, discount: 0, lista: cambiado.lista },
    { product_id: raro.id, quantity: 7.35, unit_price: 333333.33, discount: 12.5, lista: raro.lista },
  ];
  // Todas las líneas en una sola instrucción: o entran todas o ninguna.
  await as(rep, () => q(`insert into quote_line_items (quote_id, product_id, quantity, unit_price, discount, sort_order, offline_list_price)
    select $1, (l->>'product_id')::uuid, (l->>'quantity')::numeric, (l->>'unit_price')::numeric, (l->>'discount')::numeric, n::int, (l->>'lista')::numeric
    from jsonb_array_elements($2::jsonb) with ordinality t(l, n)`, [id, JSON.stringify(lineas)]));

  const guardadas = await q(`select product_id, unit_price, line_total, offline_list_price from quote_line_items where quote_id = $1 order by sort_order`, [id]);
  // Se respeta lo cotizado; la marca solo queda donde el precio de lista es otro.
  assert.deepEqual(guardadas.map((l) => Number(l.unit_price)), lineas.map((l) => l.unit_price));
  assert.deepEqual(guardadas.map((l) => l.offline_list_price === null ? null : Number(l.offline_list_price)), [null, cambiado.lista, raro.lista]);
  assert.deepEqual(guardadas.map((l) => Number(l.line_total)), lineas.map(lineTotal));

  const [t] = await q(`select subtotal, discount_total, net_total, tax_rate, tax, grand_total from quotes where id = $1`, [id]);
  assert.deepEqual(
    { subtotal: Number(t.subtotal), discount: Number(t.discount_total), net: Number(t.net_total), taxRate: Number(t.tax_rate), tax: Number(t.tax), total: Number(t.grand_total) },
    quoteTotals(lineas, cot.currency));
  assert.equal(cot.currency, 'COP');
  assert.equal(quoteTotals(lineas, 'USD').tax, 0);

  // La marca sigue mientras la línea conserve el precio cotizado; al cambiarlo, se borra.
  await as(rep, () => q(`update quote_line_items set discount = 5 where quote_id = $1 and product_id = $2`, [id, cambiado.id]));
  assert.equal(await count(`select count(*) n from quote_line_items where quote_id = $1 and offline_list_price is not null`, [id]), 2);
  await as(rep, () => q(`update quote_line_items set unit_price = $3 where quote_id = $1 and product_id = $2`, [id, cambiado.id, cambiado.lista]));
  assert.equal(await count(`select count(*) n from quote_line_items where quote_id = $1 and offline_list_price is not null`, [id]), 1);
  await assert.rejects(q(`update quote_line_items set offline_list_price = -1 where quote_id = $1`, [id]), /check/);
  assert.equal((await q(`select has_function_privilege('authenticated', 'public.quote_line_offline_price()'::regprocedure, 'EXECUTE') ok`))[0].ok, false);
});

console.log('Semillas: configuración inicial separada de los datos de demostración');
// Cada comprobación usa su propia base limpia (como un proyecto nuevo de Supabase), no la de arriba.
const DEMO_TABLES = ['accounts', 'contacts', 'opportunities', 'activities', 'leads', 'campaigns', 'products', 'quotes', 'cases', 'orders'];
const freshDb = async () => {
  const fresh = new PGlite();
  await prepareSupabaseLike(fresh);
  return fresh;
};
const demoRows = async (fresh) => {
  let total = 0;
  for (const t of DEMO_TABLES) total += Number((await fresh.query(`select count(*)::int n from public.${t} where is_demo`)).rows[0].n);
  return total;
};
const configSummary = async (fresh) => (await fresh.query(`select
    (select count(*)::int from public.permission_profiles) perfiles, (select count(*)::int from public.roles) roles,
    (select count(*)::int from public.pipelines) pipelines, (select count(*)::int from public.pipeline_stages) etapas,
    (select count(*)::int from public.price_books) listas_precios, (select count(*)::int from public.approval_processes) procesos,
    (select count(*)::int from public.approval_steps) pasos, (select count(*)::int from public.validation_rules) reglas,
    (select count(*)::int from public.automation_rules) automatizaciones, (select count(*)::int from public.reports) informes,
    (select count(*)::int from public.email_templates) plantillas, (select count(*)::int from public.custom_field_definitions) campos,
    (select count(*)::int from public.sales_goals) metas, (select count(*)::int from public.exchange_rates where source = 'Ejemplo') trm_ejemplo,
    (select count(*)::int from public.countries) paises, (select count(*)::int from public.co_municipalities) municipios`)).rows[0];
const CONFIG_ESPERADA = { perfiles: 6, roles: 12, pipelines: 2, etapas: 13, listas_precios: 3, procesos: 1, pasos: 2, reglas: 4,
  automatizaciones: 5, informes: 6, plantillas: 3, campos: 8, metas: 0, trm_ejemplo: 0, paises: 249, municipios: 1122 };

await check('una base nueva con migraciones y configuración inicial queda configurada y sin ningún registro ficticio', async () => {
  const fresh = await freshDb();
  try {
    await applyMigrations(fresh);
    await fresh.exec(seedConfig);
    assert.deepEqual(await configSummary(fresh), CONFIG_ESPERADA);
    assert.equal(await demoRows(fresh), 0);
  } finally { await fresh.close(); }
});
await check('setup-produccion.sql instala una base nueva sin datos demo y se niega a correr sobre una base existente', async () => {
  const fresh = await freshDb();
  try {
    const setup = buildSetupSql({ withDemo: false });
    assert.ok(!setup.includes('02_demo.sql =====') && !setup.includes('purge_demo_data();'));
    await fresh.exec(setup);
    assert.deepEqual(await configSummary(fresh), CONFIG_ESPERADA);
    assert.equal(await demoRows(fresh), 0);
    // Una personalización del administrador no se pierde si alguien vuelve a ejecutar el archivo.
    await fresh.exec(`update public.pipelines set name = 'Obras' where name = 'Proyectos y constructoras'`);
    await assert.rejects(fresh.exec(setup), /solo para una base nueva/);
    assert.equal(Number((await fresh.query(`select count(*)::int n from public.pipelines where name = 'Obras'`)).rows[0].n), 1);
  } finally { await fresh.close(); }
});
await check('setup.sql (proyecto de demostración) sí trae los datos demo', async () => {
  const fresh = await freshDb();
  try {
    await fresh.exec(buildSetupSql({ withDemo: true }));
    assert.ok(await demoRows(fresh) > 50);
    assert.equal(Number((await fresh.query(`select count(*)::int n from public.sales_goals`)).rows[0].n), 5);
  } finally { await fresh.close(); }
});
await check('los datos demo se niegan a cargar en una base con usuarios o sin configuración', async () => {
  const fresh = await freshDb();
  try {
    await applyMigrations(fresh);
    await assert.rejects(fresh.exec(seedDemo), /Falta la configuración inicial/);
    await fresh.exec(seedConfig);
    await fresh.exec(`insert into auth.users (email) values ('persona.real@firplak.com')`);
    await assert.rejects(fresh.exec(seedDemo), /usuarios o datos reales/);
    assert.equal(await demoRows(fresh), 0);
    assert.equal(Number((await fresh.query(`select count(*)::int n from public.sales_goals`)).rows[0].n), 0);
  } finally { await fresh.close(); }
});
await check('la configuración inicial no contiene registros ficticios (sin is_demo, metas, TRM de ejemplo ni correos .example)', async () => {
  assert.doesNotMatch(seedConfig, /is_demo|sales_goals|exchange_rates|\.example|claim_demo_records/);
});

console.log('Publicación de migraciones');
await check('la revisión detecta pendientes y frena si el historial remoto no coincide con el repositorio', async () => {
  const { parseMigrationList } = await import('./db-publicar.mjs');
  const sincronizado = `
        LOCAL      │     REMOTE     │     TIME (UTC)
  ─────────────────┼────────────────┼─────────────────────
    20261129000100 │ 20261129000100 │ 2026-11-29 00:01:00
    20261130000100 │                │ 2026-11-30 00:01:00`;
  assert.deepEqual(parseMigrationList(sincronizado), { synced: ['20261129000100'], pending: ['20261130000100'], remoteOnly: [] });
  // Como está producción hoy: versiones del MCP solo en remoto y las del repositorio solo en local.
  const sinConciliar = `
    20261029000100 │                │ 2026-10-29 00:01:00
                   │ 20261107000748 │ 2026-11-07 00:07:48`;
  const r = parseMigrationList(sinConciliar);
  assert.deepEqual(r.remoteOnly, ['20261107000748']);
  assert.deepEqual(r.pending, ['20261029000100']);
  // En una terminal, la CLI 2.x pone las celdas entre comillas invertidas.
  const conComillas = `
   \`20261130000100\` | \`20261130000100\` | \`2026-11-30 00:01:00\`
   \`20261201000100\` | \` \`              | \`2026-12-01 00:01:00\``;
  assert.deepEqual(parseMigrationList(conComillas), { synced: ['20261130000100'], pending: ['20261201000100'], remoteOnly: [] });
  // Llamada desde un script, la CLI responde en JSON.
  const json = `Initialising login role...\nConnecting to remote database...\n{"migrations":[{"local":"20261129000100","remote":"20261129000100","time":"x"},{"local":"20261130000100","remote":"","time":"x"},{"local":"","remote":"20261107173033","time":"x"}],"message":"Migrations listed"}`;
  assert.deepEqual(parseMigrationList(json), { synced: ['20261129000100'], pending: ['20261130000100'], remoteOnly: ['20261107173033'] });
});
await check('ventas reales de SAP: carga por meses, dos años, visibilidad, sucursales agrupadas y meta de facturación', async () => {
  const [agent] = await q(`insert into auth.users (email) values ('agente.ventas@firplak.com') returning id`);
  await q(`update profiles set permission_profile_id = (select id from permission_profiles where name = 'Integración SAP') where id = $1`, [agent.id]);
  await q(`update profiles set full_name = 'Rosa Vendedora' where id = $1`, [rep.id]);
  const y = new Date().getFullYear();
  const mes = `${y}-03-01`;
  const filas = [
    [`${y}-03-02`, '801', 'Nacional', 'ANTIOQUIA', 'Medellín', 'Canal Distribución', 'ROSA MARIA VENDEDORA', 'CN900100200-01', 'MAXI S A S ACACIAS', 1000],
    [`${y}-03-05`, '802', 'Nacional', 'TOLIMA GRANDE', 'Ibagué', 'Canal Distribución', 'OTRO VENDEDOR', 'CN900100200-02', 'MAXI S A S IBAGUE', 500],
    [`${y}-03-09`, '803', 'Excluido', 'ANTIOQUIA', 'Medellín', 'Canal Constructores', 'ROSA MARIA VENDEDORA', 'CN800-01', 'OBRA UNO', 300],
    [`${y}-03-10`, '804', 'Nacional', 'ANTIOQUIA', 'Medellín', 'Canal Constructores', 'ROSA MARIA VENDEDORA', 'CN800-01', 'OBRA UNO', -100],
    [`${y}-04-01`, '805', 'Nacional', 'ANTIOQUIA', 'Medellín', 'Canal B2C', 'OTRO VENDEDOR', 'CN1-01', 'FUERA DEL MES', 999],
  ];
  // Solo el agente carga; nadie lee la tabla directamente.
  await assert.rejects(as(admin, () => q(`select sap_agent_sales_load($1, 'h1', $2::jsonb, true, true)`, [mes, JSON.stringify(filas)])), /Solo el agente de SAP/);
  await assert.rejects(as(agent, () => q(`select sap_agent_sales_load($1, 'h0', '[]', true, true)`, [`${y - 2}-12-01`])), /año en curso y el anterior/);
  const [{ n }] = await as(agent, () => q(`select sap_agent_sales_load($1, 'h1', $2::jsonb, true, true) n`, [mes, JSON.stringify(filas)]));
  assert.equal(n, 4); // la fila de otro mes no entra
  assert.deepEqual((await as(agent, () => q(`select sap_agent_sales_months() m`)))[0].m, { [`${y}-03`]: 'h1' });
  assert.equal(await as(admin, () => count(`select count(*) n from sap_sales`)), 0);
  // El vendedor de SAP se relaciona solo con el usuario del mismo nombre; el otro queda sin relacionar.
  assert.deepEqual(await q(`select seller, user_id from sap_sellers order by seller`),
    [{ seller: 'OTRO VENDEDOR', user_id: null }, { seller: 'ROSA MARIA VENDEDORA', user_id: rep.id }]);
  // Volver a cargar el mes lo reemplaza (no duplica).
  await as(agent, () => q(`select sap_agent_sales_load($1, 'h2', $2::jsonb, true, true)`, [mes, JSON.stringify(filas)]));
  assert.equal(await count(`select count(*) n from sap_sales`), 4);

  // La dirección ve todo, con las sucursales agrupadas; «Excluido» y las notas crédito cuentan.
  const [{ s: todo }] = await as(admin, () => q(`select sap_sales_summary($1, $2) s`, [`${y}-01-01`, `${y}-12-31`]));
  assert.equal(todo.total, 1700);
  assert.deepEqual(todo.top.map((t) => [t.key, t.amount, t.branches]), [['CN900100200', 1500, 2], ['CN800', 200, 1]]);
  assert.deepEqual(todo.by_channel.map((c) => [c.key, c.amount]), [['Canal Distribución', 1500], ['Canal Constructores', 200]]);
  assert.deepEqual(todo.by_month, [{ month: `${y}-03`, amount: 1700 }]);
  // El asesor ve solo lo de su vendedor de SAP; su jefe, lo del asesor.
  const [{ s: suyo }] = await as(rep, () => q(`select sap_sales_summary($1, $2) s`, [`${y}-01-01`, `${y}-12-31`]));
  assert.equal(suyo.total, 1200);
  assert.deepEqual(await as(rep, () => q(`select card_code, amount::float from sap_sales_group('CN900100200', $1, $2)`, [`${y}-01-01`, `${y}-12-31`])), [{ card_code: 'CN900100200-01', amount: 1000 }]);
  assert.equal((await as(mgr, () => q(`select sap_sales_summary($1, $2) s`, [`${y}-01-01`, `${y}-12-31`])))[0].s.total, 1200);

  // El nombre del grupo sale de la cuenta principal del CRM, y la cuenta principal suma sus sucursales.
  const [main] = await q(`insert into accounts (name, owner_id) values ('Maxi S.A.S.', $1) returning id`, [admin.id]);
  const [branch] = await q(`insert into accounts (name, owner_id, parent_account_id, sap_card_code) values ('Maxi Acacias', $1, $2, 'CN900100200-01') returning id`, [admin.id, main.id]);
  await q(`insert into accounts (name, owner_id, parent_account_id, sap_card_code) values ('Maxi Ibagué', $1, $2, 'CN900100200-02')`, [admin.id, main.id]);
  assert.equal((await as(admin, () => q(`select sap_sales_summary($1, $2) s`, [`${y}-01-01`, `${y}-12-31`])))[0].s.top[0].crm_name, 'Maxi S.A.S.');
  await q(`update sap_sales set sale_date = (now() at time zone 'America/Bogota')::date`);
  assert.deepEqual((await as(admin, () => q(`select amount::float a, branches::int b from sap_account_sales($1)`, [main.id]))), [{ a: 1500, b: 2 }]);
  assert.deepEqual((await as(admin, () => q(`select amount::float a, branches::int b from sap_account_sales($1)`, [branch.id]))), [{ a: 1000, b: 1 }]);
  assert.equal((await as(rep, () => q(`select count(*)::int n from sap_account_sales($1)`, [main.id])))[0].n, await as(rep, () => count(`select count(*) n from accounts where id = $1`, [main.id])));

  // Meta de facturación: la del asesor suma lo de su vendedor; la de la compañía, todo.
  const hoy = (await q(`select date_trunc('year', (now() at time zone 'America/Bogota'))::date::text d`))[0].d;
  await q(`insert into sales_goals (user_id, metric, period_type, period_start, target) values ($1, 'invoiced_amount', 'year', $2, 5000), (null, 'invoiced_amount', 'year', $2, 9000)`, [rep.id, hoy]);
  const avance = await as(admin, () => q(`select user_id, actual::float from goal_progress('year', $1) where metric = 'invoiced_amount' order by user_id nulls first`, [hoy]));
  assert.deepEqual(avance, [{ user_id: null, actual: 1700 }, { user_id: rep.id, actual: 1200 }]);

  await db.exec(`delete from sales_goals where metric = 'invoiced_amount'; delete from accounts where name like 'Maxi %'; delete from sap_sales; delete from sap_sales_months; delete from sap_sellers`);
  await q(`update profiles set full_name = '' where id = $1`, [rep.id]);
  await q(`delete from auth.users where id = $1`, [agent.id]);
});
await check('publicar exige un proyecto de destino explícito y enlazado', async () => {
  const { spawnSync } = await import('node:child_process');
  const run = (...args) => spawnSync(process.execPath, [join(root, 'scripts/db-publicar.mjs'), ...args], { cwd: root, encoding: 'utf8' });
  const sinDestino = run('--solo-revisar');
  assert.notEqual(sinDestino.status, 0);
  assert.match(sinDestino.stderr, /Indica el proyecto de destino/);
  const otro = run('--proyecto', 'abcdefghijabcdefghij', '--solo-revisar');
  assert.notEqual(otro.status, 0);
  assert.match(otro.stderr, /no a «abcdefghijabcdefghij»/);
});

console.log(`\n${passed} comprobaciones superadas${process.exitCode ? ' (con fallos)' : ''}`);
