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
| Canales de venta | El **Canal** de la cuenta (obligatorio en cuentas y prospectos) decide: el **pipeline** de sus oportunidades (cada pipeline se liga a un canal en Configuración → Pipelines; al crear la oportunidad o cambiar la cuenta, la etapa pasa a la equivalente del pipeline del canal; si cambia el canal de la cuenta, sus oportunidades abiertas se mueven), la **lista de precios** de sus cotizaciones y pedidos junto con el **Mercado** de la cuenta (ver «Listas por mercado») y su **embudo** en Indicadores (uno por canal, sin mezclar). **Lista de cliente:** una cuenta grande puede tener su «Lista de precios propia» con solo sus productos codificados y precios; al cotizar, lo que no esté ahí toma el precio de la lista del canal y la línea queda marcada «No codificado». Un canal sin pipeline (hoy Canal B2C) usa el pipeline por defecto. Migración `20261201000100`. |
| Listas por mercado | Cada lista es de un **mercado** (Nacional en COP, Internacional en USD; la moneda sale del mercado) y de un canal: una activa por mercado y canal, y una general por mercado. Al cotizar o pedir se usa, dentro del mercado de la cuenta: su lista propia (de su mercado), la de su canal y, solo en Nacional, la general nacional. **Nunca cruza** de mercado, canal ni moneda; sin lista compatible se bloquea con un mensaje hasta crearla (Internacional no usa la general: «Lista exportación USD» queda «Sin uso» hasta tener canal). La base valida todo: lista propia del mismo mercado, cambio de lista de una cotización, sincronizar solo entre igual moneda. **Cambio de mercado de una cuenta:** sus borradores sin productos pasan solos a la moneda y la lista nuevas y su oportunidad abierta los sigue (con la TRM); los borradores con productos quedan en la moneda anterior, sin admitir productos nuevos, con aviso en la cuenta y en la cotización (al quitarles los productos pasan solos); las presentadas y los pedidos no cambian. La marca «estándar» ya no decide. Migración `20261202000100`. |
| Cotizaciones | Desde la oportunidad («Nueva cotización») o sin ella: si no se elige oportunidad, se crea una con el nombre de la cotización, en el pipeline del canal, cierre = «Válida hasta» y sincronizada. **«Facturar a» es la cuenta** y debe ser la de la oportunidad (la base lo valida). Dirección de facturación, dirección de entrega y condiciones de pago se toman de la cuenta (mientras está en Borrador siguen a la cuenta; presentada queda fija); «Entregar en otra dirección» y «Cambiar condiciones de pago» permiten escribirlas a mano. Las **Condiciones de pago** son una lista de valores de la cuenta (Contado, Anticipado, 8 a 90 días). Líneas desde la lista de precios según moneda, descuento por línea, IVA y flete, PDF, sincronizar con la oportunidad, «Crear pedido» al quedar *Aceptada*. **Aprobación obligatoria:** con más de 15 % de descuento no pasa a *En revisión*, *Aprobada*, *Presentada* ni *Aceptada* por fuera del flujo; cambiar el descuento tras aprobar exige aprobar de nuevo (migración `20261130000100`). |
| Integraciones | Microsoft 365 (Outlook, Teams, Planner, SharePoint), SAP B1 (lectura de cartera e inventario; pedido activado → **oferta de venta**; importación de productos a demanda), servidor MCP con OAuth 2.1 para Claude/ChatGPT, correo con Resend. |
| Celular (PWA) | Instalable; barra inferior de navegación; notificaciones push. En iPhone instalado: cabecera bajo la hora y la isla dinámica, campos a 16 px (sin zoom al enfocar), botón «Guardar» de los formularios encima de la barra inferior. **Sin modo sin conexión** (solo aviso y página propia). |

## 5. Producción (Supabase)

- **37 migraciones aplicadas**; la última, `20261202000100_price_books_market`, el 2026-11-07 con `db:publicar` y visto
  bueno de Luis (historial 37/37, 0 pendientes): listas con mercado («Constructor Nacional» y «Distribucion Nacional» →
  Nacional · COP; «Lista exportación USD» → Internacional · general, sin uso hasta asignarle canal); COT-1003 y «Prueba»
  sin cambios. Antes, `20261201000100_channels_pricing_billing`, también con `db:publicar`. Ligó en producción «Proyectos y constructoras» y
  «Constructor Nacional» → Canal Constructores, «Distribución y retail» y «Distribucion Nacional» → Canal Distribución;
  «Lista exportación USD» quedó general. La cotización de prueba COT-1002 conservó su entrega y condiciones de pago
  (marcadas como manuales). La oportunidad de prueba «Prueba» (anterior a la regla) se movió a mano, con visto
  bueno de Luis, de «Proyectos y constructoras» · Prospección a «Distribución y retail» · Contacto inicial (canal de su cuenta).
- Historia previa: las primeras 35 migraciones (hasta `20261130000100_quote_approval_gate`). Se aplicaron con el MCP,
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
- Asesor de seguridad (2026-11-07, tras la migración de listas por mercado): sin hallazgos nuevos. Quedan los conocidos: funciones OAuth/MCP abiertas a
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
- **Listas por mercado (ya en producción), falta crear:** una lista Internacional por cada canal que
  venda al exterior (p. ej. «Distribución Internacional»; o asignarle un canal a «Lista exportación USD», hoy general y sin
  uso) y, para el Canal B2C nacional, su lista o una lista general nacional. Mientras falten, esas cotizaciones se bloquean.
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
- Cambio de mercado de una cuenta (resuelto en `20261202000100`): una oportunidad abierta con
  cotizaciones presentadas, con productos o con pedidos se queda en la moneda anterior; se ve en el aviso de la cuenta.
- Columna obsoleta `controlling_values` en dependencias de listas.
- 184 filas huérfanas en `field_history`.
- `.env.local` apunta a producción: `npm run dev` trabaja con datos reales (usar `dev:demo` para probar).

### Por confirmar en un iPhone real
Cabecera con más aire bajo la hora, campos sin zoom y botón «Guardar» sobre la barra inferior (probado en
Chrome con área segura simulada, no en el dispositivo).

## 7. Registro de cambios recientes

| Fecha | Commit | Cambio | Producción |
|---|---|---|---|
| 2026-11-07 | `HASH_PDF` | Cotización: el campo «Notas» pasa a **«Observaciones»** (comentarios para el cliente, se imprimen). PDF: «Dirección de facturación» y «Dirección de entrega» con su título (la de entrega es la de facturación si no se escribió otra), condiciones con su nombre completo e Incoterm, bloque propio de «Observaciones», y ningún bloque ni la firma quedan partidos entre páginas. e2e del PDF. | Sin push: falta desplegar |
| 2026-11-07 | `6c5578a` | Listas de precios por **mercado** además del canal (decisiones de Luis): mercado obligatorio en cada lista (la moneda sale de él), selección dentro del mercado de la cuenta sin cruces de mercado, canal ni moneda, bloqueo con mensaje si falta la lista (Internacional sin lista general; Nacional admite general nacional), validaciones en la base, cambio de mercado de una cuenta (borradores sin productos pasan solos, con productos se avisan; presentadas y pedidos no cambian). Pantallas: Mercado en Listas de precios (se quita «Estándar»), mercado en la ficha del producto y en la lista propia de la cuenta, avisos en cuenta y cotización. 134 comprobaciones de base y e2e del flujo. | Migración `20261202000100` aplicada con `db:publicar` y visto bueno de Luis (37/37); desplegado |
| 2026-11-07 | `ff7fca2` | Tablas: la columna que sigue a una de cifras toma más aire a la izquierda (título y dato), para que no quede pegada al monto (Valor → Cierre en Inicio y Oportunidades, Total neto → Válida hasta / Propietario en Cotizaciones y Pedidos). Productos de cotización y pedido: Cantidad y Desc. % centrados (título y dato), y en el formulario de agregar, Cantidad, Precio (opcional) y Desc. % centrados (pedido de Luis). | Sin push: falta desplegar |
| 2026-11-07 | `8163618` | Tablas: el título de cada columna toma la misma alineación que su dato (montos, números y porcentajes a la derecha; Sí/No al centro), en las listas de los módulos y en las pestañas de registros relacionados (p. ej. «Valor» en Oportunidades, «Total neto» en Cotizaciones y Pedidos, «Total» y «Sincronizada» en la pestaña Cotizaciones de una oportunidad). Revisada toda la app: Inicio y las demás tablas ya estaban alineadas. Prueba e2e de alineación. | Sin push: falta desplegar |
| 2026-11-07 | `6fcbab9` | Regla de números en toda la app: cantidades y descuentos de cotizaciones y pedidos, campos numéricos y de porcentaje (Empleados, Probabilidad, IVA %, campos personalizados), metas de conteo y duración de actividades también agrupan miles y usan punto decimal al escribir; el servidor los lee con `parseAmount`. | Sin push: falta desplegar |
| 2026-11-07 | `d32fbe6` | PRODUCT.md al día: posicionamiento (hecho al proceso Firplak), roles, canales con su pipeline y lista, listas de cliente, mercados COP/USD, «Facturar a» y formato de números (coma de miles, punto decimal) en toda la app. `.impeccable/config.json`: las páginas de presentación se construyen directo a código. | Documentación |
| 2026-11-07 | `6ca853a` | Campos de dinero con separadores de miles mientras se escribe (coma de miles, punto decimal; la coma del teclado del iPhone cuenta como decimal; pegar «$ 1.250.000» se interpreta): cuentas y prospectos (Ingresos anuales, Cupo de crédito y cualquier campo de moneda), oportunidades (Valor, Valor en USD), cotizaciones y pedidos (Precio unit., Flete), precios por lista del producto, conversión de prospecto, metas en pesos y TRM manual. Un solo componente `AmountInput`; tras guardar, el campo muestra el valor nuevo. | Sin push: falta desplegar |
| 2026-11-07 | `3fea9e2` | Cotizaciones y pedidos: los títulos de la tabla de productos (Cantidad, Precio unit., Desc. %, Total) quedan sobre su columna, también en el formulario de agregar; una sola plantilla de columnas fija. `.claude/launch.json` suma `firplak-crm-demo` (`dev:demo`) para revisar sin tocar producción. | Sin push: falta desplegar |
| 2026-11-07 | — | Oportunidad de prueba «Prueba» movida al pipeline de su canal (Distribución y retail · Contacto inicial). | Datos |
| 2026-11-07 | `64d9d84` | `db:publicar` leía 0 pendientes con la tabla de la CLI en terminal (comillas invertidas); corregido con prueba. | Desplegado |
| 2026-11-07 | `1a61057` | Canales de venta: pipeline y lista de precios por canal, lista propia del cliente («No codificado»), «Facturar a» = cuenta de la oportunidad (o se crea la oportunidad), direcciones y condiciones de pago desde la cuenta con opción manual, Canal obligatorio, un embudo por canal en Indicadores. | Migración `20261201000100` aplicada; desplegado (Vercel OK) |
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
