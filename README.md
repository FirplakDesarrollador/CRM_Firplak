# Firplak CRM

CRM comercial de Firplak construido con **Next.js 16 (App Router, TypeScript)** y **Supabase** (Postgres + Auth + RLS).
Funcionalidad inspirada en los CRM empresariales (barra de objetos, listas con vistas guardadas, fichas con listas
relacionadas, pipeline por etapas), con identidad visual propia de Firplak.

## Módulos incluidos (Fases 1 a 24)

| Módulo | Qué incluye |
|---|---|
| Autenticación | Ingreso, registro (dominios permitidos), recuperación de contraseña, invitaciones (opcional). El primer usuario es administrador. |
| Cuentas | Lista con vistas guardadas, búsqueda, filtros, columnas, orden, exportación CSV; ficha con oportunidades, contactos, cuentas relacionadas y actividad. |
| Contactos | Lista y ficha; WhatsApp/correo directos; oportunidades donde es contacto principal; jerarquía "reporta a". |
| Oportunidades | Lista, **pipeline Kanban** (arrastrar y soltar o selector por tarjeta), ruta de etapas en la ficha, marcar ganada/perdida con motivo, historial de etapas. |
| Actividades | Tareas, llamadas, reuniones, correos y notas; agenda personal (vencidas, hoy, próximas, reuniones 14 días); línea de tiempo en cada registro. |
| Indicadores | KPIs (ventas ganadas, pipeline, ponderado, tasa de éxito, ticket promedio, ciclo de venta, actividades), embudo, ventas por mes, ranking por asesor, origen de ventas, cierres próximos. Filtros por periodo, asesor y pipeline. |
| Prospectos | Lista, ficha con ruta de estados y **conversión** a cuenta (nueva o existente) + contacto + oportunidad; las actividades y campañas pasan al contacto. |
| Productos y listas de precios | Catálogo con referencia, familia y unidad; precios por lista (estándar, distribuidores…) editables en la ficha. |
| Cotizaciones | Numeración automática, líneas desde la lista de precios con descuento, subtotal/IVA/flete/total, ruta de estados, **sincronización** con la oportunidad y vista imprimible con la marca (guardar como PDF). |
| Pedidos | Órdenes de venta con numeración automática (PED-1001…). Se crean desde una cotización **aceptada** («Crear pedido» copia cuenta, contacto, condiciones y productos) o manualmente desde la cuenta u oportunidad. Ruta de estados Borrador → Activado → En producción → Despachado → Entregado (o Cancelado): los productos solo se editan en borrador, un pedido activado no vuelve a borrador ni se elimina, y se registran fechas de activación y entrega. Orden de compra del cliente, entrega solicitada, totales con IVA y flete; aparecen en cuentas, oportunidades, cotizaciones, búsqueda global e Indicadores («Pedidos en curso»). |
| Casos | Servicio y garantías: número automático, estado, prioridad, origen, tipo, producto, solución y actividad. |
| Campañas | Miembros (contactos y prospectos) con estado de respuesta, prospectos generados, oportunidades influenciadas, ventas ganadas y retorno. |
| Calendario | Vista mensual y semanal de reuniones, tareas y llamadas; filtro por asesor o equipo; crear actividad desde un día. |
| Informes | Constructor sobre cualquier objeto: filtros, agrupación por filas y columnas (fechas por mes/trimestre/año), contar/sumar/promediar, barras o columnas, tabla matriz con totales y % del total, detalle de registros, guardar en carpetas, compartir y exportar CSV. |
| Correo | Redactor desde contacto, prospecto, oportunidad o caso con plantillas y campos combinados (`{{contacto.nombre}}`, `{{cuenta.nombre}}`…); envío con Resend si está configurado o apertura del cliente de correo; siempre queda registrado como actividad. |
| Listas de valores | Personalización de las listas de selección (tipos, sectores, orígenes, motivos de pérdida, tipos de caso, familias…): agregar, ordenar, desactivar o restablecer. |
| Reglas de validación | Bloquean el guardado cuando el registro cumple condiciones (p. ej. «Cliente requiere NIT», «Motivo de pérdida obligatorio»); se aplican en formularios, pipeline y rutas de estado. |
| Automatizaciones | Al crear/actualizar (opcionalmente solo si cambia un campo) o **programadas por fecha** (también en pedidos) (N días antes o después de una fecha del registro, p. ej. 3 días antes del cierre o 1 día después del vencimiento de una cotización), si se cumplen condiciones: asignar propietario, crear tarea, notificar (propietario, jefe o usuario) o actualizar un campo. Las programadas corren cada día a las 6:30 a. m. con pg_cron (o con «Ejecutar programadas ahora») y se disparan una sola vez por registro y fecha. Notificaciones en la campana de la cabecera. |
| Auditoría | Historial de cambios por campo en cada ficha (registrado por triggers de la base) y vista global en Configuración → Auditoría de cambios. |
| Metas | Cuotas por asesor o de la compañía, por mes, trimestre o año (ventas ganadas, negocios ganados, oportunidades y prospectos nuevos, actividades). Avance con ritmo esperado, brecha y estado; resumen en Inicio e Indicadores. Las define administración o el gerente para su equipo (nadie la propia). |
| Pronóstico | Por mes, trimestre o año: cerrado, compromiso, mejor caso y pipeline por asesor (según la categoría de pronóstico de cada oportunidad) frente a su meta de ventas, con barra apilada y marca de la meta. El gerente (o administración) registra un **ajuste** con nota que reemplaza el pronóstico calculado; cada cifra abre la lista de oportunidades filtrada. **Historial:** instantánea semanal (lunes 6:00 a. m. con pg_cron, o «Tomar instantánea» para administración) por asesor y de cada oportunidad; gráfico de tendencia (cerrado, pronóstico y potencial frente a la meta, con el valor de hoy en vivo), variación de cada cifra frente a la instantánea elegida y **cambios en el pipeline** desde esa fecha (nuevas, valor ↑/↓, fecha movida o fuera del periodo, cambio de etapa, ganadas o perdidas). |
| Aprobaciones | Procesos configurables por objeto (Configuración → Procesos de aprobación) con **varios pasos en orden**: cada paso tiene sus condiciones (si no se cumplen, se omite) y su aprobador (jefe directo del propietario, jefe del aprobador anterior o un usuario). Además: condiciones de entrada, bloqueo del registro mientras espera y cambios de campos al enviar, aprobar y rechazar o retirar. Se envían desde la ficha con comentario; cada aprobador decide desde la ficha o la **bandeja de aprobaciones** (rechazar exige motivo) y recibe avisos en la campana. Historial por paso en la pestaña Aprobaciones. Ejemplo incluido: cotizaciones en borrador con más de 15 % de descuento las aprueba el jefe directo y, si superan 25 %, también su jefe (gerencia comercial); al final pasan a «Aprobada». |
| Equipos de venta | **Equipo de la cuenta** y **equipo de la oportunidad** (pestaña Equipo de la ficha): personas que trabajan el registro con un rol (asesor de proyectos, especificador, soporte técnico…; lista personalizable en Listas de valores) y un nivel de acceso, sin cambiar el propietario. En cuentas se elige el acceso a la cuenta y, por separado, a sus oportunidades, casos y contactos; las cotizaciones y pedidos de esas oportunidades se ven en solo lectura. El acceso de equipo nunca permite eliminar. Lo gestionan el propietario, su jerarquía y quien modifica todo; cada persona agregada recibe un aviso. **Equipo predeterminado** en Mis preferencias → Mi equipo, que se agrega con un botón o solo al crear registros. En las listas de cuentas y oportunidades, el alcance «Mi equipo» muestra los registros donde la persona está en el equipo. |
| Reparto de ingresos | En la pestaña «Equipo y reparto» de la oportunidad, el valor se reparte entre vendedores en porcentajes que suman 100 % (p. ej. 50/50 cuando el cliente es de un asesor y la obra está en la zona de otro), con motivo opcional y botón «Partes iguales». Cada vendedor recibe su parte en **metas** (ventas y negocios ganados), **pronóstico** e instantáneas, y en el filtro por asesor y el ranking de **Indicadores**; las cifras del pronóstico abren los negocios donde la persona tiene participación. Quien recibe una parte entra al equipo (lectura) y recibe aviso; si cambia el propietario, su parte pasa al nuevo. Sin reparto, el 100 % es del propietario. Lo editan el propietario, su jerarquía y quien modifica todo. |
| Asistentes de IA (MCP) | Servidor MCP en `/api/mcp` para usar el CRM desde Claude (Code, Desktop y web), ChatGPT, Cursor, Antigravity o Grok. **ChatGPT y Claude en la web** se conectan con OAuth 2.1 (registro dinámico, PKCE, tokens de 1 hora con refresco rotativo): la persona inicia sesión, elige solo consulta o también cambios, y puede desconectar la aplicación cuando quiera. Para los demás, cada persona crea su token en **Mis preferencias → Asistentes de IA** (se muestra una vez, con la configuración de cada asistente) y el asistente actúa como ella: mismos permisos y visibilidad. Herramientas: buscar, listar con filtros, ver registro, describir campos, mis pendientes, pronóstico, metas e indicadores; y, con permiso, crear y actualizar registros, mover oportunidades de etapa y completar actividades. **Todo cambio pide confirmación:** la primera llamada devuelve una vista previa y solo se aplica al repetirla con el código de confirmación (10 minutos, un solo uso). Se activa por perfil (**Usar asistentes de IA** y **Hacer cambios con asistentes de IA**); administración ve y revoca tokens y revisa el registro de uso en Configuración → Asistentes de IA. |
| Código SAP | Campo **Código SAP (CardCode)** en cuentas para vincular cada cliente con su socio de negocio en SAP Business One: se guarda en mayúsculas y sin espacios, no se repite entre cuentas, se busca en las listas y se importa por CSV. |
| Salida en vivo | Instalación limpia sin datos de ejemplo (`npm run db:bundle:produccion`) o botón **Borrar datos de ejemplo** en Configuración → Resumen (conserva usuarios y configuración). La importación reconoce los encabezados de las exportaciones de **SAP Business One** (CardCode, CardName, LicTradNum, ItemCode…) y enlaza contactos y oportunidades con su cuenta por el código SAP; las cuentas se pueden crear o actualizar por Código SAP. Regla «Cliente requiere código SAP» lista para activar. Guía completa en [docs/puesta-en-produccion.md](docs/puesta-en-produccion.md). |
| Microsoft 365 | Cada persona conecta su cuenta (Mis preferencias → Microsoft 365): sus **reuniones del CRM pasan a su calendario de Outlook** (al crearlas o cambiarlas; si se cancelan, se borran), las **reuniones de Outlook con contactos o prospectos del CRM** se importan como actividades, los **correos** que intercambia con ellos quedan registrados en la cuenta y el contacto, y los correos del CRM **salen de su buzón de Outlook**. Sin duplicados (cada elemento queda vinculado) y sin invitar a nadie automáticamente. **Teams:** administración agrega canales (flujo de webhook) en Configuración → Microsoft 365 y las automatizaciones tienen la acción **Publicar en Teams** (p. ej. «¡Negocio ganado!» en el canal de ventas). **Planner:** cada persona elige su plan y depósito; sus tareas del CRM se crean allí asignadas a ella, y completar en Planner o en el CRM completa en el otro. **SharePoint:** administración elige el sitio y la biblioteca; cada cuenta y oportunidad tiene la pestaña **Documentos** para crear su carpeta (CRM/Cuentas/… o CRM/Oportunidades/…), ver sus archivos, abrirlos en SharePoint y subir archivos de hasta 4 MB. **Sincronización automática:** al abrir Inicio (si pasaron más de 15 minutos) y con un cron cada 15–30 minutos (`/api/ms365/sync` con `CRON_SECRET`). Tokens de Microsoft cifrados (AES-256-GCM). En el modo demo funciona con un Microsoft 365 simulado. |
| SAP Business One | Consulta de **solo lectura** por el Service Layer: pestaña **SAP** en las cuentas con Código SAP (saldo de cartera, vencido, cupo de crédito y disponible con alerta si se superó, pedidos de venta abiertos y facturas recientes) y en los productos por su Referencia = ItemCode (inventario por bodega, comprometido, disponible y listas de precios). Permiso **Ver información de SAP** por perfil; herramienta MCP `sap_cliente`. **Pedidos → ofertas de venta:** si administración lo habilita (Configuración → SAP Business One), al activar un pedido se crea su **oferta de venta** en SAP (nunca una orden de venta), con el Código SAP de la cuenta y la Referencia de cada producto; un experto la valida en SAP y la convierte en la orden que inicia la fabricación. El pedido muestra el número de la oferta y su estado en SAP, y permite reintentar si SAP la rechazó. **Importación de productos** cuando tú decidas: código y descripción, más los campos personalizados de productos que relaciones con campos de SAP (p. ej. `U_Linea`), con filtro por prefijo y vista previa. Los clientes no se sincronizan (se vinculan por su Código SAP). En el modo demo funciona con un Service Layer simulado. |
| App móvil (PWA) | El CRM se **instala en el celular** (Android, iPhone) y en el computador como una app: ícono Firplak, pantalla completa y accesos directos a *Registrar actividad*, *Pipeline* y *Cuentas*. En pantallas pequeñas la navegación pasa a una **barra inferior** (Inicio, Cuentas, Pipeline, Actividades y *Más* con el resto de módulos según el perfil). Sin conexión muestra un aviso y una página propia; los datos siempre vienen del servidor (no se guardan datos del CRM en el teléfono). Instrucciones en Mis preferencias → *App en el celular*. |
| Idioma | Español o inglés por usuario (Mis preferencias). Se traducen la interfaz, las fechas, los mensajes del servidor y los **valores de las listas**: tipos, estados, orígenes, etapas, pipelines y opciones de campos personalizados, en listas, fichas, filtros, formularios, Kanban, informes e indicadores. Los valores se guardan en español; el inglés usa un diccionario estándar y se puede ajustar en Configuración (Listas de valores, Pipelines y etapas, Campos personalizados). Los campos personalizados y los pipelines también tienen **nombre (y ayuda) en inglés** opcional. Siguen como se escribieron los textos libres (nombres de registros, notas, mensajes de reglas y nombres de informes). |
| Importar datos | Asistente CSV (Excel → CSV, `;` o `,`, UTF-8 o ANSI) para cuentas, contactos, prospectos, oportunidades y productos: mapeo automático de columnas, relaciones por nombre, propietario por nombre o correo, crear o actualizar existentes (NIT por dígitos, correo, referencia…), reglas de validación, informe y descarga de errores, historial. |
| Duplicados | Aviso al crear cuentas, contactos o prospectos parecidos (NIT, correo o nombre normalizado) con opción de guardar de todas formas; Configuración → Duplicados lista parejas y las fusiona moviendo todos sus registros relacionados. |
| Alertas programadas | Avisos diarios en la campana: cierres vencidos, oportunidades sin actividad (N días) y resumen de tareas vencidas. Se programan con pg_cron a las 7:00 a. m. de Colombia si la extensión está disponible; también se pueden ejecutar a mano. |
| Configuración | Usuarios, jerarquía de roles, perfiles y permisos (matriz por objeto), compartir por defecto, pipelines y etapas editables, campos personalizados por objeto. |
| Preferencias | Tema (claro/oscuro/sistema), página de inicio, densidad, registros por página, perfil y contraseña. |

**Campos personalizados en JSON:** se definen en `custom_field_definitions` y sus valores viven en la columna
`custom_fields jsonb` de cada registro. Aparecen automáticamente en formularios, fichas, filtros, vistas y exportación.
Los objetos se describen con metadatos en `src/lib/objects/*.ts` (campos, secciones, relaciones y columnas).

### Seguridad
- **RLS en todas las tablas.** Permisos por objeto (`read/create/edit/delete/view_all/modify_all`) en perfiles,
  visibilidad por **jerarquía de roles** (un gerente ve lo de su equipo) y **compartir por defecto** por objeto.
- Un usuario no puede cambiar su propio rol, perfil ni estado (trigger en base de datos).
- Las claves van en `.env.local` (no versionado). La `service_role` solo se usa en el servidor y es opcional.

## Salir en vivo

Sigue [docs/puesta-en-produccion.md](docs/puesta-en-produccion.md): Supabase, base limpia (`npm run db:bundle:produccion`), publicación en Vercel, primer administrador, estructura comercial y carga de datos desde SAP Business One.

## Probar sin Supabase (modo demo)

Para ver la app en tu equipo sin cuenta ni claves de Supabase:

```bash
cd firplak-crm
npm install
npm run dev:demo
```

Abre http://localhost:3000 y entra con cualquiera de estos usuarios (contraseña `demo1234`):

| Usuario | Perfil |
|---|---|
| `luis.demo@firplak.com` | Administrador (dueño de los datos de ejemplo) |
| `gerente.centro@firplak.com` | Gerente regional, jefe de Camila |
| `asesora.centro@firplak.com` | Asesora comercial (en el equipo de la cuenta Almacenes Casa Viva) |

- Requiere **PostgREST** (macOS: `brew install postgrest`).
- La base de datos vive **en memoria**: se crea con las migraciones y la semilla al arrancar y se borra al cerrar con Ctrl+C. Nada se guarda ni se envía a Supabase.
- Ignora `.env.local`: aunque tengas tus claves reales, el modo demo usa su propia base local, sin la clave `service_role` ni el envío de correos. En el modo demo no hay registro de usuarios nuevos ni recuperación de contraseña.
- Para la base real, usa `npm run dev` con los pasos de la sección siguiente; no hay que cambiar código.

## Asistentes de IA (MCP)

1. En **Configuración → Perfiles y permisos**, activa *Usar asistentes de IA (MCP)* (y, si quieres que puedan hacer cambios, *Hacer cambios con asistentes de IA*) en los perfiles que correspondan. Administración los tiene por defecto.
2. En el servidor, agrega **una** de estas variables (solo servidor, nunca con `NEXT_PUBLIC_`):
   - `SUPABASE_SERVICE_ROLE_KEY` (recomendado): el servidor MCP abre una sesión normal del dueño del token.
   - `SUPABASE_JWT_SECRET`: el *JWT Secret* heredado del proyecto (Settings → API); firma sesiones cortas.
3. Cada persona crea su token en **Mis preferencias → Asistentes de IA** y copia la configuración de su asistente (Claude Code, Claude Desktop, Cursor, Antigravity o Grok). La dirección es `https://TU-DOMINIO/api/mcp`.

4. **ChatGPT y Claude en la web** no usan token: agrega un conector personalizado con la dirección `https://TU-DOMINIO/api/mcp`; la aplicación se registra sola y te pide iniciar sesión y autorizar en el CRM. Requiere que el CRM esté publicado en internet con https (no funciona con localhost). Las aplicaciones conectadas se ven y se desconectan en Mis preferencias → Asistentes de IA y, para administración, en Configuración → Asistentes de IA.

En el modo demo ya está configurado: al arrancar se imprime un token de Luis para probar.

## Puesta en marcha (Supabase en la nube)

1. **Variables de entorno**
   ```bash
   cp .env.example .env.local
   ```
   Completa `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase → Project Settings → API).
   Opcional: `RESEND_API_KEY` y `EMAIL_FROM` para enviar correos desde el CRM (dominio verificado en Resend).
   Para las alertas diarias automáticas, activa la extensión **pg_cron** en Supabase (Database → Extensions) antes de aplicar las migraciones.

2. **Base de datos.** Opción A, SQL Editor (sin instalar nada):
   ```bash
   npm run db:bundle
   ```
   Abre `supabase/setup.sql`, pégalo en Supabase → SQL Editor y ejecútalo **una vez**.

   Opción B, CLI de Supabase (incluida como dependencia de desarrollo):
   ```bash
   npx supabase login
   npx supabase link --project-ref TU_PROJECT_REF
   npm run db:push
   ```

3. **Auth → URL Configuration** en Supabase: *Site URL* `http://localhost:3000` y en *Redirect URLs*
   `http://localhost:3000/auth/callback` (agrega también la URL de producción cuando la tengas).
   Si quieres probar sin confirmar correos, desactiva *Confirm email* en Auth → Providers → Email.

4. **Arrancar**
   ```bash
   npm install
   npm run dev
   ```
   Abre http://localhost:3000, regístrate: **el primer usuario queda como administrador** y recibe los datos de
   demostración (empresas y personas ficticias).

## Scripts

| Script | Uso |
|---|---|
| `npm run dev` / `build` / `start` | Desarrollo, compilación y producción. |
| `npm run dev:demo` | App con una base de demostración en memoria (sin Supabase); ver «Probar sin Supabase». |
| `npm run lint` / `typecheck` | Calidad de código. |
| `npm run db:test` | Aplica migraciones + semilla en un Postgres embebido (PGlite) y prueba RLS, triggers e indicadores. |
| `npm run db:types:local` | Regenera `src/lib/database.types.ts` desde las migraciones (sin Docker). |
| `npm run db:types` | Regenera los tipos desde el proyecto enlazado con la CLI de Supabase. |
| `npm run db:bundle` | Genera `supabase/setup.sql` (migraciones + semilla) para el SQL Editor. |
| `npm run db:bundle:produccion` | Genera `supabase/setup-produccion.sql`: lo mismo, sin los datos de ejemplo (instalación limpia). |
| `npm run db:push` | Aplica migraciones y semilla al proyecto enlazado. |

## Estructura

```
supabase/migrations/   esquema, RLS, triggers e indicadores (SQL)
supabase/seed.sql      perfiles, roles, pipelines, campos y datos demo
src/lib/objects/       metadatos de objetos (campos, secciones, relaciones)
src/lib/records/       consultas, filtros, formularios y Server Actions genéricas
src/app/(auth)/        ingreso, registro, recuperación
src/app/(crm)/         módulos del CRM
src/components/        UI (registros, actividades, oportunidades, indicadores)
```

## Marca
La interfaz sigue el **Firplak Design System** (artifact "Firplak Design System"): paleta navy `#254153`, sage
`#749094`, ink `#1d1d1b` y cream `#f5f1ea` como fondo; estados en tonos tierra; tipografías Outfit (UI) y Fraunces
(acentos); métricas en peso 300; eyebrows en mayúsculas con tracking 0.18em; tarjetas "liquid glass" en KPIs,
cabeceras y paneles, y superficies sólidas en tablas; íconos Lucide con trazo 1.5; números como `3,684 Millones COP`
y `91.4%`. Los logos oficiales están en `public/brand/` y los tokens en `src/app/globals.css`.
La estructura (barra de objetos, ficha de registro con datos destacados, ruta de etapas, listas relacionadas y
línea de tiempo) toma como referencia funcional la documentación pública de Salesforce; no se usan su marca, íconos,
fuentes ni código.

## Próximos pasos sugeridos
- **SAP Business One:** sincronizar clientes (socios de negocio) cuando Luis lo decida.
