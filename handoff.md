# Firplak CRM · Handoff

> Estado del proyecto para quien lo retome (persona o asistente de IA). **Se actualiza con cada cambio**, en el
> mismo commit. Última actualización: **2026-11-10**.
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
npm run dev:demo -- --produccion   # lo mismo con la app compilada (`next build` + `next start`): para probar sin señal
npm run dev:demo -- --vercel       # compilada y con los archivos donde los deja Vercel (/_next/static/immutable/…)
npm run db:test       # pruebas de la base (PGlite): 149 comprobaciones
npm run db:huella     # huella del esquema de las migraciones, para comparar con producción
npm run test:e2e      # pruebas de interfaz (Playwright, Chrome instalado): 71 pruebas
npm run lint && npm run build
```

Usuarios del demo (clave `demo1234`): `luis.demo@firplak.com` (admin), `gerente.centro@firplak.com` (gerente,
jefe de Camila), `asesora.centro@firplak.com` (asesora). `test:e2e` levanta su propio demo: no debe haber otro
servidor en el puerto 3000.

**App de iPhone (prototipo, carpeta `mobile/`):** proyecto aparte con sus propias dependencias; necesita Xcode.

```bash
cd mobile && npm install
npm run sync          # la app abre el CRM publicado (https://crm-firplak.vercel.app)
npm run sync:local    # la app abre http://localhost:3000 (con `npm run dev:demo` corriendo en la raíz)
npm run open          # abre el proyecto en Xcode: elegir un simulador y Ejecutar
npm run assets        # regenera el ícono y la pantalla de arranque desde el sello de `public/brand/`
```

Para instalarla en un iPhone conectado por cable (con el Apple ID personal: dura 7 días y hay que repetirlo). El
equipo y el identificador de prueba se pasan en el comando, **no se guardan en el proyecto** (el repositorio es
público y `com.firplak.crm` queda libre para la cuenta de Firplak):

```bash
xcrun devicectl list devices                                   # el identificador del iPhone
defaults read com.apple.dt.Xcode IDEProvisioningTeamByIdentifier   # el `teamID` del Apple ID agregado en Xcode
cd mobile/ios/App
xcodebuild -project App.xcodeproj -scheme App -configuration Debug -destination 'id=<IPHONE>' \
  -derivedDataPath /tmp/crm-iphone -allowProvisioningUpdates \
  DEVELOPMENT_TEAM=<EQUIPO> PRODUCT_BUNDLE_IDENTIFIER=com.firplak.crm.prueba build
xcrun devicectl device install app --device <IPHONE> /tmp/crm-iphone/Build/Products/Debug-iphoneos/App.app
```

Antes, una sola vez: agregar el Apple ID en Xcode → Settings → Accounts, crear ahí el certificado «Apple Development»
(Manage Certificates → +) y activar el Modo de desarrollador en el iPhone (Ajustes → Privacidad y seguridad). Después
de instalar, en el iPhone: Ajustes → General → VPN y gestión de dispositivos → confiar en el desarrollador.

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
| Canales de venta | El **Canal** de la cuenta (obligatorio en cuentas y prospectos) decide: el **pipeline** de sus oportunidades junto con el **Mercado** (cada pipeline es de un mercado y un canal en Configuración → Pipelines, que permite «Duplicar» uno con sus etapas a otro mercado; al crear la oportunidad o cambiar la cuenta, la etapa pasa a la equivalente del pipeline de su mercado y canal; si cambia el mercado o el canal de la cuenta, sus oportunidades abiertas se mueven; si falta el pipeline, se bloquea con un mensaje, migración `20261203000100`), la **lista de precios** de sus cotizaciones y pedidos junto con el **Mercado** de la cuenta (ver «Listas por mercado») y su **embudo** en Indicadores (uno por mercado y canal, sin mezclar). **Lista de cliente:** una cuenta grande puede tener su «Lista de precios propia» con solo sus productos codificados y precios; al cotizar, lo que no esté ahí toma el precio de la lista del canal y la línea queda marcada «No codificado». Migración `20261201000100`. |
| Listas por mercado | Cada lista es de un **mercado** (Nacional en COP, Internacional en USD; la moneda sale del mercado) y de un canal: una activa por mercado y canal, y una general por mercado. Al cotizar o pedir se usa, dentro del mercado de la cuenta: su lista propia (de su mercado), la de su canal y, solo en Nacional, la general nacional. **Nunca cruza** de mercado, canal ni moneda; sin lista compatible se bloquea con un mensaje hasta crearla (Internacional no usa la general: «Lista exportación USD» queda «Sin uso» hasta tener canal). La base valida todo: lista propia del mismo mercado, cambio de lista de una cotización, sincronizar solo entre igual moneda. **Cambio de mercado de una cuenta:** sus borradores sin productos pasan solos a la moneda y la lista nuevas y su oportunidad abierta los sigue (con la TRM); los borradores con productos quedan en la moneda anterior, sin admitir productos nuevos, con aviso en la cuenta y en la cotización (al quitarles los productos pasan solos); las presentadas y los pedidos no cambian. La marca «estándar» ya no decide. Migración `20261202000100`. |
| Cotizaciones como partes | Las cotizaciones de una oportunidad son **partes del negocio** (decisión de Luis). **Valor** de la oportunidad abierta = suma de sus partes abiertas (sin Aceptadas, Rechazadas ni Reemplazadas), automático; ganada = suma de las aceptadas; perdida conserva su valor; sin cotizaciones (o solo borradores vacíos) lo escribe el asesor. Ya no hay «Sincronizar». **Parte aceptada con otras abiertas:** se separa en su propia oportunidad **Ganada** (misma cuenta, asesor, pipeline y reparto; cierre hoy; «Parte ganada de» la original, que la lista en «Partes ganadas») y se lleva sus pedidos; la última abierta aceptada gana la original. **Etapas solo hacia adelante:** cada pipeline marca en «Avanza con cotización» (Configuración → Pipelines) la etapa «Al presentar la primera cotización» y la de «Al aceptarse una parte (quedan otras abiertas)». La última parte abierta rechazada sin ninguna aceptada avisa al asesor y a su jefe; «Reemplazada» (versión anterior) no suma ni avisa. Marcar Perdida rechaza las partes abiertas y no se permite con partes aceptadas o pedidos activos; una oportunidad cerrada no admite cotizaciones nuevas; un pedido cancelado avisa. Migración `20261204000100`. |
| Cotizaciones | Desde la oportunidad («Nueva cotización») o sin ella: si no se elige oportunidad, se crea una con el nombre de la cotización, en el pipeline del canal, cierre = «Válida hasta» y sincronizada. **«Facturar a» es la cuenta** y debe ser la de la oportunidad (la base lo valida). Dirección de facturación, dirección de entrega y condiciones de pago se toman de la cuenta (mientras está en Borrador siguen a la cuenta; presentada queda fija); «Entregar en otra dirección» y «Cambiar condiciones de pago» permiten escribirlas a mano. Las **Condiciones de pago** son una lista de valores de la cuenta (Contado, Anticipado, 8 a 90 días). Líneas desde la lista de precios según moneda, descuento por línea, IVA y flete, PDF, «Crear pedido» al quedar *Aceptada*. **Aprobación obligatoria:** con más de 15 % de descuento no pasa a *En revisión*, *Aprobada*, *Presentada* ni *Aceptada* por fuera del flujo; cambiar el descuento tras aprobar exige aprobar de nuevo (migración `20261130000100`). |
| Integraciones | Microsoft 365 (Outlook, Teams, Planner, SharePoint), SAP B1 (cartera e inventario por agente dentro de la red, ver `agente-sap/`; pedido activado → **oferta de venta**; importación de productos a demanda), servidor MCP con OAuth 2.1 para Claude/ChatGPT, correo con Resend. |
| Celular (PWA) | Instalable, con ícono propio (sello: «A» de Firplak y «CRM» en Outfit Bold, `public/brand/firplak-crm-sello-white.svg`; `node scripts/generate-icons.mjs` regenera los PNG); barra inferior de navegación; notificaciones push. En iPhone instalado: cabecera bajo la hora y la isla dinámica, campos a 16 px (sin zoom al enfocar), botón «Guardar» de los formularios encima de la barra inferior. **Sin conexión, fase 1 (borradores):** lo que se escribe en el formulario de un registro o en el de actividades queda como borrador en el dispositivo (`src/lib/drafts.ts`, `useFormDraft`), se recupera al volver a abrirlo y no se pierde si al guardar no hay internet; todavía no se crean registros sin conexión. **Sin conexión, parte A (consulta):** «Preparar el día» (tarjeta en Inicio y en el menú de usuario → «Consulta sin señal») baja al dispositivo los clientes del asesor con sus contactos, sus oportunidades abiertas, su agenda de 7 días y el catálogo con precios; la pantalla `/sin-conexion` los muestra sin red, con el precio de cada cliente calculado en el teléfono. **Sin conexión, parte B (bandeja de salida):** en esa misma pantalla, sin señal, se crea un cliente y se registran actividades (tarea, llamada, reunión, correo, nota); quedan en el dispositivo y se envían solos al CRM cuando vuelve la conexión, cada uno Pendiente, Enviado o Rechazado con su motivo; la cabecera del CRM dice «N sin enviar». **Sin conexión, parte C (cotizaciones):** desde la ficha del cliente o la pestaña Productos se arma una cotización sin señal, con el precio que le toca a ese cliente y los totales con IVA calculados en el teléfono; queda «Sin enviar» con número provisional (`PROV-…`) y al volver la señal llega al CRM como borrador con su número oficial. Si el precio de lista cambió desde la descarga, se respeta el cotizado y la línea queda marcada «Cotizado sin señal» (detalle y límites en la sección 6). |
| App de iPhone (prototipo) | `mobile/`: app nativa hecha con **Capacitor 8** (Swift Package Manager, sin CocoaPods) que abre el CRM publicado dentro de una vista web; **la app web no cambia** y cada despliegue de `main` se ve en la app sin recompilar. Identificador `com.firplak.crm`, nombre «Firplak CRM», iOS 15 o superior, ícono y pantalla de arranque con el sello. Lo propio de la app se inyecta desde `CrmViewController` (`mobile/ios/App/App/AppDelegate.swift`): el CRM se comporta como «instalado», campos a 16 px (sin zoom al escribir), la pantalla de arranque se quita al cargar, la hora y la batería cambian de color según el fondo que tengan debajo, y deslizar desde el borde izquierdo vuelve atrás. Sin señal muestra «Sin conexión» con «Reintentar» (`mobile/www/error.html`). **Bloqueo con Face ID** (`mobile/ios/App/App/Bloqueo.swift`, enganchado en `SceneDelegate.swift`): una ventana con la pantalla del sello tapa la app y pide Face ID (o Touch ID; si falla, el código del iPhone) al abrirla y al volver después de 5 minutos fuera, solo si hay sesión iniciada (cookie `sb-…-auth-token` de la vista web); en la pantalla de ingreso no pide nada. No guarda contraseñas ni toca la sesión del CRM. La app también se tapa siempre que deja de estar en primer plano, para que el selector de apps no muestre datos de clientes. Si se cancela o la cara no coincide queda el botón «Desbloquear con Face ID». Un iPhone sin código no se bloquea. Para probar, el argumento de arranque `-bloqueoGracia 5` (solo en compilación de depuración) acorta los 5 minutos a 5 segundos. Probada solo en el simulador (iPhone 18 Pro Max, iOS 27.2). |

## 5. Producción (Supabase)

- **Configuración comercial cargada el 2026-11-13 (datos, no migraciones).** Luis autorizó a Claude a cargarla por SQL
  cuando él lo pida (nunca por iniciativa propia); los nombres y correos están fuera del repositorio. Quedó: **27 roles**
  (Gerente General → Director Comercial → 11 roles de ejecutivo, seis de ellos con las dos casillas de compartir y su
  rol «Promotores …» debajo; «Coordinación B2C» con «Comparten clientes» y debajo tres tiendas y Ecommerce; Servicio al
  Cliente, Mercadeo y Logística bajo la Gerencia General); perfiles nuevos «Coordinador comercial», «Promotor» y
  «Mercadeo», y «Servicio al cliente» ajustado; **cuentas y contactos en Privado**; **26 territorios** (comprobado: los
  1.122 municipios tienen exactamente un asesor en Distribución y uno en Constructores; B2C, todo el país). **21 usuarios
  creados directo en la base** (`auth.users` + `auth.identities`, correo confirmado, sin contraseña y **suspendidos**
  con `banned_until` a diez años): no se envió ningún correo y nadie puede entrar todavía, por decisión de Luis. El
  servicio de ingreso los lee sin error (un intento con clave inventada responde 400, no 500). **Para abrirles la
  entrada** hay que quitar la suspensión y darles cómo poner su contraseña (no está construido; probar el recorrido
  completo con un usuario antes del lanzamiento, porque no se crearon con la API de administración: la clave
  `service_role` no está en `.env.local`). Faltan: promotores y personas de Servicio al Cliente, Mercadeo y Logística
  (Luis envía la lista). Hallazgo: los dos usuarios que ya existían tenían el rol en blanco y la Directora Comercial,
  también el perfil de permisos; se restauraron (causa sin identificar, anterior a la carga).
- **52 migraciones aplicadas, 0 pendientes.** Las dos últimas el 2026-11-14 con `db:publicar` (confirmación de Luis en
  el panel Terminal): `20261216000100_sap_import_kits` y `20261217000100_orders_delete_by_permission`. Comprobado: la
  política «pedidos: eliminar» ya no mira el estado; `sap_agent_import_products` enlaza componentes de kits y sigue sin
  permiso para `anon`. Asesor de seguridad sin cambios (2, 4, 74 y 1). Con «Eliminar» en Pedidos están hoy los perfiles
  Gerente comercial y Coordinador comercial, además del administrador.
- Antes: 50. La anterior, `20261215000100_sap_import_family_plant_group`, el 2026-11-14
  con `db:publicar` (confirmación de Luis en el panel Terminal). Comprobado: una sola versión de
  `sap_agent_import_products` (filas, familia, planta), sin permiso para `anon`. Asesor de seguridad sin cambios
  (2, 4, 74 y 1). Quedan en `sap_requests` dos solicitudes de vista previa de prueba, creadas por Claude.
- Antes: 49. La anterior, `20261214000100_sap_requests`, el 2026-11-14 con `db:publicar`
  (revisión por Claude, confirmación de Luis en el panel Terminal). Comprobado después: tabla `sap_requests` con RLS y
  solo políticas de lectura e inserción; las tres funciones nuevas del agente sin permiso para `anon`. Asesor de
  seguridad: mismos avisos más **tres esperados** en funciones definer con sesión (de 71 a 74). Queda en la tabla una
  solicitud de prueba de vista previa, creada por Claude para comprobar el agente.
- Antes: 48. La anterior, `20261213000100_sap_agent_snapshots`, el 2026-11-14 con
  `db:publicar` (revisión por Claude, confirmación escrita por Luis en el panel Terminal). Comprobado después: tablas
  `sap_partners`, `sap_items` y `sap_sync_runs` con RLS y una política de lectura cada una (sin políticas de escritura);
  `is_sap_agent` sin permiso de ejecución para `anon` ni `authenticated`; las cuatro `sap_agent_*` solo para
  `authenticated` (exigen el perfil del agente); perfil «Integración SAP» creado. Asesor de seguridad: mismos avisos más
  **cuatro esperados** en funciones definer con sesión (pasa de 67 a 71), las `sap_agent_*`. Código en `main` (`dfbc59c`).
- Antes: 47. Las tres anteriores el 2026-11-13 con `db:publicar` (revisión por Claude,
  confirmación escrita por Luis en el panel Terminal): `20261210000100_role_sharing_and_directory`,
  `20261211000100_zones_and_territories` y `20261212000100_role_sharing_business`. Comprobado después: columnas
  `roles.share_within` y `share_business`, `accounts.zone` y `destination_port`, `leads.zone`; tablas `territories` y
  `zone_places` con RLS y dos políticas cada una; disparadores `accounts_place_and_territory` y `leads_place_and_territory`;
  una sola versión de `shares_branch_with`, sin permiso de ejecución para `authenticated`; 48 lugares en 8 zonas (33
  departamentos y 15 excepciones por ciudad), ningún departamento sin zona; la cuenta que tenía «Zona comercial» quedó
  con zona «Centro del País» y el campo configurable, inactivo. Asesor de seguridad: los mismos avisos de antes más
  **cuatro esperados** en «funciones definer que puede ejecutar un usuario con sesión» (pasa de 63 a 67):
  `possible_duplicates`, `account_directory`, `territory_owners` y `zone_for_place`, que la app llama con sesión y que
  devuelven solo lo mínimo. Ninguna la puede ejecutar `anon`. El código quedó publicado el mismo día (`main` en `5dc99fc`).
- Antes de esas: 44 de 44. La última, `20261209000100_product_kits`, el 2026-11-13 con `db:publicar`
  (revisión por Claude, confirmación escrita por Luis en el panel Terminal). Comprobado después: `products.is_kit`
  (booleano, por defecto falso), tabla `product_kit_components` con RLS y sus dos políticas, disparadores
  `products_kit_rules` y `product_kit_components_rules`, las dos funciones nuevas sin permiso de ejecución para `anon` ni
  `authenticated`, la excepción de kits en `enforce_picklist_dependencies` y 44 de 44 en el historial. Asesor de
  seguridad sin hallazgos nuevos (mismos conteos: 2, 4, 63 y 1).
- Antes de esa: `20261208000100_product_plant_item_group` (columnas
  `products.plant` y `products.item_group`), el 2026-11-13 con `db:publicar`: Luis autorizó a Claude a correr la revisión y
  él mismo escribió la confirmación en la terminal. Comprobado después: las dos columnas (texto, opcionales), sus dos
  índices y 43 de 43 en el historial; asesor de seguridad sin hallazgos nuevos (la migración no crea funciones).
- Antes de esa: 42 de 42. Las dos últimas, las del modo sin conexión, el 2026-11-10 con
  `db:publicar` y visto bueno de Luis (42/42). Comprobado en producción después de aplicar:
  - `20261206000100_offline_snapshot` (función `offline_snapshot()` de «Preparar el día»): corre con los permisos de
    quien la llama (RLS), cerrada a `public` y `anon` y abierta a `authenticated`; no toca tablas ni datos.
  - `20261207000100_offline_quotes` (columna `quote_line_items.offline_list_price`, `numeric(18,2)` con su chequeo
    de no negativo, y el disparador `quote_line_items_offline_price` activo; su función `quote_line_offline_price()`
    cerrada a `public`, `anon` y `authenticated`, con `search_path` vacío). La columna quedó vacía en todas las
    líneas existentes; no cambió ninguna fila ni ningún total.
  - Asesor de seguridad sin hallazgos nuevos: ninguna de las dos funciones aparece; quedan solo los conocidos.
  - **La interfaz del modo sin conexión quedó desplegada el 2026-11-10** al subir la rama a `main` (`4adf656`,
    con el visto bueno de Luis). Vercel construyó sin errores; en el sitio publicado responden `/login` y
    `/sin-conexion`, el `sw.js` es el v4 y las dos rutas `/api/sin-conexion/*` redirigen al ingreso si no hay
    sesión. **Sin comprobar con una sesión real en producción** («Preparar el día», enviar un registro): eso lo
    prueba Luis con su usuario.
  - **Primera prueba de Luis en su iPhone (2026-11-10): falló abrir lo descargado sin señal.** «Preparar el día»
    descargó bien, pero en modo avión tocar «Actividades» mostró el error de Next en inglés («This page couldn't
    load»). Causa y arreglo en la sección 6 («Abrir sin red»). **El arreglo se subió a `main` ese mismo día**
    (`3270c3c`, con el visto bueno de Luis; avance directo). Vercel construyó sin errores. Comprobado en el sitio
    publicado, sin iniciar sesión: el `sw.js` es el nuevo y `/sin-conexion` nombra 14 archivos, todos en
    `/_next/static/immutable/` (12 scripts) y todos responden; la versión anterior no reconocía ninguno. **Falta
    que Luis repita la prueba en su iPhone** (abrir el CRM una vez con señal, modo avión, navegar).
- Antes, `20261205000100_alerts_plural`, el 2026-11-09 con `db:publicar` y visto bueno de
  Luis (40/40, 0 pendientes): solo texto, el aviso diario dice «Tienes 1 tarea vencida» / «Tienes N tareas vencidas»;
  mismos permisos (`authenticated` ya la ejecutaba desde la fase 5) y el asesor de seguridad sin hallazgos nuevos.
  Antes, `20261204000100_quote_parts_opportunity`, el 2026-11-07 con `db:publicar` y visto
  bueno de Luis (39/39, 0 pendientes): sin marcas de etapa (los pipelines de producción tienen nombres propios); «Prueba»
  sigue Ganada por $16,165,796.21 con COT-1003 Aceptada. Antes, `20261203000100_pipelines_market` (38/38): «Proyectos y constructoras» y «Distribución y retail» quedaron Nacionales; «Prueba» sigue
  en «Distribución y retail». Antes, `20261202000100_price_books_market` (37/37): listas con mercado («Constructor Nacional» y «Distribucion Nacional» →
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
- Asesor de seguridad (2026-11-07, tras la migración de cotizaciones como partes): único nuevo, `sync_quote` como función
  del sistema (a propósito: comprueba que quien llama puede editar la oportunidad y solo recalcula su valor). Quedan los conocidos: funciones OAuth/MCP abiertas a
  `anon` a propósito, ~60 funciones de la app ejecutables por usuarios (con sus propias validaciones),
  *Leaked password protection* desactivado (se activa en Supabase → Auth).

## 6. Pendientes

### SAP por agente (en curso, 2026-11-14)
- **Usuario técnico del agente creado en producción el 2026-11-14** (por SQL, con el visto bueno de Luis): perfil
  «Integración SAP», sin rol, sin correo enviado. Su contraseña se generó al azar en el Mac de Luis y quedó solo en el
  Llavero (servicio `firplak-crm-agente-sap`, cuenta `crm`); a la base solo llegó el hash. Comprobado: entra, no ve
  cuentas, contactos ni oportunidades, y `sap_agent_targets` responde (hoy 0 clientes con Código SAP y 0 productos).
  La configuración sin secretos está en `~/.firplak-crm/agente-sap.json`. Contraseña de SAP en el Llavero (la escribió
  Luis), `probar`, `muestra`, `correr --ahora` e `instalar` hechos el 2026-11-14. **Falta:** Código SAP en las cuentas,
  permiso «Ver información de SAP» en los perfiles y revisar la primera corrida automática.
- **Fase 1 publicada el 2026-11-14** (migración y código). Pasos originales: (2) crear en producción el usuario técnico del agente con el perfil «Integración SAP» (la contraseña la
  escribe Luis; no debe pasar por el chat); (3) en el Mac de Luis: `~/.firplak-crm/agente-sap.json`, las dos
  contraseñas en el Llavero, `probar`, `correr --ahora` e `instalar` (pasos en `agente-sap/LEEME.md`); (4) poner el
  Código SAP en las cuentas y dar «Ver información de SAP» a los perfiles que deban verla.
- **Fase 2 publicada y funcionando desde el 2026-11-14:** importar productos a demanda por medio del agente (cola de
  solicitudes). Para activarla: publicar la migración `20261214000100` y el código, y volver a correr
  `node agente-sap/agente.mjs instalar` en el Mac de Luis.
- **Fase 3 descartada como estaba** (2026-11-14): el Código SAP no sale del NIT (lleva prefijo y sucursal). Variante posible, no pedida: buscar en SAP por el NIT y ofrecer las sucursales que existan.
- **Fase 4:** ventas reales para indicadores y metas, subiendo los CSV mensuales que ya genera `sap_ventas.py`
  (OneDrive de Luis, carpeta «Automatizacion SAP»; 12 columnas, ver su `LEEME.md`).
- **Fase 5 (solo con aprobación aparte de Luis y prueba en una base de pruebas de SAP):** pedido → oferta de venta.
- Mientras el agente viva en el Mac de Luis, depende de que esté encendido y en la red; pasarlo a un equipo fijo.

### Decisiones de negocio (Luis está usando la app para encontrarlas)
- **Cargar productos y precios** (desde SAP o CSV): sin ellos no se pueden cotizar líneas en producción.
- Crear los usuarios reales (hoy hay 2) con su jefe directo: lo usan las aprobaciones y la jerarquía.
- Zona comercial derivada del departamento.
- **Cotizaciones como partes (ya en producción):** marcar en cada pipeline de producción, en «Avanza con
  cotización», la etapa «Al presentar la primera cotización» y la de «Al aceptarse una parte (quedan otras abiertas)» (los de producción tienen nombres propios, p. ej.
  «Presentación de Propuesta» y «Negociación Final», y la migración no los adivina). En «Canal B2C», la etapa «Ganada»
  está como tipo Abierta: cambiarla a Ganada (sin etapa ganada, aceptar la última parte solo avisa).
- **Pipelines por mercado (ya en producción):** los dos actuales son Nacionales. Crear con «Duplicar» los
  Internacionales de Constructores y Distribución (y ajustar sus etapas), y el del Canal B2C nacional. Mientras falten, las
  oportunidades de esas cuentas se bloquean (decisión de Luis).
- Asignar el canal a las listas de precios que falten y crear las listas de cliente que se necesiten (Productos →
  Listas de precios) y elegirlas en la ficha de cada cuenta grande.
- **Listas por mercado (ya en producción), falta crear:** una lista Internacional por cada canal que
  venda al exterior (p. ej. «Distribución Internacional»; o asignarle un canal a «Lista exportación USD», hoy general y sin
  uso) y, para el Canal B2C nacional, su lista o una lista general nacional. Mientras falten, esas cotizaciones se bloquean.
- Campos de oportunidad solo para Constructores.
- Revisar listas genéricas: Tipo de oportunidad, Origen, Motivo de pérdida, Familias.
- B2C: personas naturales con cédula.
- Mapeo de Segmentos por Mercado y Canal (falta la tabla de Luis).

### Modo sin conexión: construido y desplegado; la prueba en iPhone encontró un fallo, ya corregido y publicado; falta repetirla
Luis dio la orden de empezar el 2026-11-09 y ese mismo día aprobó el plan. Los asesores se quedan sin señal en
ascensores, parqueaderos de sótano, obras y oficinas con mala red, y en el avión. Sin señal necesitan, en este orden:
cotizar (informar precios), registrar actividades y crear un cliente. La fuerza comercial usa la **app web (PWA) en
iPhone y Android**; la app nativa de iPhone es solo un prototipo que prueba Luis.

**Cómo lo usa un asesor (plan aprobado):**
1. En la mañana, con wifi, toca **«Preparar el día»** y el teléfono descarga productos y precios, sus clientes con
   contactos y direcciones, sus oportunidades abiertas y su agenda. La app dice «Descargado hoy, 7:12 a. m.» y avisa
   cuando la descarga es de otro día.
2. Sin señal consulta todo lo descargado y además crea un cliente, registra actividades y arma cotizaciones. El
   teléfono calcula el precio con la regla del CRM: la lista propia del cliente y, si no, la de su canal y mercado.
3. Al volver la señal todo se envía solo, en orden (clientes, luego sus cotizaciones y actividades). Cada registro
   queda **Pendiente**, **Enviado** o **Rechazado** (con el motivo) y la cabecera dice «3 sin enviar».

**Decisiones de Luis (2026-11-09):**
1. Si el precio cambió entre la descarga y el envío, **se respeta el cotizado** (la línea se marca y se le avisa).
2. Cada asesor descarga **solo sus clientes**.
3. Una cotización sin enviar se ve en pantalla marcada «Sin enviar» con número provisional; el número oficial y el
   PDF salen al sincronizar.
4. Al cerrar sesión con registros sin enviar, se avisa y se conservan hasta que entre la misma persona.
5. Acepta que precios y cartera queden sin cifrar en el teléfono; lo descargado se borra al cerrar sesión (la
   excepción es la bandeja de salida sin enviar).
6. iPhone y Android, por la app web; no contar todavía con la app de Apple.

**Orden de construcción:** A. descarga y consulta (**hecha**) → B. bandeja de salida con actividades y crear cliente
(**hecha**) → C. cotizaciones sin señal (**hecha**). Cada parte con sus pruebas y su commit.

**Lo que falta para que lo usen los asesores:** probarlo de nuevo en un iPhone y un Android reales, instalado como
app web, con una sesión de producción: abrir el CRM una vez con señal (la pantalla guardada se completa sola) o
tocar «Actualizar», poner modo avión y navegar. Las dos migraciones están en producción y la interfaz, con el
arreglo de «Abrir sin red», está desplegada en `main` desde el 2026-11-10 (sección 5).

- **Borradores (antes «fase 1»), cómo quedó:** el formulario de cualquier registro (`RecordForm`) y el de actividades de las fichas
  (`Composer`) guardan lo escrito en `localStorage` (`crm:borrador:<usuario>:<dirección>`), 400 ms después de la
  última tecla y al salir o esconder la app. Al volver a abrir el formulario se recupera con un aviso y el botón
  «Descartar borrador». Guardar sin internet no llama al servidor: avisa «Sin conexión: no se guardó…» y conserva
  todo; si el envío falla a mitad de camino, igual. El borrador se borra al guardar, con «Descartar borrador», con
  «Cancelar», al cerrar sesión y a los 14 días; «Volver» lo conserva. Al entrar se borran los de otras personas en
  el mismo dispositivo. Al editar, si el registro cambió después del borrador, se ofrece («Recuperar borrador»)
  en vez de aplicarse solo. Prueba: `tests/e2e/borradores.spec.ts`.
- **Borradores, decisiones tomadas sin preguntar, por confirmar con Luis:** 14 días de vigencia; «Cancelar» descarta el
  borrador; solo guardan borrador los formularios de registros y el de actividades (no los de configuración, las
  líneas de cotización ni la conversión de prospectos).
- **Parte A, cómo quedó:**
  - **La descarga:** la función `offline_snapshot()` (migración `20261206000100`, en producción desde el 2026-11-10)
    devuelve en una sola llamada, con los permisos de quien la llama: sus cuentas (propias, de su equipo de cuenta
    y las de sus oportunidades abiertas y su agenda) con contactos, sus oportunidades abiertas, su agenda (pendientes
    vencidos, sin fecha o de los próximos 7 días, y las reuniones de esos 7 días), el catálogo activo y los precios
    de las listas de canal y de las listas propias de sus clientes. La app la pide por `/api/sin-conexion/descarga`
    y la guarda en IndexedDB (`firplak-crm-sin-conexion`, almacén `descarga`; `src/lib/offline/store.ts`).
  - **La pantalla** `/sin-conexion` («Consulta sin señal», `src/components/offline/`) es pública para el proxy y no
    trae datos del servidor: los lee del dispositivo. Pestañas Agenda, Clientes (búsqueda y ficha con contactos,
    oportunidades y agenda), Oportunidades y Productos (precios de un cliente o de una lista). La posición va en la
    parte de la dirección después de «#», así que pestañas, fichas y «atrás» funcionan sin red.
  - **Precios en el teléfono:** `src/lib/offline/prices.ts` repite la regla de la base (lista propia → lista del
    canal y mercado → general nacional; nunca cruza de mercado ni moneda). `db:test` compara su resultado, producto
    por producto, con el de la base y con `quote_line_price`: si la regla cambia en una migración y no aquí, falla.
  - **Abrir sin red:** al preparar el día la app guarda el HTML de `/sin-conexion` y sus archivos en la caché
    `firplak-crm-sin-conexion`. El service worker (`public/sw.js`, v4) la sirve cuando una navegación falla o tarda
    más de 3 s en esa pantalla, y lleva cualquier otra pantalla del CRM a `/sin-conexion#volver=<ruta>`; con red, el
    botón «Volver al CRM» regresa a esa ruta. Sin nada descargado sigue saliendo la página «offline» de siempre.
  - **Fallo en producción y arreglo (2026-11-10, reporte de Luis desde el iPhone):** en Vercel, Next publica los
    archivos con huella en `/_next/static/immutable/…` (lo activa su adaptador); en una compilación local quedan en
    `/_next/static/…`. La app solo reconocía la forma local, así que en producción guardaba el HTML de la pantalla
    **sin sus scripts** y aun así decía «Descargado». Sin señal el service worker llevaba a esa pantalla, que no
    podía arrancar, y salía el error de Next en inglés. No era del iPhone: pasaba en cualquier dispositivo contra
    Vercel. Ahora: (1) `staticAssets()` (`src/lib/offline/download.ts`) reconoce las dos formas y todo lo que el
    HTML cargue de `/_next/static/`; (2) si la pantalla queda sin scripts no se da por guardada (la tarjeta avisa);
    (3) `ensureShell()`, desde `PwaRegister`, revisa con red que la pantalla guardada esté completa y si no la
    vuelve a guardar sola: **repara los dispositivos que ya la tenían a medias** la primera vez que abren el CRM
    con señal después del despliegue; (4) el service worker encuentra un archivo guardado aunque la dirección
    traiga otro parámetro; (5) `src/app/global-error.tsx` reemplaza la pantalla de error de Next por una en
    español («No se pudo abrir esta pantalla», Reintentar / Ir al inicio).
  - **Cómo se prueba como en Vercel:** `npm run dev:demo -- --vercel` compila con `supportsImmutableAssets`
    (variable `CRM_ARCHIVOS_COMO_VERCEL=1`, que solo lee `next.config.ts` en local; en Vercel decide el adaptador).
    Ojo al probar con Chrome: su caché HTTP sirve esos archivos «sin red» y tapa lo que falte en la caché de la
    app; hay que vaciarla antes de cortar la red (`Network.clearBrowserCache`).
  - **Privacidad:** lo descargado se borra al cerrar sesión (junto con la pantalla guardada), al entrar otra persona
    en el mismo dispositivo y cuando el servidor responde que ya no hay sesión.
  - **Pruebas:** `tests/e2e/sin-conexion.spec.ts` (preparar el día, consulta y precios con la red cortada, redirección
    del service worker, borrado al cerrar sesión y al entrar otra persona) y 4 comprobaciones en `db:test`.
  - **Límite del modo de desarrollo:** con `next dev` una página no termina de cargar si el servidor no responde, así
    que abrir `/sin-conexion` desde cero sin red solo se puede probar con la app compilada:
    `npm run dev:demo -- --produccion` (preparar el día, apagar el servidor y navegar). Comprobado así a mano el
    2026-11-09 en 375 px con la asesora de demo: la pantalla abre con los datos, la ficha de «Almacenes Casa Viva»
    muestra sus contactos y sus precios propios, y el resto sale con «Precio de canal».
  - **Sin comprobar todavía:** el arreglo en un iPhone o Android real (comprobado en Chrome con el tamaño de un
    celular, toques reales, contra la app compilada como en Vercel: recién descargado, con la pantalla a medias y
    después de repararse sola). Publicado en `main` el 2026-11-10.
- **Parte B, cómo quedó** (sin cambios de base de datos):
  - **Dónde se crea:** en `/sin-conexion`, con o sin señal. Clientes → «Nuevo cliente» (nombre, tipo, canal,
    mercado, NIT, teléfono, correo, ciudad, dirección, notas) y «Registrar actividad» desde la Agenda o desde la
    ficha de un cliente (tarea, llamada, reunión, correo o nota, con los mismos campos del formulario rápido del
    CRM). Formularios en `src/components/offline/OfflineForms.tsx`.
  - **La bandeja de salida** es el almacén `salida` de la misma base IndexedDB (versión 2;
    `src/lib/offline/store.ts`). Cada registro lleva el identificador que tendrá en el CRM, generado en el
    teléfono, así que reenviarlo no lo duplica. Un cliente creado sin señal aparece en la lista de clientes marcado
    «Sin enviar», con los precios de la lista de su canal y mercado, y se le pueden registrar actividades antes de
    que exista en el CRM.
  - **El envío** (`src/lib/offline/sync.ts`, `POST /api/sin-conexion/enviar`): solo, al guardar, al volver la
    señal, al volver a la app y cada minuto; también con «Enviar ahora». Primero los clientes y después lo demás por
    orden de creación; la actividad de un cliente sin enviar espera a que ese cliente salga. Pasa por las mismas
    reglas que el CRM (`persistRecord` e `insertActivity`, que ahora comparte el formulario rápido): campos
    obligatorios, reglas de validación, duplicados y permisos. Sin red o con error del servidor el registro sigue
    Pendiente; si el CRM no lo acepta queda **Rechazado** con el motivo y los campos.
  - **La pestaña «Envíos»** muestra Rechazados, Por enviar y Enviados. Un rechazado se corrige («Corregir») o se
    descarta; si el motivo es un posible duplicado, dice con cuál se parece y deja «Enviar de todas formas».
    Descartar un cliente descarta también sus actividades (se avisa cuántas). Un enviado enlaza a su ficha («Ver en
    el CRM») y sale de la bandeja con la siguiente descarga o a los 7 días.
  - **En el CRM:** la cabecera muestra «N sin enviar» (`UnsentLink`) y lleva a la bandeja; el envío también corre
    desde cualquier pantalla del CRM (`OutboxSync`).
  - **Cerrar sesión (decisión 4):** con registros sin enviar, el menú avisa cuántos son y pide confirmar («Cerrar
    sesión de todas formas»). Se borra lo descargado y lo ya enviado; lo pendiente y lo rechazado se quedan. Solo se
    envían con la sesión de quien los creó: otra persona en el mismo dispositivo no los ve ni los envía, y sin sesión
    la pantalla solo dice cuántos hay. Cuando vuelve a entrar quien los creó, salen solos.
  - **Pruebas:** `tests/e2e/sin-conexion-envios.spec.ts` (cliente y llamada creados con la red cortada y enviados al
    volver; duplicado rechazado, corregido, enviado de todas formas y descartado; aviso al cerrar sesión, otra
    persona en el dispositivo y envío al volver la dueña).
  - **Límites conocidos:** (1) un campo personalizado obligatorio en cuentas que no esté en el formulario sin señal
    hace que el CRM rechace el cliente (el rechazo nombra el campo): se crea entonces desde el CRM. (2) Sin señal no
    se editan ni se completan registros que ya están en el CRM (por ejemplo marcar hecha una tarea descargada): solo
    se crean nuevos. (3) No se crean contactos ni oportunidades sin señal. (4) iOS no envía en segundo plano: sale
    al volver a abrir la app.
  - **Sin comprobar todavía:** en un iPhone o Android real.
- **Parte C, cómo quedó:**
  - **Dónde se cotiza:** en `/sin-conexion`, con o sin señal: «Cotizar» en la ficha de un cliente o «Cotizar» en la
    pestaña Productos. El formulario (`src/components/offline/OfflineQuoteForm.tsx`) pide cliente, nombre,
    oportunidad (una abierta descargada o «se crea una nueva con el nombre de la cotización»), contacto y
    observaciones, y los productos se buscan en el catálogo descargado. Cada línea trae el precio que le toca al
    cliente (lista propia o «Precio de canal») y ese precio no se edita: se ajusta con el descuento por línea. Solo
    si el producto no está en la lista del cliente ni en la de su canal se escribe el precio («Precio manual»). La
    moneda y la lista salen del cliente y no se eligen.
  - **Totales en el teléfono:** `src/lib/offline/quotes.ts` hace la misma cuenta que la base (`line_total` y
    `recalc_quote`), en enteros para no arrastrar redondeos: subtotal, descuentos, neto, IVA (19 % en pesos, 0 % en
    otra moneda) y total. El flete no se pone sin señal: se agrega en el CRM. `db:test` compara los totales del
    teléfono con los de la base sobre la misma cotización.
  - **Mientras no llega:** vive en la bandeja de salida (`kind: "quote"`, con sus líneas). Se ve en la ficha del
    cliente («Cotizaciones hechas sin señal») y en «Envíos», con número provisional `PROV-XXXXXX`, la insignia
    «Sin enviar» y los totales; se puede editar. No tiene PDF: el PDF y el número oficial salen del CRM (decisión 3).
    La de un cliente creado sin señal espera a que ese cliente salga primero y usa la lista de su canal.
  - **Al llegar** (`POST /api/sin-conexion/enviar`): pasa por `persistRecord` como cualquier cotización (reglas,
    permisos, «Facturar a»), nace en **Borrador**, con el identificador generado en el teléfono (reenviarla no la
    duplica) y, si no traía oportunidad, crea una con su nombre. Las líneas entran con el precio cotizado. Máximo
    200 líneas. Un producto que ya no está activo la deja **Rechazada**, nombrando el producto, para quitarlo y
    reenviar («Corregir»).
  - **Precio que cambió (decisión 1):** se respeta el cotizado. La columna nueva
    `quote_line_items.offline_list_price` (migración `20261207000100`, en producción desde el 2026-11-10) guarda el
    precio de lista vigente al llegar cuando es distinto del cotizado; un disparador la deja vacía si son iguales
    y la borra si después alguien cambia el precio o el producto de la línea. El teléfono avisa («Desde tu descarga
    cambió el precio de lista de N productos…», y en cada línea «Precio de lista al enviar: $X. Se respetó el
    cotizado.») y la cotización del CRM marca la línea «Cotizado sin señal · Precio de lista al llegar al CRM: $X».
    Un «Precio manual» se marca igual si al llegar la lista ya trae un precio distinto para ese producto.
  - **Pruebas:** `tests/e2e/sin-conexion-cotizaciones.spec.ts` (cotizar con la red cortada con los precios del
    cliente, editar y ver que llega sola al CRM; precio de lista cambiado desde la descarga; cotizar a un cliente
    creado sin señal) y 2 comprobaciones nuevas en `db:test` (149 en total).
  - **Límites conocidos:** (1) si el CRM rechaza la cotización por un producto y el asesor la descarta en vez de
    corregirla, puede quedar en el CRM un borrador sin productos (y su oportunidad): se borra a mano. (2) Si al
    llegar el producto ya no tiene precio en la lista del cliente, la línea entra con el precio cotizado pero sin
    marca. (3) Al reenviar una cotización que ya había llegado sin líneas, se completan las líneas pero no se
    actualiza el encabezado. (4) Sin señal no se editan cotizaciones que ya están en el CRM, ni se pone flete, ni
    se cambia el IVA, ni se pide aprobación de descuento: todo eso se hace en el CRM cuando llega el borrador (la
    regla del 15 % aplica allá al presentarla).
  - **Sin comprobar todavía:** en un iPhone o Android real (comprobado en Chrome de escritorio y a 375 px).
- **Idea pendiente:** con mala señal (no sin señal) las demás pantallas del CRM pueden tardar minutos en fallar; hoy
  solo `/sin-conexion` tiene límite de 3 s. Valorar un límite para las demás navegaciones cuando hay descarga.
- A tener en cuenta: el almacenamiento del navegador no está cifrado (por eso solo guarda lo de quien inició sesión
  y se limpia al salir); iOS puede borrarlo si la app no se usa en semanas y no tiene sincronización en
  segundo plano; renovar la sesión de Supabase necesita internet.

### App de iPhone (prototipo en `mobile/`)
- **Cuenta de Apple Developer de Firplak** (99 USD al año, pide el D-U-N-S de la empresa): la tramitan Luis y TI. Sin
  ella no hay TestFlight ni App Store; con el Apple ID personal de Luis solo se puede instalar en su iPhone por 7 días.
- **Instalada en el iPhone de Luis (2026-11-09)** como `com.firplak.crm.prueba`, firmada con su equipo personal
  (vence a los 7 días; para renovarla, repetir los comandos de la sección 3). **Probada por Luis en el iPhone**:
  abre, entra con su cuenta y pide Face ID al volver a abrirla. Sin confirmar todavía, uno por uno: el código del
  iPhone como respaldo cuando Face ID falla, la tapa en el selector de apps y lo de «Por confirmar en un iPhone real».
- Al confiar en el desarrollador, el iPhone necesita internet para verificar la app (Settings → General → VPN &
  Device Management → Trust → Verify App). La primera vez falló con «Unable to Verify App» en Wi-Fi; se resolvió
  borrando la app, reiniciando el iPhone, reinstalando y verificando otra vez.
- Para que Apple la apruebe en el App Store necesita funciones nativas, no solo la página. **Face ID ya está**
  (bloqueo de la app, probado en el simulador y en el iPhone de Luis); faltan las notificaciones push nativas (APNs; las push web de la PWA
  no llegan a la app) y, más adelante, el resto del modo sin conexión (borradores y consulta sin señal ya están en la app web).
- Bloqueo con Face ID, lo que falta: confirmar en el iPhone el código como respaldo (el simulador no tiene código;
  con la cara de verdad ya funcionó); decidir con Luis si lleva un ajuste para apagarlo (hoy va siempre encendido), si 5
  minutos es el tiempo correcto y si la tapa al bajar el centro de control o al salir una alerta del sistema molesta;
  los textos del bloqueo están solo en español.
- Android: el mismo proyecto de Capacitor admite `npx cap add android` cuando se decida.
- Nota técnica: la plantilla de Capacitor 8 crea la pantalla en `SceneDelegate.swift`, no desde el storyboard; por eso
  ahí se instancia `CrmViewController()`. Si `cap` regenera ese archivo, hay que volver a poner esa línea y las
  llamadas a `Bloqueo.shared`. Un archivo Swift nuevo hay que registrarlo a mano en `App.xcodeproj/project.pbxproj`
  (cuatro entradas, como `Bloqueo.swift`) o abrir Xcode y agregarlo al target `App`.

### Diseño: lo que quedó de la crítica (2026-11-09, 25/40)
Los 6 pasos del plan están hechos (celular, confirmaciones, claridad, Indicadores, teclado, pulido). Quedan:
- Ctrl K sin sugerencias al abrirlo (recientes o accesos rápidos).
- Lista de oportunidades: abre con cerradas viejas arriba (orden por fecha de cierre ascendente).
- Pipeline: Ganada/Perdida fuera de vista a la derecha sin pista de desplazamiento.
- Estado como insignia en unos módulos y como texto en otros.
- Decisión de Luis: ¿Mercado obligatorio en Nueva cuenta? (define moneda, lista y pipeline).
- Volver a correr `/impeccable critique` para medir el cambio.

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
- Las dos pruebas de `tests/e2e/push.spec.ts` fallan de forma intermitente en la suite completa (3 de 5 corridas el
  2026-11-13) y pasan solas o junto a `analitica.spec.ts`; no dependen de los cambios de ese día. Causa sin encontrar.
- `npm run lint` falla en el equipo de Luis por las carpetas de plugins sin versionar (`.agents/`, `.claude/skills/`):
  30 errores, todos ahí. El código del proyecto pasa limpio
  (`npx eslint . --ignore-pattern ".agents/**" --ignore-pattern ".claude/**"`). Falta ignorarlas en `eslint.config.mjs`.

### Por confirmar en un iPhone real
Cabecera con más aire bajo la hora, campos sin zoom y botón «Guardar» sobre la barra inferior (probado en
Chrome con área segura simulada, no en el dispositivo).

Franja de la hora en navy (sin el degradado gris) en la app instalada: arreglada y comprobada en el simulador
(2026-11-10) y publicada ese día (`main` en `5f175c1`). Falta revisar en el iPhone, cerrando y volviendo a abrir la app: Inicio en claro y en oscuro, una pantalla con poco
contenido (que no quede una banda abajo ni un desplazamiento raro), el aviso «Sin conexión» y el inicio de sesión
(no debe cambiar). Si Apple cambia cómo tiñe esa franja, la regla está al final de `src/app/globals.css`.

Vista de imprimir la cotización (`/imprimir/cotizacion/[id]`) en la app instalada en iPhone: el botón «Imprimir o
guardar PDF» ya no queda bajo la franja de la hora, y como **en la app instalada iOS ignora `window.print()`**, allí el
botón comparte la cotización como **archivo PDF real** (decisión de Luis; publicado 2026-11-10, `main` en `0184557`). Comprobado en el
simulador (iOS 27.2, app instalada contra el servidor demo): la hoja de compartir muestra «COT-1002 · Documento PDF ·
63 KB» con «Imprimir» y «Guardar en Archivos», e «Imprimir» abre las opciones con la hoja en tamaño carta. **Falta
revisar en el iPhone real con una sesión de producción** (el despliegue quedó bien y sin sesión la ruta manda a ingresar, pero
nadie ha generado aún un PDF en Vercel: hay que ver que la función lleve las letras y el logo; si no, la ruta
`/pdf` responde con error y el botón dice «No se pudo preparar el PDF»). Además, esa vista no tiene cómo volver a la
cotización en la app instalada y en teléfono queda sin margen lateral.

## 7. Registro de cambios recientes

| Fecha | Commit | Cambio | Producción |
|---|---|---|---|
| 2026-11-14 | `9e91d9e` | **SAP por agente, fase 4: ventas reales para metas e indicadores** (aprobada por Luis). El agente sube los CSV mensuales de ventas netas que ya genera el script de ventas de Firplak (`Ventas SAP AAAA-MM.csv`: fecha, factura, tipo de venta, zona, territorio, canal, vendedor senior, código de cliente, nombre y valor; notas crédito en negativo) a `sap_sales`; solo sube los meses cuyo archivo cambió (`sap_sales_months` guarda la huella) y corre al final de cada sincronización o con `agente.mjs ventas` (carpeta en `ventasCsvDir` de la configuración del agente). **Solo dos años** (decisión de Luis, para que la app siga liviana): el año en curso y el anterior; lo anterior se borra en cada carga. **Cuentan todas las ventas**, también las de tipo «Excluido» (ventas a zona franca, excluidas de IVA). **A quién se le cuenta**: al usuario del CRM relacionado con el «Vendedor Senior» de SAP (`sap_sellers`; se relaciona solo por nombre al cargar y se corrige en Configuración → SAP → «Ventas reales y vendedores»). **Visibilidad**, igual que las metas: cada quien ve lo de su vendedor y lo de quienes le reportan; administración y quien tiene «ver todo» en oportunidades, todo. Nadie lee `sap_sales` directo: solo por `sap_sales_summary`, `sap_sales_group` y `sap_account_sales`. **Sucursales**: el código de cliente de SAP es `CN` (nacional) o `CE` (exterior) + NIT sin dígito de verificación + `-01`, `-02`… (un mismo cliente con varias sucursales o asesores), así que las ventas se agrupan por la raíz del código (`sap_customer_root`). En **Indicadores**, sección «Ventas reales (SAP)»: total, por mes, por canal, por zona y «Clientes que más compraron» con cada grupo en una fila (nombre: la **cuenta principal** del CRM si sus sucursales la tienen; si no, lo que tienen en común sus nombres de SAP) y, al abrirla, cada sucursal con su vendedor y enlace a su cuenta; respeta el filtro de asesor. En la **ficha de la cuenta** (pestaña SAP): ventas de los últimos doce meses; una cuenta principal suma las de sus sucursales. En **Metas**: métrica nueva «Ventas facturadas (SAP)» (`invoiced_amount`), junto a «Ventas ganadas». Migración `20261218000100`. Pruebas: una de base y `tests/e2e/sap-ventas.spec.ts`. Recomendación dada a Luis para clientes con sucursales: una cuenta principal sin Código SAP (por ejemplo la cadena) y una cuenta por sucursal con su código y su asesor. | **Sin publicar.** Falta: visto bueno de Luis para la migración y el push; luego poner `ventasCsvDir` en la configuración del agente y hacer la primera carga |
| 2026-11-14 | `3c9d64a` | **Borrar pedidos según el permiso del perfil** (pedido de Luis: el botón no le aparecía y borrar un pedido es una posibilidad real). El botón «Eliminar» ya existía, pero solo salía en pedidos en borrador o cancelados, y la base rechazaba borrar los demás aun con el permiso. Ahora lo decide el permiso «Eliminar» de Pedidos en Perfiles y permisos (más el alcance sobre el pedido, como en los demás objetos): quien lo tiene borra un pedido en cualquier estado, con sus productos. Si el pedido ya salió de borrador, la confirmación lo advierte, y si tiene oferta de venta en SAP dice su número y que la oferta **sigue en SAP** (el CRM no la borra). `DeleteButton` acepta un aviso propio (`warning`). Migración `20261217000100` (política «pedidos: eliminar» sin la condición de estado). Pruebas: base reescrita y `tests/e2e/pedidos-eliminar.spec.ts`. Va en el mismo commit que la importación de kits. | Publicado 2026-11-14: migración aplicada (52/52) con `db:publicar`, código en `main` (`b02b242`), despliegue de Vercel correcto |
| 2026-11-14 | `3c9d64a` | **Importar kits de SAP con sus componentes, y planta siempre elegida por la persona** (pedido de Luis). En SAP un kit es un artículo con lista de materiales de venta (`TreeType = iSalesTree`; hay unos 4.000 de venta) y sus componentes están en `ProductTrees`. En la lista para elegir, los kits salen con la marca «Kit · N componentes»; al marcar uno aparecen debajo sus componentes (código, descripción, cantidad y grupo de SAP) con **un selector de planta por componente**. Al importar un kit entran también sus componentes, aunque no se hayan marcado, y quedan enlazados con su cantidad (`product_kit_components`; la lista de SAP reemplaza a la que hubiera); el kit queda marcado como Kit y con planta «KIT» por la regla que ya existía. **La planta no se toma de SAP** (decisión de Luis, para no traer un dato errado, aunque SAP la tiene): la persona elige una para los artículos sueltos y una por cada componente de kit; con plantas en la lista de valores, la pantalla no deja enviar si falta alguna y la base rechaza un artículo que no sea kit y no tenga planta. El selector de planta ofrece solo las que corresponden a la familia elegida (en producción Planta depende de Familia; Luis ya creó sus plantas: ALM, ESPGAB, FV, FVH, FVHMP, MBL, MBL CEFI, PA, PC, Quartz). Un componente que en SAP es a su vez un kit no se enlaza (el CRM no admite un kit dentro de otro) y la lista lo dice. Si un mismo componente está en varios kits marcados, su planta se elige una sola vez. La espera del panel sube a cinco minutos (listas con muchos kits tardan más). Migración `20261216000100` (reemplaza `sap_agent_import_products`). Pruebas: base ampliada y `sap-agente.spec.ts` (el SAP simulado tiene un kit). Comprobado contra el SAP real: la lista de un prefijo de kits trae cada kit con sus dos componentes y sus grupos. | Publicado 2026-11-14: migración aplicada (52/52) con `db:publicar`, código en `main` (`b02b242`), despliegue de Vercel correcto |
| 2026-11-14 | `d8917a2` | **Importar de SAP con Familia, Planta y Grupo de Artículo** (pedido de Luis: que el producto entre con la mayor información posible). Al importar los artículos marcados, la persona elige la **Familia** y la **Planta** de las listas del CRM (valen para todo lo marcado) y, con la casilla «Traer de SAP el Grupo de Artículo» (marcada por defecto), el **grupo** viene de SAP: el agente lee `ItemsGroupCode` de cada artículo y su nombre en `ItemGroups` (p. ej. «ROP02-Lavarropas ECO»). Un grupo que no esté en la lista de valores **se crea solo** y queda atado a la familia elegida (`controlling_map`); si ya existía, se habilita también para esa familia; y si faltaba, se crea la dependencia «Grupo de Artículo depende de Familia» (`picklist_dependencies`). Por eso traer el grupo exige elegir familia. La lista para elegir muestra ahora la columna «Grupo de artículo». En un producto que ya existe solo se cambia lo que viene en la importación (lo que no se elige se conserva; la planta de un kit no se toca). La función `sap_agent_import_products` recibe ahora familia y planta y devuelve cuántos grupos creó. Con conexión directa se aplican familia y planta, no el grupo. Migración `20261215000100`. Pruebas: base ampliada y `sap-agente.spec.ts`. Comprobado contra el SAP real: el prefijo `VROP02` trae 26 artículos con su grupo. **Observado en SAP, no usado todavía**: cada artículo trae también su familia (`U_Grupo`: BAÑO, COCINAS, ROPAS…) y su planta (`U_FIR_Plantas`), que se podrían traer solas con una tabla de equivalencias; Luis prefirió elegirlas. En producción la lista de Plantas está vacía y no hay dependencias de listas en Productos. | Publicado 2026-11-14: migración aplicada (50/50) con `db:publicar`, código en `main` (`c8aaaa8`), despliegue de Vercel correcto. Falta que Luis cree las Plantas en Listas de valores y haga su primera importación |
| 2026-11-14 | `c6a2d9b` | **Importar de SAP solo los artículos que se eligen** (pedido de Luis: quiere ingresar al CRM únicamente lo que va a usar). «Guardar y ver artículos» (antes «Guardar y ver vista previa») ya no muestra una muestra de diez: trae **toda la lista** del filtro, hasta 1.000 artículos (si SAP tiene más, lo dice y pide un código más específico). La lista tiene una casilla por artículo, una casilla para marcar todos los que se ven, un buscador dentro de la lista, el conteo «N de M elegidos» y una columna «En el CRM» que marca los que ya existen. El botón pasa a **«Importar seleccionados (N)»** y solo importa lo marcado; sin marcar nada, avisa y no hace nada. Ya no existe «Importar ahora» (traer todo el filtro sin revisar). Por el agente, la solicitud de importación lleva la lista de códigos (`params.codes`) y el agente lee esos artículos en lotes de 20; con conexión directa se filtra por los mismos códigos. Sin cambios de base de datos. Prueba reescrita en `sap-agente.spec.ts`. | Publicado 2026-11-14 (`main` en `08e0828`, despliegue de Vercel correcto) |
| 2026-11-14 | `4e4242f` | **SAP por agente, fase 2: importar productos a demanda.** Como el servidor no alcanza a SAP, la vista previa y la importación de Configuración → SAP ya no consultan en vivo cuando el origen es el agente: dejan una **solicitud** (`sap_requests`: tipo, filtro y mapeo, estado, resultado) y el panel la consulta cada tres segundos hasta que termine (`checkSapRequest`, `useAgentResult` en `SapImportPanel.tsx`; a los tres minutos avisa que el agente no respondió). El agente tiene un comando nuevo, `atender`, que toma las solicitudes pendientes, lee SAP y deja el resultado; `instalar` ahora carga dos trabajos de launchd: la sincronización (lunes a viernes, cada dos horas) y la revisión de solicitudes **cada minuto, todos los días**. La importación crea o actualiza productos por Referencia con la función `sap_agent_import_products` (solo nombre y campos personalizados mapeados; no toca precios, familia ni lo demás; hasta 5.000 artículos, en lotes de 200). Una solicitud que nadie atiende en 15 minutos queda con error y su explicación. Con conexión directa (modo demo) todo sigue como antes. Funciones nuevas solo para el agente: `sap_agent_next_request`, `sap_agent_finish_request`, `sap_agent_import_products`. Migración `20261214000100`. Pruebas: una de base y un caso nuevo en `sap-agente.spec.ts` (vista previa e importación con el agente real contra el SAP simulado). **No se hizo**: traer de SAP la familia, la planta o el grupo de artículo (son listas con dependencias; hoy solo se mapean campos personalizados), ni precios. | Publicado 2026-11-14: migración aplicada (49/49) con `db:publicar`, código en `main` (`7e8dcb8`), despliegue de Vercel correcto, y horario reinstalado en el Mac de Luis. Comprobado con una solicitud de vista previa real (creada por SQL): el trabajo de launchd la tomó a los 41 segundos, leyó el Llavero y SAP, y devolvió cinco artículos. Falta que Luis haga su primera importación desde la pantalla |
| 2026-11-14 | `a95f26b` | **Ventana de líneas del pedido de SAP: más grande y con el artículo en una columna** (pedido de Luis al verla en producción; eligió entre tres maquetas). La ventana pasa de 60 a 76 rem de ancho y a 80 % del alto. Código y descripción se juntan en la columna «Artículo»: la descripción arriba y el código debajo, más pequeño, para darle el espacio a la descripción. El estado («Abierta» o «Entregada») va junto a la fecha plan de despacho, sin columna propia. En pedidos de **seis líneas o más** (`SUMMARY_FROM` en `SapOrderLines.tsx`) aparece arriba un resumen con el total pedido, facturado, en despacho y por producir; en pedidos cortos no, porque repetiría lo que ya se ve (decisión de Luis). Prueba ampliada en `sap-agente.spec.ts`; el SAP simulado tiene ahora un pedido de seis líneas. Pendiente de respuesta de Luis: en su pedido real 163788 todas las líneas salen con todo «en despacho», incluso las de 2027, por la regla del Visor OV para líneas que no salen de la bodega PT-02; si en SAP no se ve así, hay que corregir esa regla. | Publicado 2026-11-14 (`main` en `700d318`, despliegue de Vercel correcto) |
| 2026-11-14 | `af1c190` | **SAP en la ficha del cliente: totales sin y con IVA, entregas sin facturar y líneas de cada pedido** (pedido de Luis tras ver su primer cliente real). **(1)** Pedidos, entregas y facturas muestran «Total sin IVA» y «Total con IVA» (`DocTotal − VatSum` y `DocTotal`): al cliente se le habla con IVA y el asesor cuenta su venta sin IVA. **(2)** Lista nueva «Entregas sin facturar» (`DeliveryNotes` abiertas), para ver el recorrido orden de venta → entrega → factura; la oferta no se muestra (decisión de Luis: es un paso rápido). **(3)** El número del pedido abre una ventana con sus líneas (`SapOrderLines.tsx`): código, descripción, **pedida, facturada, en despacho, por producir**, fecha plan de despacho y estado; las líneas ya entregadas se muestran atenuadas. La columna «Entrega» de la lista pasa a «Próximo despacho»: la fecha de despacho (`ShipDate`) más cercana entre las líneas abiertas, en vez de la del encabezado, que es la del último despacho. Definiciones de Luis, iguales a las del «Visor OV» de SAP (réplica en `sap_ventas.py`, función `pedidos_abiertos`): facturada = pedida − pendiente de la línea; **en despacho** = lo que producción ya entregó a despacho y no se ha facturado, que para lo fabricado contra pedido (bodega PT-02, MTO/MTS) sale de lo terminado en las órdenes de fabricación del pedido (`ProductionOrders`, emparejadas por artículo y posición del lote `U_NumLote`), y para otras bodegas es todo lo pedido; por producir = pedida − facturada − en despacho. **No se calcula** para artículos de compra (PTO en PT-02): muestra «—». Todo lo trae el agente; la consulta en vivo muestra totales y entregas, pero no las líneas. Tipos compartidos en `src/lib/sap/types.ts`. La herramienta MCP `sap_cliente` también entrega líneas y entregas. Prueba ampliada en `sap-agente.spec.ts` (el SAP simulado ahora tiene líneas, entregas y órdenes de fabricación). Comprobado con el pedido real 160256: cuatro líneas, una entregada y tres pendientes con sus fechas. **Sin comprobar por Luis**: que «en despacho» coincida con el Visor OV. | Publicado 2026-11-14 (`main` en `fdf0f07`, despliegue de Vercel correcto). Falta que Luis compare «en despacho» con el Visor OV |
| 2026-11-14 | `d83f911` | **SAP: todas las facturas y pedidos abiertos, no solo los diez más recientes** (aprobado por Luis tras probar con su primer cliente real). Antes el «vencido» se calculaba sobre las diez facturas más recientes y podía quedar corto. Ahora el agente trae todos los pedidos abiertos, todas las facturas abiertas y además las diez más recientes (tope de 500 por lista); la consulta en vivo hace lo mismo (tope 200). En la ficha, «Vencido (facturas recientes)» pasa a «Cartera vencida» y la lista a «Facturas abiertas y recientes». Comprobado con el cliente real: la suma de lo pendiente de las facturas abiertas es igual al saldo de cartera de SAP. | Publicado 2026-11-14 (`main` en `fdf0f07`, despliegue de Vercel correcto) |
| 2026-11-14 | `4b485a2` | **Agente de SAP probado contra el SAP real e instalado en el Mac de Luis.** Conexión correcta a SAP y al CRM. Hallazgo de la primera prueba: SAP rechaza `PaidToDate` al consultar **pedidos** (solo existe en facturas); se pide solo en facturas, en el agente y en la consulta en vivo (`src/lib/sap/data.ts`). Los demás campos llegan como se esperaba. Cada artículo trae decenas de bodegas y más de cien listas de precios casi todas en cero: el agente guarda solo las que tienen valor. Comando nuevo `muestra` (lee un cliente y un artículo y dice qué campos llegan, sin guardar ni mostrar valores). Primera corrida real registrada: 0 clientes y 0 productos, porque en producción aún no hay cuentas con Código SAP ni productos. Horario instalado con launchd (lunes a viernes 7, 9, 11, 13, 15 y 17) y comprobado que macOS lo arranca; **sin comprobar**: que una corrida lanzada por el horario lea el Llavero (se verá en la primera corrida del lunes, en Configuración → SAP). | Publicado 2026-11-14 (`main` en `fdf0f07`, despliegue de Vercel correcto). Falta dar «Ver información de SAP» a los perfiles |
| 2026-11-14 | `f618437` | **SAP por agente dentro de la red, fase 1: cartera, pedidos e inventario** (plan aprobado por Luis). Hallazgo: el Service Layer solo responde dentro de la red de Firplak (guía `SAP_SERVICE_LAYER.md`, sin versionar), así que la consulta en vivo desde el servidor (`src/lib/sap/client.ts`) nunca habría conectado desde Vercel. Ahora un **agente** (`agente-sap/agente.mjs`, Node sin dependencias nuevas; guía en `agente-sap/LEEME.md`) corre en un equipo de la red (por ahora el Mac de Luis), lee SAP **solo lectura** con una sesión por corrida y guarda una copia en `sap_partners` (cartera, cupo, pedidos abiertos y diez facturas por cada cuenta con Código SAP) y `sap_items` (inventario y precios por cada producto activo que no es kit); cada corrida queda en `sap_sync_runs`. Horario decidido por Luis: lunes a viernes cada dos horas, 7:00 a 17:30 (launchd; fuera de horario no corre salvo `--ahora`). Contraseñas solo en el Llavero de macOS; la configuración sin secretos en `~/.firplak-crm/agente-sap.json`. El agente entra al CRM con un usuario técnico de perfil «Integración SAP» (permiso de sistema `sap_agent`): no ve nada y solo usa cuatro funciones (`sap_agent_targets`, `_start`, `_save`, `_finish`), que ni la administración puede llamar. En el CRM, las pestañas SAP de la cuenta y del producto y la herramienta MCP leen la copia y muestran «Actualizado <hora>»; un código recién vinculado dice que llegará con la próxima sincronización. Configuración → SAP: origen de los datos (copia del agente o consulta en vivo; por defecto la copia cuando el servidor no tiene credenciales de SAP, como en producción) y las últimas corridas. **Siguen con conexión directa y por eso apagadas en producción**: importar productos y pedido → oferta de venta (fases 2 y 5). Decisiones de Luis: los clientes se crean en el CRM y se les pone el Código SAP; el usuario de SAP lo definió Luis (lo ideal sería uno de solo lectura dedicado al CRM); le interesan la fase 3 (sugerir el Código SAP por NIT) y la 4 (ventas reales desde los CSV mensuales de la carpeta «Automatizacion SAP»). Migración `20261213000100`. Pruebas: una de base y `tests/e2e/sap-agente.spec.ts` (corre el agente de verdad contra el SAP simulado). | Publicado 2026-11-14: migración aplicada (48/48) con `db:publicar` y código en `main` (`dfbc59c`), despliegue de Vercel correcto. Falta: crear el usuario técnico en producción, instalar el agente en el Mac de Luis y la primera corrida contra el SAP real |
| 2026-11-13 | `5a3d257` | **Carga de la configuración comercial en producción** (pedido de Luis: que Claude la cargue por él). Solo datos, sin código ni migraciones: roles, perfiles, compartir por defecto, 21 usuarios suspendidos y sin correo de invitación, y 26 territorios. Detalle en la sección 5. | Cargado y comprobado el 2026-11-13. Falta: promotores y áreas de apoyo, y abrir el acceso cuando Luis lo decida |
| 2026-11-13 | `d846362` | **Promotores: la rama de roles comparte también los negocios** (decisión de Luis: el promotor de ventas o técnico es el apoyo de su ejecutivo y debe ver sus oportunidades y cotizaciones). Segunda casilla en el rol, «y negocios» (`roles.share_business`): además de clientes, contactos y prospectos, la rama ve oportunidades, cotizaciones, pedidos y actividades, **solo lectura**. Marcarla activa también «Comparten clientes». Estructura prevista: un rol por ejecutivo con promotores, marcado con las dos casillas, y debajo el rol de sus promotores; el ejecutivo ve y edita lo del promotor por jerarquía, y otro ejecutivo no lo ve. B2C usa solo «Comparten clientes». Los promotores le reportan al ejecutivo de Distribución de la zona; los de Sodimac también. Migración `20261212000100`. Pruebas ampliadas en la de base y en `visibilidad.spec.ts`. Falta: perfil «Promotor» (se crea en Perfiles y permisos) y la lista de promotores, que Luis enviará. | Publicado 2026-11-13: migración aplicada (47/47) y código en `main` (`5dc99fc`), despliegue de Vercel correcto. Configuración cargada el mismo día (ver sección 5) |
| 2026-11-13 | `1bd92c1` | **Zonas y territorios comerciales, fases 2 y 3** (decisiones de Luis: usar los territorios para informes, para sugerir el responsable y para que un asesor no cree clientes fuera de lo suyo). **Zona** pasa a ser campo propio del cliente y del prospecto (`zone`), con las ocho zonas reales (lista editable en Listas de valores → Cuentas); vacía se llena sola según departamento y ciudad (`zone_places`, con el Urabá antioqueño y el norte del Chocó como excepciones por ciudad hacia «Córdoba, Sucre y Urabá»); en el exterior no hay zona (es el país) y el cliente lleva **Puerto destino** (`destination_port`). El campo configurable «Zona comercial» queda inactivo y su valor se migra. **Territorios** (`territories`, Configuración → Territorios): por asesor, canales, mercado y zona con departamentos opcionales, o países; flexible para partir una zona entre dos asesores o abrirle un país a alguien sin tocar código. **Restricción** (disparador `place_and_territory`): quien tiene territorios y no tiene «modificar todo» no crea ni se queda con clientes o prospectos fuera de lo suyo; la dirección asigna sin límite y quien no tiene territorios no tiene restricción. **Sugerencia**: la ficha del cliente y del prospecto dice «Según los territorios, le corresponde a X» cuando su responsable no lo cubre (`TerritoryHint`, `territory_owners`). Migración `20261211000100`. Pruebas: dos de base y `tests/e2e/territorios.spec.ts`. No se hizo: reasignar con un clic desde la sugerencia, elegir departamentos y países con casillas (hoy se escriben separados por coma y se validan), ni informes nuevos por zona (el campo ya sirve para filtrar y agrupar). Pendiente de diseño: promotores de ventas y técnicos, que reportan a un ejecutivo y deben ver los clientes de su jefe. | Publicado 2026-11-13: migración aplicada (47/47) y código en `main` (`5dc99fc`), despliegue de Vercel correcto. Configuración cargada el mismo día (ver sección 5) |
| 2026-11-13 | `ed30640` | **Visibilidad para la estructura comercial real, fase 1** (Luis entregó el equipo: 11 ejecutivos B2B que reportan a la Dirección Comercial, y B2C con coordinadora, tres tiendas y ecommerce; los nombres no van en el repositorio). Dos piezas: **(1) Rama de roles que comparte clientes.** Casilla «Comparten clientes» en cada rol (Configuración → Jerarquía de roles, `roles.share_within`): quienes tienen ese rol o uno que depende de él ven entre sí clientes, contactos y prospectos, **solo lectura**; oportunidades y cotizaciones siguen siendo de quien las crea. Pensado para marcar «Coordinación B2C». **(2) «Existe, pero no es tuyo».** El aviso de duplicados al crear cuenta, contacto o prospecto ahora revisa todos los registros (`possible_duplicates` pasa a `security definer`): de lo que la persona no puede abrir dice el nombre, NIT y ciudad y «ya existe y está a cargo de X», sin enlace ni id. La búsqueda (`/buscar`) agrega la sección «Clientes a cargo de otras personas» con lo mismo (`account_directory`, exige 3 letras). Así las cuentas pueden pasar a **Privado** sin perder el control de duplicados. Decisión de diseño: **no** se construyó visibilidad por canal y mercado para coordinadores; no hace falta porque en B2B no hay coordinadores (se retoma si los nombran). Migración `20261210000100`. Pruebas: una de base y `tests/e2e/visibilidad.spec.ts`. Observado: en los datos de prueba no hay pipeline para el Canal B2C; revisar en producción antes de que B2C cree oportunidades. Siguen: fase 2 (Zona y Puerto destino como campos del cliente) y fase 3 (territorios: asesor × canal × mercado × zona o país, con sugerencia de responsable y restricción al crear). | Publicado 2026-11-13: migración aplicada (47/47) y código en `main` (`5dc99fc`), despliegue de Vercel correcto. Configuración cargada el mismo día (ver sección 5) |
| 2026-11-13 | `e4422ab` | **Arreglo: faltaban departamentos y ciudades al crear un cliente** (reporte de Luis: no aparecía Tolima ni Ibagué). Los datos estaban completos en la base (1.122 municipios, 33 departamentos), pero la API entrega **como máximo 1000 filas por consulta** (`max_rows`) y la lista se pedía de una vez: quedaban por fuera parte de Sucre, Tolima, Valle del Cauca, Vaupés y Vichada. Ahora se lee por páginas (`fetchAllRows` en `src/lib/records/data.ts`). El mismo tope cortaba en silencio otras dos cosas, también corregidas: **exportaciones e informes** (`listRecords` con `all`: se quedaban con las primeras 1000 filas; ahora hasta 20.000) y la **importación**, que al buscar cuentas existentes por NIT solo revisaba las primeras 1000 y habría duplicado clientes. El modo demo ahora usa el mismo tope que producción (`db-max-rows = 1000` en `scripts/dev-demo.mjs`), para que las pruebas vean estos cortes. Prueba ampliada en `tests/e2e/internacional.spec.ts` (los 33 departamentos y cuatro capitales del final de la lista). Sin cambios de base de datos. Sin revisar: el calendario y el pipeline piden 1000 filas exactas; con más de 1000 actividades u oportunidades abiertas mostrarían solo esas. | Publicado 2026-11-13 (`main` en `5dc99fc`, despliegue de Vercel correcto) |
| 2026-11-13 | `75fa0d3` | **Barra inferior del celular en tema claro: el módulo seleccionado va en blanco** (Luis: el tinte verde no quedaba bien en claro). En claro la barra es navy y el oliva translúcido se veía apagado; ahora el bloque seleccionado lleva tinte, borde y texto blancos. En oscuro sigue el tinte oliva. Luis eligió entre cuatro maquetas (oliva relleno, blanco, azul, crema relleno). Solo CSS (`.dock li > .dock-active` y sus variantes de tema en `globals.css`); `DESIGN.md` actualizado. | Publicado 2026-11-13 (`main` en `ae527e3`, despliegue de Vercel correcto; la hoja de estilos publicada trae el blanco en claro y el oliva en oscuro). Falta que Luis lo vea en su iPhone |
| 2026-11-13 | `9c63c2b` | **Barra inferior del celular: el módulo seleccionado se marca completo** (pedido de Luis: solo se pintaba el ícono y no se notaba dónde estaba). Ahora todo el bloque, ícono y nombre, lleva un tinte oliva con borde y el texto en verde claro en seminegrita; aplica también a «Más» cuando el módulo abierto vive en ese menú. Luis vio tres maquetas (relleno, tinte, ícono y texto) y eligió el tinte. Solo CSS (`.dock li > .dock-active` en `globals.css`); `DESIGN.md` actualizado. | Publicado 2026-11-13 (`main` en `c25561d`, despliegue de Vercel correcto; la hoja de estilos publicada trae la regla). Falta que Luis lo vea en su iPhone |
| 2026-11-13 | `2bfef8d` | **Modo Offline: completar y reprogramar actividades del CRM** (pedido de Luis: pasa durante la labor comercial). En la Agenda sin señal y en la agenda de la ficha del cliente, cada actividad descargada que sigue abierta tiene **«Completar»** y **«Reprogramar»** (una tarea o llamada pide el día; una reunión, día y hora, y conserva su duración). El cambio se ve de una vez (tachada o en su día nuevo, con la marca «Sin enviar»), se puede **«Deshacer»** mientras no salga, y se envía solo al volver la conexión. Es un tipo nuevo de envío, `change` (`OutboxKind`): no crea nada, modifica una actividad existente; cada actividad tiene un solo cambio sin enviar y el siguiente se suma (`saveActivityChange`, `applyActivityChanges`, `activityChanges` en `src/lib/offline/outbox.ts`). El servidor (`/api/sin-conexion/enviar`, `changeActivity`) solo acepta esos dos cambios, con los permisos de quien envía, y sincroniza con Microsoft 365 como el CRM; si la actividad ya no existe o ya no es suya, el envío queda **Rechazado** con el motivo en Envíos. Un cambio ya enviado deja de aplicarse sobre la descarga siguiente (que ya trae la actividad como quedó). Sin cambios de base de datos. Prueba nueva: `tests/e2e/sin-conexion-agenda.spec.ts`. Observado y no cambiado: lo que se guarda mientras otro envío está en curso espera al siguiente intento («Enviar ahora», recuperar la señal u otro registro). No se hizo: editar otros datos de la actividad, ni completar las que se crearon sin señal y aún no se envían (esas ya se pueden editar). | Publicado 2026-11-13 (`main` en `519f399`, despliegue de Vercel correcto). Falta que Luis lo pruebe en su iPhone con una sesión real |
| 2026-11-13 | `0866fbb` | **Botón «Modo Offline» en ámbar** (pedido de Luis: «Ver lo descargado» no se entendía y no llamaba la atención). El enlace de la tarjeta de descarga de Inicio ahora dice «Modo Offline», lleva el ícono de wifi tachado y es ámbar en los dos temas (`.btn-offline` en `globals.css`). Luis propuso rojo; vio las dos maquetas y eligió ámbar, porque el rojo se lee como error o eliminar. El aviso de «Sin conexión» de `PwaRegister` usa el mismo nombre. **No cambió** el título de la pantalla («Consulta sin señal»): falta que Luis diga si también pasa a «Modo Offline». `DESIGN.md` y `sin-conexion.spec.ts` actualizados. | Publicado 2026-11-13 (`main` en `0bcbb52`, despliegue de Vercel correcto; la hoja de estilos publicada trae las reglas). Falta que Luis lo vea en su iPhone |
| 2026-11-13 | `4ef0558` | **Arreglo: en iPhone, «Fecha límite» se montaba bajo «Prioridad» al registrar una actividad sin señal** (reporte de Luis con captura). En iOS un campo de fecha trae su propio ancho mínimo y no se encoge con su columna; en la fila de dos campos se salía. Ahora los campos de fecha, fecha y hora, y hora (`.input[type=date]` y similares, en `globals.css`) aceptan encogerse y, solo en iOS, pierden la apariencia nativa para obedecer el ancho (el selector de fecha del sistema sigue abriendo al tocar); las filas de dos campos de `OfflineForms.tsx` dejan encoger sus celdas. Aplica a todos los formularios, con y sin señal. Comprobado en el simulador de iPhone (iOS 27.2, Safari) con la hoja de estilos real: fecha vacía, fecha con valor y fecha con hora caben en su columna. Sin prueba e2e: Chrome no reproduce el ancho mínimo de iOS. | Publicado 2026-11-13 (`main` en `0bcbb52`, despliegue de Vercel correcto; la hoja de estilos publicada trae las reglas). Falta que Luis lo vea en su iPhone |
| 2026-11-13 | `aa7ce4c` | **Sin luz de fondo en celular** (pedido de Luis con captura de su iPhone: en el teléfono, el tema oscuro se veía azul y no le gustó; en computador sí). Bajo 768 px la luz de fondo no se muestra en ningún tema y la pantalla queda como antes: suelo blanco o negro con el logo quieto. Una regla en `globals.css` (`.fondo-animado { display: none }` bajo 768 px); el componente ya no la animaba ahí. `DESIGN.md` y la prueba de `movil.spec.ts` actualizados. | Publicado 2026-11-13 (`main` en `3b96763`, despliegue de Vercel correcto; la hoja de estilos publicada trae la regla). Falta que Luis lo vea en su iPhone |
| 2026-11-13 | `006cc61` | **Productos: kits y sus componentes** (pedido de Luis). Un kit es una referencia de venta formada por varios componentes (p. ej. «Kit Lvm Oslo con mueble elev 63cm» = lavamanos + mueble). Casilla **«Kit»** en el producto (`is_kit`); un producto es kit o es componente. En la ficha de un kit aparece la tarjeta **«Componentes del kit»** (`src/components/products/KitComponents.tsx`): se busca un producto, se pone la cantidad por kit y «Agregar»; se pueden quitar. La ficha de un componente muestra «Kits que lo incluyen». Reglas, todas en la base (`20261209000100_product_kits`): la **planta de un kit es siempre «KIT»** (se asigna sola; un producto suelto no puede usarla); un kit no puede ser componente de otro kit ni de sí mismo; el mismo componente puede ir en varios kits; un componente en uso no se puede borrar ni marcar como kit; un kit con componentes no puede dejar de serlo. **Planta y Grupo de Artículo dependen de Familia** con la dependencia de listas que ya existía (el administrador la activa en Configuración → Listas de valores → Productos → «Depende de la lista»), **salvo en los kits**: la base no la exige y el formulario ofrece todos los valores al marcar «Kit» (`dependencyOffWhen` en la definición del campo). La lista Planta trae de fábrica el valor «KIT». Decisiones de Luis: los componentes se agregan en la ficha (no en el formulario de creación), la cotización y su PDF muestran solo el kit, y solo los productos que no son kit pueden ser componentes. **Valorización:** nada cambia; cotizaciones, pedidos, pronóstico e informes siguen usando la línea del kit con su precio. **Queda listo para el informe de producción y logística** que Luis pedirá: desplegar bajo cada kit sus componentes con cantidad (= cantidad de la línea × cantidad por kit) y la planta de cada uno, con valor 0. Pruebas: una de base (`scripts/test-db.mjs`) y una de navegador (`tests/e2e/productos-planta-grupo.spec.ts`). No se hizo: importar componentes desde archivo o SAP, ni llevar los kits a la descarga sin conexión. | Publicado 2026-11-13: migración `20261209000100` aplicada (44/44) y código en `main` (`e7ea9c3`), despliegue de Vercel correcto. Falta que Luis active la dependencia de Planta y Grupo con Familia y cargue los valores |
| 2026-11-13 | `09f2ba8` | **Productos: Planta y Grupo de Artículo** (pedido de Luis, para informes de ventas más detallados). Dos campos nuevos de lista en el producto, opcionales: `plant` («Planta») y `item_group` («Grupo de Artículo»). Aparecen en el formulario, en el encabezado de la ficha, como columnas de la lista de productos, en la búsqueda de productos, en los filtros e informes (salen de la definición del objeto) y en la importación (los encabezados de SAP `ItmsGrpNam` / «Grupo de artículos» llenan Grupo de Artículo). **Sus valores no vienen de fábrica**: se crean y modifican en Configuración → Listas de valores → Productos. Para eso la pantalla de listas ahora maneja una lista sin valores estándar: muestra «Sin valores» y el formulario «Nuevo valor» de una vez (antes una lista vacía no se podía empezar); con el primer valor pasa a «Personalizada» y sigue con «Editar» como las demás. Migración `20261208000100_product_plant_item_group` (dos columnas de texto e índices parciales; sin funciones nuevas). Prueba de base en `scripts/test-db.mjs` (se guardan, son opcionales, un asesor los ve y no puede cambiar las listas) y de navegador en `tests/e2e/productos-planta-grupo.spec.ts`. **No se hizo:** traer el grupo de artículos desde SAP en la importación por Service Layer (hoy solo trae nombre y campos personalizados mapeados), ni incluir estos campos en la descarga sin conexión. | Publicado 2026-11-13: migración `20261208000100` aplicada (43/43) y código en `main` (`4156bba`), despliegue de Vercel correcto. Falta que Luis cargue los valores de las dos listas |
| 2026-11-13 | `0e41abe` | **Gráficos con entrada animada** (pedido de Luis a partir de un video de referencia; aprobado sobre una demo en la app tras una ronda de ajustes). Las columnas suben desde su base, las barras horizontales avanzan, las del embudo se abren desde el centro y las líneas de Tendencia del pronóstico se dibujan y luego aparecen sus puntos; una sola vez, en menos de un segundo. Los gráficos que no están a la vista esperan en su primer cuadro y arrancan al entrar en pantalla (`src/components/dashboard/AlVer.tsx`, que pausa y reanuda las animaciones CSS; sin JavaScript o con «menos movimiento» el gráfico se ve completo). Además: carril tenue detrás de cada columna (`MonthlyColumns`, `ColumnChart`), leyenda de Tendencia del pronóstico en pastillas con el valor actual de cada serie y la meta, y sombra en degradado bajo la línea de «Cerrado» (solo esa serie). Clases `chart-*` al final de `globals.css`; cambios en `dashboard/Charts.tsx` y `forecast/TrendChart.tsx`. Sin dependencias nuevas ni cambios de base de datos. `DESIGN.md` gana la sección «Gráficos». **No se hizo:** la meta punteada sobre «Ventas ganadas por mes» (Indicadores no trae la meta mensual), ni el conteo de cifras (descartado: muestra valores que no son reales). Prueba nueva en `analitica.spec.ts`. | Publicado 2026-11-13 (`main` en `d86b635`, despliegue de Vercel correcto; la hoja de estilos publicada trae las reglas). Falta que Luis lo vea en producción |
| 2026-11-13 | `185aafc` | **Luz de fondo detrás del vidrio** (pedido de Luis: que el blur de las tarjetas se aprecie más; aprobado sobre una demo en la app tras una ronda de ajustes). Seis manchas de luz grandes y difusas y dos franjas diagonales detrás del logo y del contenido (`src/components/brand/FondoAnimado.tsx`, montado en `BrandBackdrop`; colores `--fondo-*` al final de `globals.css`). Claro: navy, azul y blanco crema, **sin verde**; oscuro: navy con un matiz de verde oliva bajo. Ciclo de 90 s, lento a propósito. Se mueve con las mismas condiciones que el logo (desde 768 px, sin «menos movimiento», sin vidrio en Sólido); en celular queda quieto y con «menos transparencia» no se muestra. Se dibuja en vivo, sin video ni imágenes ni dependencias nuevas. **Cambia una regla de `DESIGN.md`**: las manchas de color en el fondo estaban descartadas; ahora esta luz de fondo es la única permitida (sección «Luz de fondo»). Nació como composición de HyperFrames (carpeta `fondo-hyperframes`, junto al CRM y fuera del repositorio); el video no se renderizó porque el equipo no tiene ffmpeg, y no hace falta para la app. Pruebas: `analitica.spec.ts` (se mueve y se detiene con menos movimiento), `movil.spec.ts` (quieto en celular), `vidrio.spec.ts` (quieto en Sólido). Sin medir: consumo en equipos lentos. | Publicado 2026-11-13 (`main` en `ae2991c`, despliegue de Vercel correcto; la hoja de estilos publicada trae las reglas). Falta que Luis lo vea en producción y en su iPhone |
| 2026-11-10 | `7412336` | **Cotización en PDF real para el iPhone con el CRM instalado** (decisión de Luis: «Sí, PDF real»). En la app instalada iOS ignora `window.print()`, así que allí el botón «Imprimir o guardar PDF» comparte un archivo `COT-….pdf` con la hoja de compartir de iOS (Imprimir, Guardar en Archivos, correo…); en el resto de equipos sigue el diálogo de imprimir. Ruta nueva `GET /imprimir/cotizacion/[id]/pdf` (solo con sesión y con los permisos de quien la pide; `private, no-store`; el service worker no la guarda), armada en el servidor con `@react-pdf/renderer` y la letra Outfit de `@fontsource/outfit` (**dos dependencias nuevas**). La plantilla `pdf/CotizacionPdf.tsx` repite el contenido de la vista previa (`page.tsx`): **si cambias una, cambia la otra**; ambas leen de `datos.ts`. Tamaño carta, filas y bloques sin partir entre hojas, número de página cuando hay varias, referencias largas sin espacios partidas sin guion. El PDF se pide al abrir la vista porque iOS solo deja compartir justo después del toque. `next.config.ts` (`outputFileTracingIncludes`) manda letras y logo con la función de Vercel. Límite conocido: símbolos fuera de la letra (✓, emojis) salen en blanco. Pruebas: `tests/e2e/cotizacion-pdf.spec.ts` (ruta, sin sesión, botón en computador, botón con iPhone simulado, reintento) y simulador de iPhone. | Publicado 2026-11-10 (`main` en `0184557`, despliegue de Vercel correcto). Falta revisar en iPhone real con sesión de producción |
| 2026-11-10 | `086794e` | **Arreglo: el botón «Imprimir o guardar PDF» quedaba bajo la franja de la hora en la app instalada en iPhone** (reporte de Luis con captura: no lo podía tocar). La vista de imprimir la cotización ocupa toda la pantalla y el botón caía en la franja de la hora, donde los toques no llegan; ahora baja lo que mide esa franja (`env(safe-area-inset-top)`, 0 en el navegador y al imprimir). Comprobado en el simulador (iPhone 18 Pro Max, iOS 27.2, app instalada contra el demo local): el botón queda debajo de la franja y recibe el toque. **Hallazgo al probar:** en la app instalada iOS ignora `window.print()` (no abre nada; en Safari sí), así que el botón todavía no sirve ahí; compartir un archivo PDF sí abre la hoja de iOS con «Imprimir» y «Guardar en Archivos». Queda la decisión de Luis de generar un PDF real (ver «Por confirmar en un iPhone real»). Sin prueba e2e nueva: Chrome no simula la franja ni la app instalada. Sin cambios de base de datos. | Publicado 2026-11-10 (`main` en `0184557`) |
| 2026-11-10 | `d521d12` | **Arreglo: franja gris difuminada sobre la barra navy en la app instalada en iPhone** (reporte de Luis con captura). No era el vidrio del CRM: desde iOS 26 el sistema pinta sobre la franja de la hora un degradado difuminado del **color de fondo de la página** (`html`) y con ese color decide si la hora va oscura o clara; con la página blanca quedaba gris con la hora oscura encima de la barra. Probado en el simulador que no lo quitan ni una barra opaca ni un elemento fijo arriba; sí cambiar el fondo de `html`. Ahora, solo en la app instalada en iOS y en las pantallas con barra superior (`html:has(header.shell-bar)`, al final de `globals.css`), el fondo de la página es el navy de la barra (negro en oscuro) y el blanco lo pinta una capa fija detrás del logo; la página se alarga lo que mide la franja para que en pantallas cortas no quede una banda navy abajo (de paso, el logo de fondo ya llega hasta el borde inferior). Login y el resto de dispositivos no cambian. Comprobado en el simulador (iPhone 18 Pro Max, iOS 27.2, app instalada contra el demo local): claro y oscuro, al abrir en frío, al desplazar, al cambiar de sección y en «Consulta sin señal». Sin prueba e2e: la regla solo se activa en iOS instalado y Chrome no la ejecuta. Sin cambios de base de datos. | Desplegado (2026-11-10, `main` en `5f175c1` con el visto bueno de Luis; avance directo): Vercel construyó sin errores y la hoja de estilos publicada trae la regla. Falta verlo en el iPhone de Luis (cerrar y volver a abrir la app instalada), y el aviso «Sin conexión» con el fondo nuevo |
| 2026-11-10 | `026837a` | **Arreglo: sin señal, tocar una sección abría un error en vez de lo descargado** (reporte de Luis desde su iPhone, en producción). En Vercel los archivos de la app van en `/_next/static/immutable/…` y la app solo reconocía la forma de una compilación local: guardaba la pantalla «Consulta sin señal» sin sus scripts y decía «Descargado». Ahora reconoce las dos formas, no da por guardada una pantalla incompleta, la completa sola al volver a abrir el CRM con señal (repara los teléfonos que ya la tenían a medias) y, si algo falla al abrir, el aviso sale en español y no el de Next en inglés. Demo nueva `npm run dev:demo -- --vercel` para probar como en el hosting. Pruebas: toque real en la barra inferior con la red cortada (`movil.spec.ts`), reconocimiento de archivos y reparación (`sin-conexion.spec.ts`). Sin cambios de base de datos. | Desplegado (2026-11-10, `main` en `3270c3c` con el visto bueno de Luis): Vercel construyó sin errores y el sitio publicado sirve la pantalla con sus 14 archivos. Falta que Luis repita la prueba en el iPhone |
| 2026-11-10 | `4adf656` | **Modo sin conexión subido a `main`** con el visto bueno de Luis: la rama `codex/migraciones-seguras` y `main` quedaron en el mismo commit (avance directo, 19 commits: borradores, partes A, B y C, y el prototipo de iPhone en `mobile/`, que no cambia la app web). Antes de subir se revisó que no salieran claves ni archivos reservados. | Desplegado (2026-11-10): Vercel construyó sin errores; sitio publicado con `/sin-conexion` y `sw.js` v4. Falta la prueba con sesión real y en teléfonos |
| 2026-11-10 | `5731c71` | Publicadas en producción las dos migraciones del modo sin conexión: `20261206000100_offline_snapshot` (descarga de «Preparar el día») y `20261207000100_offline_quotes` (precio de lista de las cotizaciones hechas sin señal). Comprobado después: 42 de 42 en el historial, permisos de las dos funciones como en la migración, columna vacía en las líneas existentes y asesor de seguridad sin hallazgos nuevos. | Migraciones aplicadas con `db:publicar` y visto bueno de Luis (42/42) |
| 2026-11-10 | `4374fa7` | **Modo sin conexión, parte C: cotizaciones sin señal.** En «Consulta sin señal» se arma una cotización sin red desde la ficha del cliente o desde Productos: el teléfono pone el precio que le toca a ese cliente (lista propia o de su canal) y calcula los totales con IVA igual que el CRM. Queda «Sin enviar» con número provisional y editable; al volver la señal llega sola al CRM como borrador, con su número oficial, después de su cliente si este también se creó sin señal. Si el precio de lista cambió desde la descarga se respeta el cotizado, se le avisa al asesor y la línea queda marcada «Cotizado sin señal» en la cotización del CRM, con el precio de lista vigente al llegar. Un producto que ya no está disponible la deja Rechazada para corregirla. 149 comprobaciones de base; prueba nueva `tests/e2e/sin-conexion-cotizaciones.spec.ts`. | Desplegado (2026-11-10); migración `20261207000100_offline_quotes` publicada el mismo día |
| 2026-11-10 | `6ffc622` | **Modo sin conexión, parte B: bandeja de salida, actividades y crear cliente.** En «Consulta sin señal» ahora se crea un cliente y se registran actividades (tarea, llamada, reunión, correo, nota) sin red. Quedan en el dispositivo y se envían solos al CRM cuando vuelve la conexión, primero los clientes y luego sus actividades; cada registro queda Pendiente, Enviado o Rechazado con el motivo, y se puede corregir, reenviar o descartar en la pestaña nueva «Envíos». La cabecera del CRM avisa «N sin enviar». Al cerrar sesión con registros sin enviar se avisa y se conservan hasta que entre la misma persona; nadie más los ve ni los envía. Sin cambios de base de datos. Prueba nueva `tests/e2e/sin-conexion-envios.spec.ts`. | Desplegado (2026-11-10) |
| 2026-11-09 | `f47e84b` | **Modo sin conexión, parte A: «Preparar el día» y consulta sin señal** (plan aprobado por Luis, con sus 6 decisiones en la sección 6). Una tarjeta en Inicio descarga al dispositivo los clientes del asesor con contactos, sus oportunidades abiertas, su agenda de 7 días y el catálogo con precios, y dice cuándo se descargó. La pantalla nueva «Consulta sin señal» (`/sin-conexion`, también en el menú de usuario) los muestra sin red: agenda, clientes, oportunidades y productos con el precio que le toca a cada cliente, calculado en el teléfono con la regla del CRM (`db:test` comprueba que coincide con la base). Sin red, cualquier pantalla del CRM lleva allí y recuerda a dónde volver. Lo descargado se borra al cerrar sesión y cuando entra otra persona. Service worker v4; `npm run dev:demo -- --produccion` para probar con la app compilada. 147 comprobaciones de base; prueba nueva `tests/e2e/sin-conexion.spec.ts`. | Desplegado (2026-11-10); migración `20261206000100_offline_snapshot` publicada el mismo día |
| 2026-11-09 | `18576a5` | **Modo sin conexión, fase 1: borradores en el dispositivo.** Lo que se escribe en el formulario de un registro o en el de actividades se guarda en el dispositivo mientras se llena, se recupera al volver a abrirlo («Descartar borrador» lo quita) y no se pierde si al guardar no hay internet o el envío falla (aviso «Sin conexión: no se guardó…», que se lleva a la vista). Se borra al guardar, al cancelar, al cerrar sesión y a los 14 días. De paso: las listas desplegables ya no vuelven a su valor anterior cuando un guardado sale con errores (pasaba en todos los formularios), y el resultado de guardar se lleva a la vista en formularios largos. Sin cambios de base de datos. Prueba nueva `tests/e2e/borradores.spec.ts`. | Desplegado (2026-11-10) |
| 2026-11-09 | `5d110e1` | **App de iPhone instalada en el iPhone de Luis** (iPhone 17 Pro Max, iOS 27.2) con su Apple ID personal: compilada y firmada desde la terminal con el equipo y el identificador de prueba `com.firplak.crm.prueba` pasados en el comando, sin tocar el proyecto. Comandos en la sección 3. Instalación confirmada por `devicectl`; tras confiar en el desarrollador y verificar la app en el iPhone, Luis confirmó que abre, que entra con su cuenta y que pide Face ID al volver a abrirla. Sin cambios de código. | En `main` desde el 2026-11-10; no cambia la app web |
| 2026-11-09 | `10dd46c` | **Bloqueo con Face ID en la app de iPhone** (`mobile/ios/App/App/Bloqueo.swift`): tapa la app con la pantalla del sello y pide Face ID (o el código del iPhone) al abrir y al volver después de 5 minutos, solo con sesión iniciada; no guarda contraseñas. También se tapa en el selector de apps. Probado en el simulador (cara que coincide, cara que no, cancelar, volver antes y después del tiempo, sin sesión); falta un iPhone real. La app web no cambia. | En `main` desde el 2026-11-10; no cambia la app web |
| 2026-11-09 | `cc5bae4` | **Prototipo de app de iPhone** en `mobile/` (Capacitor 8): abre el CRM publicado en una vista web, con ícono y pantalla de arranque del sello, hora y batería que cambian de color según el fondo, campos sin zoom, gesto de volver y página «Sin conexión». La app web no cambia: solo se excluye `mobile/` de TypeScript y ESLint. Probada en el simulador contra el demo local y dejada apuntando a producción. | En `main` desde el 2026-11-10; no cambia la app web |
| 2026-11-09 | `76572e8` | Ícono de la app más grande (pedido de Luis): el sello ocupa el 74 % del ícono (antes 60 %) y el 62 % en el adaptable de Android, dentro de su zona segura. | Desplegado (2026-11-09) |
| 2026-11-09 | `479564d` | Ícono de la app: sello con la «A» oficial de Firplak y «CRM» en Outfit Bold (la letra de la app, en trazos), elegido por Luis entre 4 propuestas. Íconos de 192 y 512, adaptable de Android y de iPhone regenerados desde `public/brand/firplak-crm-sello-white.svg`; el de la barra de estado de Android sigue siendo solo la «A». | Desplegado (2026-11-09) |
| 2026-11-09 | `0a70713` | Publicada en producción la migración `20261205000100_alerts_plural` (aviso diario «Tienes 1 tarea vencida» / «Tienes N tareas vencidas»); asesor de seguridad sin hallazgos nuevos. Rama `codex/migraciones-seguras` subida con los 6 pasos de la crítica. | Migración aplicada con `db:publicar` y visto bueno de Luis (40/40); interfaz desplegada |
| 2026-11-08 | `9c51205` | Paso 6 del plan de la crítica, pulido: «Eliminar» de las fichas pasa a botón discreto (texto rojo sin borde) y no compite con «Editar»; en las líneas de cotización y pedido, «Guardar» se resalta solo cuando esa línea tiene cambios sin guardar. Lista de lo que queda de la crítica en Pendientes. e2e. | Desplegado (2026-11-09) |
| 2026-11-08 | `1eec313` | Paso 5 del plan de la crítica, accesibilidad: «Saltar al contenido» como primer Tab (lleva al `main`, y el siguiente Tab sigue dentro); anillo de foco sólido de más de 3:1 en claro (navy) y en oscuro (oliva), con borde del color de la superficie (antes ~1.7:1); ejes de los gráficos, títulos del menú de Configuración, «Informe de…» y notificaciones de 10.9 px a 11.5 px (escala Caption); en el celular el gráfico mensual rotula un mes sí y uno no; párrafos de ayuda de Pipelines, Listas y Listas de precios en 75 caracteres por línea. Pendiente: sugerencias en Ctrl K. e2e. | Desplegado (2026-11-09) |
| 2026-11-08 | `b7e4591` | Paso 4 del plan de la crítica, simplificar y ordenar: Indicadores con protagonista (4 cifras de ventas en tarjetas, 2 por fila en el celular; las otras 9 en dos paneles con título, «Seguimiento comercial» y «Prospectos, cotizaciones, pedidos y casos», con cifra secundaria de 1.7rem en DESIGN.md), embudos sin oportunidades en una línea, la lista de cierres en 30 días ya no se estira. Ficha de oportunidad: Detalles no repite Valor, Cierre y Probabilidad (están en la cabecera) ni Cerrada/Ganada; «Motivo de pérdida» solo si tiene valor y no se pide al crear (nuevo `createHidden`). Informes con columnas alineadas entre carpetas. Metas vacías con botón para definirlas. e2e. | Desplegado (2026-11-09) |
| 2026-11-08 | `0a70713` | Paso 3 del plan de la crítica, claridad: una unidad por contexto (tarjeta «Millones COP», resúmenes «$X M», registros en pesos completos; regla en DESIGN.md): metas y resumen de meta «$780 M de $1,500 M · Faltan $720 M» (sin «Brecha» en pesos completos), campañas en «$X M». Sustantivos que concuerdan con la cifra en Indicadores e Inicio («1 pedido»), unidades en el PDF («1 unidad», «400 unidades»), fechas legibles en Buscar. «Tareas vencidas» en Inicio dice «Requieren seguimiento / Al día». «Total» de cotizaciones y pedidos pasa a «Total con IVA» (el neto es el que suma a la oportunidad). Sin jerga («pg_cron», «JSON») en Pronóstico y Configuración. Página de error con código para soporte. «Caliente» ya no usa el color de peligro. El campo de ejemplo «canal» queda inactivo en la semilla (era un segundo «Canal»). La demo genera los avisos del día al arrancar. Migración `20261205000100_alerts_plural`. e2e y db:test. | Migración aplicada el 2026-11-09 con `db:publicar` y visto bueno de Luis (40/40) |
| 2026-11-08 | `6396cb4` | Paso 2 del plan de la crítica, confirmaciones con consecuencia: diálogo propio (`useConfirm`, `<dialog>` modal, Esc cancela, foco en «Volver» si es peligroso) en vez del `confirm()` del navegador. Pide confirmar y explica qué pasa antes de: cotización Aceptada (se separa la parte o gana la oportunidad), Rechazada, Reemplazada; pedido Activado (crea la oferta en SAP) y Cancelado; «Marcar ganada»; eliminar registros, actividades, líneas, miembros de campaña y vistas. «Marcar ganada» se oculta si ya está perdida y viceversa. e2e de cada confirmación. | Desplegado (2026-11-09) |
| 2026-11-08 | `1093677` | Crítica de diseño (`/impeccable critique`, 25/40), paso 1 del plan, celular: las fichas (plantilla, cuenta, oportunidad, contacto) ya no se desbordan (grilla de una columna `minmax(0,1fr)`), botón «Registrar actividad» arriba que lleva al panel (`#actividad`), los 5 tipos de actividad siempre a la vista, líneas de cotización con etiquetas y total en el celular, formulario de agregar en 3 columnas, inicio con «Para hoy» primero y oportunidades como lista, unidades «Millones COP» sin partirse. e2e del celular. | Desplegado (2026-11-09) |
| 2026-11-08 | `41939db` | Configuración → Pipelines: las marcas de «Avanza con cotización» dicen cuándo se activan, «Al presentar la primera cotización» y «Al aceptarse una parte (quedan otras abiertas)», en vez de «Propuesta presentada» y «Negociación», que se confundían con estados de la cotización. Solo textos (los valores guardados no cambian). | Sin push: falta desplegar |
| 2026-11-07 | `127ede9` | **Cotizaciones como partes del negocio** y cómo mueven la oportunidad (decisiones de Luis): valor = suma de partes abiertas (sin «Sincronizar»); parte aceptada con otras abiertas se separa en su propia oportunidad ganada (con reparto y pedidos; «Partes ganadas» en la original); la última abierta aceptada gana la original; etapas «Propuesta presentada» y «Negociación» por pipeline («Avanza con cotización», solo hacia adelante); aviso al asesor y su jefe si se rechazan todas las pendientes; estado «Reemplazada»; marcar Perdida rechaza lo abierto (no con partes aceptadas o pedidos activos); oportunidad cerrada no admite cotizaciones; pedido cancelado avisa. 139 comprobaciones de base y e2e del flujo. | Migración `20261204000100` aplicada con `db:publicar` y visto bueno de Luis (39/39); desplegado |
| 2026-11-07 | `b8299a2` | **Pipelines por mercado** además del canal (decisiones de Luis): cada pipeline es Nacional o Internacional (los actuales quedan Nacionales); la oportunidad va al del mercado y canal de su cuenta y, si falta, se bloquea con un mensaje; si cambia el mercado o el canal de la cuenta, sus oportunidades abiertas pasan al pipeline nuevo (sin él, el cambio se rechaza). «Duplicar» copia un pipeline con sus etapas a otro mercado. Etapa de la oportunidad, oportunidad nueva, conversión de prospecto, filtro del Kanban e Indicadores (un embudo por mercado y canal) usan el mercado. Demo con pipelines internacionales copiados. 136 comprobaciones de base y e2e. | Migración `20261203000100` aplicada con `db:publicar` y visto bueno de Luis (38/38); desplegado |
| 2026-11-07 | `50fd8b2` | Cotización: el campo «Notas» pasa a **«Observaciones»** (comentarios para el cliente, se imprimen). PDF: «Dirección de facturación» y «Dirección de entrega» con su título (la de entrega es la de facturación si no se escribió otra), condiciones con su nombre completo e Incoterm, bloque propio de «Observaciones», y ningún bloque ni la firma quedan partidos entre páginas. e2e del PDF. | Sin push: falta desplegar |
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
