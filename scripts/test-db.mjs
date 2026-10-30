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
    const [d] = await q(`select id from accounts where name = 'ALMACENES CASA VIVA S.A.S.'`);
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
await check('un asesor no ve pedidos ajenos y no puede borrar pedidos activados', async () => {
  assert.equal(await as(rep, () => count(`select count(*) n from orders`)), 0);
  const [{ id }] = await q(`select id from orders where is_demo`);
  await as(admin, () => q(`delete from orders where id = $1`, [id]));
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
  assert.ok(changes.some((c) => c.name === 'Oportunidad nueva de prueba' && c.is_new));
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

console.log(`\n${passed} comprobaciones superadas${process.exitCode ? ' (con fallos)' : ''}`);
