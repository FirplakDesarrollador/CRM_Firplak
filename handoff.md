# Firplak CRM · Handoff

> Estado del proyecto para quien lo retome (persona o asistente de IA). **Se actualiza con cada cambio**, en el
> mismo commit. Última actualización: **2026-11-07**.
> El detalle de cada módulo está en [README.md](README.md); la salida en vivo, en
> [docs/puesta-en-produccion.md](docs/puesta-en-produccion.md); el sistema visual, en [DESIGN.md](DESIGN.md).

---

## 1. Qué es y dónde vive

| | |
|---|---|
| Producto | CRM comercial de Firplak (muebles de baño, duchas, accesorios): cuentas, prospectos, oportunidades, cotizaciones, pedidos, actividades, casos, campañas, metas, pronóstico, indicadores e informes. Interfaz en español (con inglés por usuario), responsive e instalable en el celular. |
| Responsable | Luis Escobar (luis.escobar@firplak.com). TI de Firplak administra GitHub, Supabase y Vercel. |
| Código | `firplak-crm/` · GitHub **público** `FirplakDesarrollador/CRM_Firplak`, rama `main` (subir a `main` despliega producción). |
| Producción | https://crm-firplak.vercel.app (Vercel, despliega solo al subir a `main`). |
| Base de datos | Supabase, proyecto **CRM** (`kltekrfpquakyffbpmiv`, org Firplak SA, us-east-1, Postgres 17). |
| ERP | SAP Business One (Service Layer). |
| Stack | Next.js 16.4 (App Router, TypeScript), React 19.3, Tailwind 4, Supabase (Postgres + Auth + RLS), pg_cron, web-push, servidor MCP. Pruebas: PGlite (`db:test`) y Playwright (`test:e2e`). |

**Datos en producción hoy:** 2 usuarios; Luis empezó a probar: 1 cuenta, 1 oportunidad, 1 cotización y 1 producto,
0 registros demo. Canal de la cuenta (lista de valores): Canal Constructores, Canal Distribución, Canal B2C. Pipelines:
«Proyectos y constructoras» (por defecto) y «Distribución y retail». Listas de precios: «Constructor Nacional»
(estándar, COP), «Distribucion Nacional» (COP) y «Lista exportación USD». Proceso de aprobación activo: «Descuento
superior al 15 %». **0 metas:** las 5 metas de compañía de ejemplo de la semilla antigua se borraron el 2026-11-07 a
pedido de Luis, que cargará las reales en Metas.

## 2. Reglas de trabajo (fijas)

- Al terminar una fase con `npm run db:test`, `npm run lint` y `npm run build` en verde → **commit local sin preguntar**.
  Si cambia la interfaz, también `npm run test:e2e` y una prueba del flujo en `tests/e2e/`.
- **Nunca hacer push** sin que Luis lo pida. El repo es **público**: antes de cada push revisar que no salgan
  claves; nunca subir `.env*` (salvo `.env.example`), `rea/` ni `supabase/setup*.sql`.
- **Aplicar migraciones en producción solo con el visto bueno de Luis**, con
  `npm run db:pendientes -- --proyecto kltekrfpquakyffbpmiv` y luego `npm run db:publicar -- --proyecto kltekrfpquakyffbpmiv`
  (sin semillas; la CLI ya está enlazada en este equipo). **Nunca con el MCP de Supabase** (`apply_migration`):
  registra otra versión y desincroniza el historial. Después de aplicar: verificar y correr el asesor de seguridad.
- **Semillas:** `supabase/seeds/01_configuracion.sql` solo para bases nuevas (se niega si ya hay configuración);
  `02_demo.sql` solo para demo y pruebas (se niega si hay usuarios o datos reales). Nunca semillas en producción.
- Cada cambio de base va en una migración nueva de `supabase/migrations/` con su prueba en `scripts/test-db.mjs`;
  luego `npm run db:types:local`.
- Las claves solo en `.env.local` o en Vercel. `service_role`, `MS365_*`, `SAP_*`, `CRON_SECRET`,
  `SUPABASE_JWT_SECRET`, `RESEND_API_KEY` son solo de servidor.
- No modificar `rea/`; nunca aplicar REA ni copiar de Salesforce.
- SAP: nunca escribir órdenes de venta ni socios de negocio sin volver a preguntar.
- **Mantener este `handoff.md` al día con cada cambio.**

## 3. Cómo correrlo

```bash
npm install
npm run dev:demo      # base en memoria con datos de ejemplo, Microsoft 365 y SAP simulados → http://localhost:3000
npm run db:test       # pruebas de la base (PGlite): 131 comprobaciones
npm run db:huella     # huella del esquema de las migraciones, para comparar con producción
npm run test:e2e      # pruebas de interfaz (Playwright, Chrome instalado): 51 pruebas
npm run lint && npm run build
```

Usuarios del demo (clave `demo1234`): `luis.demo@firplak.com` (admin), `gerente.centro@firplak.com` (gerente,
jefe de Camila), `asesora.centro@firplak.com` (asesora). `test:e2e` levanta su propio demo: no debe haber otro
servidor en el puerto 3000.

## 4. Qué está construido

Fases 1 a 26 (ver la tabla de módulos del README) más los ajustes de noviembre:

| Área | Estado |
|---|---|
| Objetos comerciales | Cuentas, contactos, prospectos (conversión a cuenta *Prospecto* + contacto + oportunidad), oportunidades con pipeline Kanban, productos y listas de precios, cotizaciones, pedidos, casos, campañas, actividades y calendario. |
| Personalización | Listas de valores, **listas dependientes** (p. ej. Segmento según Sector y Mercado), campos personalizados, reglas de validación, automatizaciones (al guardar y programadas), procesos de aprobación en varios pasos, auditoría por campo. |
| Análisis | Indicadores, metas, pronóstico con historial semanal, informes con constructor. |
| Seguridad | RLS en todas las tablas, perfiles y permisos por objeto, jerarquía de roles, equipos de cuenta y de oportunidad, reparto de ingresos. Funciones de la base cerradas a quien no tiene sesión; las internas, también a los usuarios. |
| Datos limpios | Nombres con mayúscula inicial; **País / Departamento / Ciudad** de listas oficiales (249 países ISO, 1.122 municipios DANE); NIT obligatorio solo para clientes **nacionales**; prospectos con Mercado, Sector y Segmento iguales a cuentas. |
| Mercado Internacional | Oportunidades, cotizaciones y pedidos en **USD sin IVA**, convertidos a pesos con la **TRM oficial del día** (datos.gov.co, pg_cron 6:00 a. m. y 12:00 m. Colombia; también manual en Configuración → Monedas). Moneda automática según el mercado de la cuenta. Incoterms en cotizaciones y pedidos. |
| Canales de venta | El **Canal** de la cuenta (obligatorio en cuentas y prospectos) decide: el **pipeline** de sus oportunidades (cada pipeline se liga a un canal en Configuración → Pipelines; al crear la oportunidad o cambiar la cuenta, la etapa pasa a la equivalente del pipeline del canal; si cambia el canal de la cuenta, sus oportunidades abiertas se mueven), la **lista de precios** de sus cotizaciones y pedidos (una lista por canal y moneda, en Productos → Listas de precios) y su **embudo** en Indicadores (uno por canal, sin mezclar). **Lista de cliente:** una cuenta grande puede tener su «Lista de precios propia» con solo sus productos codificados y precios; al cotizar, lo que no esté ahí toma el precio de la lista del canal y la línea queda marcada «No codificado». Un canal sin pipeline (hoy Canal B2C) usa el pipeline por defecto. Migración `20261201000100`. |
| Cotizaciones | Desde la oportunidad («Nueva cotización») o sin ella: si no se elige oportunidad, se crea una con el nombre de la cotización, en el pipeline del canal, cierre = «Válida hasta» y sincronizada. **«Facturar a» es la cuenta** y debe ser la de la oportunidad (la base lo valida). Dirección de facturación, dirección de entrega y condiciones de pago se toman de la cuenta (mientras está en Borrador siguen a la cuenta; presentada queda fija); «Entregar en otra dirección» y «Cambiar condiciones de pago» permiten escribirlas a mano. Las **Condiciones de pago** son una lista de valores de la cuenta (Contado, Anticipado, 8 a 90 días). Líneas desde la lista de precios según moneda, descuento por línea, IVA y flete, PDF, sincronizar con la oportunidad, «Crear pedido» al quedar *Aceptada*. **Aprobación obligatoria:** con más de 15 % de descuento no pasa a *En revisión*, *Aprobada*, *Presentada* ni *Aceptada* por fuera del flujo; cambiar el descuento tras aprobar exige aprobar de nuevo (migración `20261130000100`). |
| Integraciones | Microsoft 365 (Outlook, Teams, Planner, SharePoint), SAP B1 (lectura de cartera e inventario; pedido activado → **oferta de venta**; importación de productos a demanda), servidor MCP con OAuth 2.1 para Claude/ChatGPT, correo con Resend. |
| Celular (PWA) | Instalable; barra inferior de navegación; notificaciones push. En iPhone instalado: cabecera bajo la hora y la isla dinámica, campos a 16 px (sin zoom al enfocar), botón «Guardar» de los formularios encima de la barra inferior. **Sin modo sin conexión** (solo aviso y página propia). |

## 5. Producción (Supabase)

- **Pendiente de aplicar (espera el visto bueno de Luis):** `20261201000100_channels_pricing_billing` (canales, listas
  por canal y de cliente, facturación de cotizaciones, embudos por canal). Además de las columnas y reglas, liga en
  producción «Proyectos y constructoras» → Canal Constructores, «Distribución y retail» → Canal Distribución,
  «Constructor Nacional» → Canal Constructores y «Distribucion Nacional» → Canal Distribución (solo si existen con
  esos nombres). La cotización de prueba que ya existe conserva lo escrito en entrega y condiciones de pago (quedan
  marcadas como manuales). Publicar con `npm run db:publicar -- --proyecto kltekrfpquakyffbpmiv` y luego desplegar
  (push a `main`): el código nuevo necesita la migración.
- 35 migraciones del repo aplicadas (la última, `20261130000100_quote_approval_gate`). Se aplicaron con el MCP,
  que las guardó con **versiones distintas** a los nombres de archivo: un `supabase db push` intentaría correrlas
  todas de nuevo. **Verificado el 2026-11-07 (solo lectura):** las 35 corresponden una a una; 29 idénticas byte a
  byte, 5 iguales sin comentarios y `clean_places` con los municipios descargados del DANE (mismo contenido). La huella
  del esquema coincide en los 10 tipos. **Conciliado el 2026-11-07** con `supabase migration repair`, con visto
  bueno de Luis: 35 sincronizadas, 0 pendientes, esquema y datos sin cambios
  ([docs/conciliacion-migraciones.md](docs/conciliacion-migraciones.md)). El respaldo del historial anterior sigue en
  `supabase_migrations.schema_migrations_respaldo_20261107`, hasta que Luis decida borrarlo.
- Extensiones: `pg_cron` (alertas, automatizaciones programadas, instantánea del pronóstico, TRM `firplak-trm-diaria`)
  y `http` (TRM).
- Ojo con los permisos: en Supabase toda función nueva queda ejecutable por `authenticated`. Las internas
  (`security definer`) necesitan `revoke execute ... from public, anon, authenticated` explícito y entrar en la
  lista de `db:test`. PGlite no reproduce esto.
- Asesor de seguridad (2026-11-07): sin hallazgos nuevos. Quedan los conocidos: funciones OAuth/MCP abiertas a
  `anon` a propósito, ~60 funciones de la app ejecutables por usuarios (con sus propias validaciones),
  *Leaked password protection* desactivado (se activa en Supabase → Auth).

## 6. Pendientes

### Decisiones de negocio (Luis está usando la app para encontrarlas)
- **Cargar productos y precios** (desde SAP o CSV): sin ellos no se pueden cotizar líneas en producción.
- Crear los usuarios reales (hoy hay 2) con su jefe directo: lo usan las aprobaciones y la jerarquía.
- Zona comercial derivada del departamento.
- Pipeline del Canal B2C: crearlo en Configuración → Pipelines y elegir «Canal B2C» (mientras tanto usa el por defecto).
- Asignar el canal a las listas de precios que falten y crear las listas de cliente que se necesiten (Productos →
  Listas de precios) y elegirlas en la ficha de cada cuenta grande.
- Campos de oportunidad solo para Constructores.
- Revisar listas genéricas: Tipo de oportunidad, Origen, Motivo de pérdida, Familias.
- B2C: personas naturales con cédula.
- Mapeo de Segmentos por Mercado y Canal (falta la tabla de Luis).

### Modo sin conexión (opción B «visitas»), solo cuando Luis apruebe datos y procesos
Fases: borradores locales → bandeja de salida (actividades, notas, contactos, prospectos) → «Descargar mi cartera»
de solo lectura → (opcional) editar oportunidades con aviso de conflicto. Luis dirá dónde se quedan sin señal,
qué necesitan con urgencia y si usan iPhone o Android.

### Técnicos conocidos
- Si se cambia la cuenta de una oportunidad, sus cotizaciones conservan la cuenta anterior (la validación «Facturar a =
  cuenta de la oportunidad» corre al crear o cambiar la cotización).
- Importar cuentas o prospectos ahora exige la columna Canal (es obligatorio).
- Informes de cotizaciones/pedidos suman monedas mezcladas (COP + USD) sin convertir.
- Al convertir un prospecto internacional, el valor del formulario da error salvo que sea 0.
- Cambiar el mercado de una cuenta no actualiza la moneda de sus oportunidades abiertas.
- Columna obsoleta `controlling_values` en dependencias de listas.
- 184 filas huérfanas en `field_history`.
- `.env.local` apunta a producción: `npm run dev` trabaja con datos reales (usar `dev:demo` para probar).

### Por confirmar en un iPhone real
Cabecera con más aire bajo la hora, campos sin zoom y botón «Guardar» sobre la barra inferior (probado en
Chrome con área segura simulada, no en el dispositivo).

## 7. Registro de cambios recientes

| Fecha | Commit | Cambio | Producción |
|---|---|---|---|
| 2026-11-07 | `3a60f07` | Canales de venta: pipeline y lista de precios por canal, lista propia del cliente («No codificado»), «Facturar a» = cuenta de la oportunidad (o se crea la oportunidad), direcciones y condiciones de pago desde la cuenta con opción manual, Canal obligatorio, un embudo por canal en Indicadores. | Migración `20261201000100` **pendiente**; sin desplegar |
| 2026-11-07 | — | Borradas en producción las 5 metas de compañía de ejemplo (Luis cargará las reales). | Datos: 0 metas |
| 2026-11-07 | `4fb30e2`, `e882886` (rama `codex/migraciones-seguras`, fusionada en `main`) | Semillas separadas (configuración / demo) con salvaguardas; `db:publicar` y `db:pendientes` con destino explícito y sin semillas; huella del esquema; correspondencia de las 35 migraciones y procedimiento de conciliación. | Historial conciliado en producción (35/35); desplegado (sin cambios visibles en la app) |
| 2026-11-07 | `079f13b` | Celular: «Guardar» de los formularios encima de la barra inferior; lint ignora `test-results/`. | Desplegado |
| 2026-11-07 | `0d9f6d0` | Cotizaciones con descuento alto no se presentan sin aprobación. | Migración aplicada y probada |
| 2026-11-07 | `7e62430` | iPhone instalado: más aire bajo la hora; sin zoom al enfocar campos. | Desplegado |
| 2026-11-07 | `5a40baa` | iPhone instalado: cabecera bajo la hora y la isla dinámica. | Desplegado |
| 2026-11-07 | `08e3711` | Funciones internas de la TRM cerradas a los usuarios. | Migración aplicada |
| 2026-11-06 | `c9103df` | País, departamento y ciudad de listas oficiales. | Migración aplicada (municipios del DANE) |
| 2026-11-06 | `38ad02b` | Mercado Internacional en USD sin IVA con TRM oficial. | Migración aplicada |
| 2026-11-06 | `c0dceb9` | Prospectos alineados con cuentas; NIT solo nacionales. | Migración aplicada |
| 2026-11-06 | `7ba8ea4` | Nombres limpios (mayúscula inicial). | Migración aplicada |
| 2026-11-06 | `26d0b7c`, `ca85a56` | Mercado en cuentas y listas dependientes. | Migraciones aplicadas |
| 2026-11-06 | `97524a3` | Funciones de la base cerradas a quien no tiene sesión. | Migración aplicada |
| 2026-11-06 | — | Instalación de producción en Supabase (26 migraciones + configuración base, sin datos de ejemplo). | — |
| 2026-11-03 | `b7de910` … `19c4db8` | Rediseño visual (vidrio, navy, oliva y negro), analítica en celular y ajustes de menús. | — |
| Oct–nov 2026 | `9a02f98` … `ac0aa77` | Fases 1 a 26 (ver README). | — |
