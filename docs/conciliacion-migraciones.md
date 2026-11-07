# Conciliación del historial de migraciones (producción)

**Estado: ejecutado el 2026-11-07, con el visto bueno de Luis.** El historial de producción quedó conciliado:
35 migraciones sincronizadas y 0 pendientes. La correspondencia se verificó antes en solo lectura contra el proyecto
**CRM** (`kltekrfpquakyffbpmiv`, Postgres 17.11) y el repositorio en `20261130000100_quote_approval_gate`. El
resultado está en la sección 5.

## 1. El problema

Las 35 migraciones del repositorio están aplicadas en producción, pero se aplicaron con el MCP de Supabase
(`apply_migration`). El MCP las registró en `supabase_migrations.schema_migrations` con **otra versión** (la
hora en que se aplicaron, `20261107…`) en lugar de la del archivo. La CLI compara solo por versión, así que
hoy `supabase migration list` muestra 35 migraciones «solo locales» y 35 «solo remotas», y un
`supabase db push` intentaría **volver a ejecutar las 35** (o fallaría a mitad de camino).

## 2. Correspondencia verificada (35 de 35)

Cómo se verificó, sin asumir equivalencia por nombre ni por cantidad:

1. **Texto aplicado.** Producción guarda el SQL exacto que recibió cada migración (`statements`). Se comparó su
   md5 con el del archivo: 29 coinciden **byte por byte**. Las otras 6 se compararon sin comentarios ni espacios.
2. **Efectos.** Huella del esquema `public` (`scripts/huella-esquema.sql`) en producción y en una base limpia
   con las 35 migraciones del repositorio (`npm run db:huella`): **coinciden los 10 tipos**. Son 742 columnas,
   105 funciones, 96 triggers, 140 políticas, 153 índices, 317 restricciones, RLS en 63 tablas, las 4 funciones
   abiertas a `anon`, 249 países y 1.122 municipios con el mismo contenido.
3. **Datos de configuración que tocan las migraciones.** Regla «Cliente requiere NIT» con la excepción del
   mercado Internacional; lista «Lista exportación USD»; trabajos de pg_cron `firplak-alertas-diarias`,
   `firplak-automatizaciones-programadas`, `firplak-instantanea-pronostico` y `firplak-trm-diaria`.
   Extensiones `pg_cron` 1.6.4, `http` 1.6 y `pgcrypto` 1.3.

| # | Versión remota (MCP) | Nombre remoto | Archivo del repositorio | Comparación |
|---|---|---|---|---|
| 1 | 20261107000748 | 20261029000100_core_security | 20261029000100_core_security.sql | Idéntico |
| 2 | 20261107000954 | 20261029000200_sales_objects | 20261029000200_sales_objects.sql | Idéntico |
| 3 | 20261107001015 | 20261029000300_analytics | 20261029000300_analytics.sql | Idéntico |
| 4 | 20261107001209 | 20261030000100_phase2_objects | 20261030000100_phase2_objects.sql | Idéntico |
| 5 | 20261107001225 | 20261031000100_phase3_reports_email | 20261031000100_phase3_reports_email.sql | Idéntico |
| 6 | 20261107001254 | 20261101000100_phase4_admin | 20261101000100_phase4_admin.sql | Idéntico |
| 7 | 20261107001341 | 20261102000100_phase5_data_quality | 20261102000100_phase5_data_quality.sql | Idéntico |
| 8 | 20261107001400 | 20261103000100_phase6_goals | 20261103000100_phase6_goals.sql | Idéntico |
| 9 | 20261107001417 | 20261104000100_phase7_forecast | 20261104000100_phase7_forecast.sql | Idéntico |
| 10 | 20261107001505 | 20261105000100_phase8_approvals | 20261105000100_phase8_approvals.sql | Idéntico |
| 11 | 20261107001606 | 20261106000100_phase9_scheduled_automations | 20261106000100_phase9_scheduled_automations.sql | Idéntico |
| 12 | 20261107001714 | 20261107000100_phase10_orders | 20261107000100_phase10_orders.sql | Idéntico |
| 13 | 20261107001800 | 20261108000100_phase11_approval_steps | 20261108000100_phase11_approval_steps.sql | Idéntico |
| 14 | 20261107001827 | 20261109000100_phase12_forecast_history | 20261109000100_phase12_forecast_history.sql | Idéntico |
| 15 | 20261107001837 | 20261110000100_phase13_value_translations | 20261110000100_phase13_value_translations.sql | Idéntico |
| 16 | 20261107001838 | 20261111000100_phase14_name_translations | 20261111000100_phase14_name_translations.sql | Idéntico |
| 17 | 20261107001925 | 20261112000100_phase15_sales_teams | 20261112000100_phase15_sales_teams.sql | Idéntico |
| 18 | 20261107002021 | 20261113000100_phase16_revenue_splits | 20261113000100_phase16_revenue_splits.sql | Idéntico |
| 19 | 20261107002042 | 20261114000100_phase17_mcp | 20261114000100_phase17_mcp.sql | Idéntico |
| 20 | 20261107002101 | 20261115000100_sap_card_code | 20261115000100_sap_card_code.sql | Idéntico |
| 21 | 20261107002128 | 20261116000100_phase18_go_live | 20261116000100_phase18_go_live.sql | Idéntico |
| 22 | 20261107002201 | 20261117000100_phase19_mcp_oauth | 20261117000100_phase19_mcp_oauth.sql | Idéntico |
| 23 | 20261107002216 | 20261118000100_phase20_ms365 | 20261118000100_phase20_ms365.sql | Idéntico |
| 24 | 20261107002228 | 20261119000100_phase21_planner_sharepoint | 20261119000100_phase21_planner_sharepoint.sql | Idéntico |
| 25 | 20261107002238 | 20261120000100_phase23_sap_quotations | 20261120000100_phase23_sap_quotations.sql | Idéntico |
| 26 | 20261107002255 | 20261121000100_phase25_push | 20261121000100_phase25_push.sql | Idéntico |
| 27 | 20261107004648 | 20261122000100_function_grants | 20261122000100_function_grants.sql | Idéntico |
| 28 | 20261107013514 | 20261123000100_picklist_dependencies | 20261123000100_picklist_dependencies.sql | Idéntico |
| 29 | 20261107022059 | 20261124000100_market_and_multi_dependencies | 20261124000100_market_and_multi_dependencies.sql | Idéntico |
| 30 | 20261107025549 | normalize_names | 20261125000100_normalize_names.sql | Igual sin comentarios (*a*) |
| 31 | 20261107042857 | leads_like_accounts | 20261126000100_leads_like_accounts.sql | Igual sin comentarios (*a*) |
| 32 | 20261107050559 | international_usd | 20261127000100_international_usd.sql | Igual sin comentarios (*a*) |
| 33 | 20261107050710 | clean_places | 20261128000100_clean_places.sql | Igual salvo la carga de municipios (*b*) |
| 34 | 20261107050838 | internal_rate_functions | 20261129000100_internal_rate_functions.sql | Igual sin comentarios (*a*) |
| 35 | 20261107173033 | 20261130000100_quote_approval_gate | 20261130000100_quote_approval_gate.sql | Idéntico |

**Discrepancias (ninguna cambia el resultado):**

- (*a*) Se enviaron sin los comentarios del archivo. El código es idéntico; por eso los cuerpos de 6 funciones
  (`normalize_name`, `convert_lead`, `merge_records`, `enforce_picklist_dependencies`, `opportunity_currency`,
  `clean_place`) no traen comentarios en producción. La huella compara sin comentarios.
- (*b*) En producción los 1.122 municipios se descargaron del DANE (`extensions.http_get` a datos.gov.co)
  en lugar de la lista escrita en el archivo. El resto de la migración es idéntico y el contenido de
  `co_municipalities` es igual (misma huella `datos_municipios`).
- Los nombres de las filas 30–34 no llevan la versión del archivo. La CLI solo compara versiones; la
  conciliación los deja con el nombre del archivo.

## 3. Procedimiento (ejecutado el 2026-11-07)

Solo toca la tabla de historial `supabase_migrations.schema_migrations`: **no ejecuta ninguna migración ni
cambia el esquema ni los datos del CRM**. `migration repair --status applied` inserta la fila de una versión
y `--status reverted` la borra (documentación de la CLI, `supabase migration repair`). CLI usada: 2.122.0
(`npx supabase`, instalada en el proyecto).

### Paso 0 · Preparación (local)

```bash
git switch main && git pull                 # el repositorio con las 35 migraciones
npx supabase link --project-ref kltekrfpquakyffbpmiv   # pide la contraseña de la base (Supabase → Database)
npx supabase migration list --linked        # debe mostrar 35 solo locales + 35 solo remotas
```

### Paso 1 · Respaldo del historial (Supabase → SQL Editor)

No hay Docker en este equipo, así que `supabase db dump` no sirve; el respaldo se hace en la misma base:

```sql
create table supabase_migrations.schema_migrations_respaldo_20261107 as
  table supabase_migrations.schema_migrations;
select count(*) from supabase_migrations.schema_migrations_respaldo_20261107;   -- 35
```

### Paso 2 · Registrar las 35 versiones del repositorio como aplicadas

```bash
npx supabase migration repair --linked --status applied \
  20261029000100 20261029000200 20261029000300 20261030000100 20261031000100 20261101000100 20261102000100 \
  20261103000100 20261104000100 20261105000100 20261106000100 20261107000100 20261108000100 20261109000100 \
  20261110000100 20261111000100 20261112000100 20261113000100 20261114000100 20261115000100 20261116000100 \
  20261117000100 20261118000100 20261119000100 20261120000100 20261121000100 20261122000100 20261123000100 \
  20261124000100 20261125000100 20261126000100 20261127000100 20261128000100 20261129000100 20261130000100
```

### Paso 3 · Quitar del historial las 35 versiones del MCP

```bash
npx supabase migration repair --linked --status reverted \
  20261107000748 20261107000954 20261107001015 20261107001209 20261107001225 20261107001254 20261107001341 \
  20261107001400 20261107001417 20261107001505 20261107001606 20261107001714 20261107001800 20261107001827 \
  20261107001837 20261107001838 20261107001925 20261107002021 20261107002042 20261107002101 20261107002128 \
  20261107002201 20261107002216 20261107002228 20261107002238 20261107002255 20261107004648 20261107013514 \
  20261107022059 20261107025549 20261107042857 20261107050559 20261107050710 20261107050838 20261107173033
```

### Paso 4 · Verificar

```bash
npx supabase migration list --linked                     # 35 filas con LOCAL = REMOTE, ninguna solo remota
npm run db:pendientes -- --proyecto kltekrfpquakyffbpmiv  # «Sincronizadas: 35 · Pendientes: 0»
```

```sql
select count(*), min(version), max(version) from supabase_migrations.schema_migrations;
-- 35 · 20261029000100 · 20261130000100
```

Huella: ejecuta `scripts/huella-esquema.sql` en el SQL Editor y compárala con `npm run db:huella`. Los 10 tipos
deben coincidir, como antes de conciliar: la reparación no cambia el esquema.

### Paso 5 · Recuperar el historial anterior (solo si algo sale mal)

```sql
begin;
delete from supabase_migrations.schema_migrations;
insert into supabase_migrations.schema_migrations
  select * from supabase_migrations.schema_migrations_respaldo_20261107;
commit;
select count(*) from supabase_migrations.schema_migrations;   -- 35 (versiones 20261107…)
```

Cuando todo esté verificado, el respaldo se puede borrar:
`drop table supabase_migrations.schema_migrations_respaldo_20261107;`.

### Alternativa sin tocar producción (no recomendada)

Renombrar los 35 archivos del repositorio a las versiones del MCP: el orden se conserva y no hay que escribir
en la base. Se descarta porque cambia los nombres que usan la documentación, el historial de git y los demás
entornos, y deja versiones que ya no corresponden a la fecha de cada fase.

## 4. Resultado de la ejecución (2026-11-07)

- **Paso 0:** Luis inició sesión y enlazó la CLI (`supabase/.temp/project-ref` = `kltekrfpquakyffbpmiv`). Antes:
  35 solo locales y 35 solo remotas, como se esperaba.
- **Paso 1:** respaldo `supabase_migrations.schema_migrations_respaldo_20261107` con 35 filas. Su huella es
  `cff41031d35f559756fccb707d9d01e7`, igual a la del historial original.
- **Pasos 2 y 3:** la CLI respondió «Migration history repaired» para las 35 `applied` y para las 35 `reverted`.
- **Paso 4:**
  - `migration list`: 35 filas, todas con LOCAL = REMOTE, ninguna solo local ni solo remota.
  - `db push --dry-run`: «Remote database is up to date».
  - `npm run db:pendientes`: «Sincronizadas: 35 · Pendientes: 0».
  - SQL: 35 filas, de `20261029000100` a `20261130000100`, sin versiones del MCP.
  - La huella del esquema coincide en los 10 tipos, igual que antes: el esquema no cambió.
  - Los datos tampoco: 0 cuentas y 2 usuarios, como antes.
- **El respaldo sigue en la base.** Se puede borrar cuando Luis lo decida con
  `drop table supabase_migrations.schema_migrations_respaldo_20261107;`.

## 5. Después de conciliar: publicar cambios

Cada migración nueva se publica así, nunca con el MCP ni con semillas:

```bash
npm run db:pendientes -- --proyecto kltekrfpquakyffbpmiv   # revisa: historial y migraciones pendientes
npm run db:publicar   -- --proyecto kltekrfpquakyffbpmiv   # pide escribir el ref y aplica solo las pendientes
```

`db:publicar` se detiene si la CLI está enlazada a otro proyecto o si hay migraciones sin confirmar en git. También se
detiene si el historial remoto tiene versiones que no están en el repositorio. **No vuelvas a aplicar migraciones
con el MCP de Supabase** (`apply_migration`): las registra con otra versión y el historial se desincroniza de nuevo.
