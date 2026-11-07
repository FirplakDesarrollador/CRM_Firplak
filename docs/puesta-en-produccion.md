# Firplak CRM · Puesta en producción

Guía para salir en vivo con datos reales, sin depender todavía de la sincronización con SAP
Business One. Sigue los pasos en orden; cada uno dice quién lo hace.

> Las claves solo van en las variables de entorno del hosting o en `.env.local` (que no se sube a
> GitHub). Nunca en el código ni en mensajes.

---

## 1. Proyecto de Supabase (TI / Luis)

1. Crea un proyecto en [supabase.com](https://supabase.com). Región sugerida: **South America (São Paulo)**,
   la más cercana a Colombia. Guarda la contraseña de la base en un gestor de contraseñas.
2. **Database → Extensions:** activa **pg_cron**. Sin esta extensión, las alertas diarias, las
   automatizaciones programadas y las instantáneas semanales del pronóstico solo corren a mano.
3. **Authentication → Providers → Email:** deja activo el correo. Si no quieres que los usuarios
   confirmen el correo al registrarse, desactiva *Confirm email*.
4. **Authentication → URL Configuration:** *Site URL* = la dirección final (p. ej.
   `https://crm.firplak.com`) y en *Redirect URLs* agrega `https://crm.firplak.com/auth/callback`.
5. Opcional pero recomendado en producción: plan **Pro** para copias de seguridad diarias y
   recuperación a un punto en el tiempo (*Point in Time Recovery*).

## 2. Base de datos limpia (TI)

```bash
cd firplak-crm
npm install
npm run db:bundle:produccion
```

Abre `supabase/setup-produccion.sql`, pégalo en **Supabase → SQL Editor** y ejecútalo **una sola vez**.
Crea todas las tablas, la seguridad y la configuración inicial (perfiles, roles, pipelines y etapas,
campos personalizados, listas, reglas, procesos de aprobación, informes y plantillas) **sin ningún
registro ficticio**: ni empresas, personas o productos de ejemplo, ni metas ni TRM de ejemplo. Corre en una
sola transacción y se detiene sin cambiar nada si la base ya tiene el CRM.

> ¿Ya instalaste con `npm run db:bundle` (con datos de ejemplo)? No hay que reinstalar: el primer
> administrador entra a **Configuración → Resumen → Borrar datos de ejemplo**. Las metas de compañía de
> ejemplo no se borran con ese botón: en **Metas**, para cada periodo (mes, trimestre y año), deja vacío el
> valor de la compañía y guarda.

### Cambios posteriores (base ya instalada)

Nunca se vuelve a ejecutar el archivo de instalación ni se aplican semillas. Cada cambio llega como migración:

```bash
npx supabase link --project-ref <ref>                 # una vez; pide la contraseña de la base
npm run db:pendientes -- --proyecto <ref>             # revisa el historial y lo pendiente (no cambia nada)
npm run db:publicar   -- --proyecto <ref>             # pide escribir el ref y aplica solo lo pendiente
```

Después: asesor de seguridad de Supabase (Advisors → Security) y, si hubo dudas, la huella del esquema
(`scripts/huella-esquema.sql` frente a `npm run db:huella`).

> **Proyecto actual (`kltekrfpquakyffbpmiv`):** su historial no coincide con los archivos porque las migraciones
> se aplicaron con el MCP de Supabase. Antes del primer `db:publicar` hay que conciliarlo:
> [conciliacion-migraciones.md](conciliacion-migraciones.md). Mientras tanto `db:publicar` se detiene solo.

## 3. Publicar la aplicación (TI)

Recomendado: **Vercel** (creadores de Next.js), conectado al repositorio privado de GitHub.

1. En [vercel.com](https://vercel.com) → *Add New Project* → importa `firplak-crm`.
2. **Environment Variables** (Production):

   | Variable | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon / publishable key |
   | `NEXT_PUBLIC_SITE_URL` | `https://crm.firplak.com` |
   | `ALLOWED_EMAIL_DOMAINS` | `firplak.com` (solo correos de Firplak pueden registrarse) |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key — **solo servidor**. Habilita invitar usuarios y los asistentes de IA. |
   | `RESEND_API_KEY`, `EMAIL_FROM` | Opcional: envío de correos desde el CRM (dominio verificado en Resend). |

3. *Deploy*. Luego, en *Domains*, agrega `crm.firplak.com` y crea el registro DNS que Vercel indique.
4. Vuelve a Supabase (paso 1.4) y confirma que la *Site URL* y el *Redirect URL* usan ese dominio.

## 4. Primer administrador (Luis)

1. Entra a `https://crm.firplak.com/registro` y regístrate. **El primer usuario queda como administrador.**
2. **Mis preferencias:** idioma, tema y página de inicio.

## 5. Estructura comercial (Luis / gerencia comercial)

En **Configuración**, en este orden:

1. **Jerarquía de roles:** ajusta los roles de ejemplo a la estructura real (gerencia, regionales,
   asesores por zona). Un gerente ve lo de los roles que están debajo del suyo.
2. **Perfiles y permisos:** revisa qué puede hacer cada perfil. Para los asistentes de IA, activa
   *Usar asistentes de IA (MCP)* y, si corresponde, *Hacer cambios con asistentes de IA*.
3. **Usuarios:** invita a cada persona (o pídeles que se registren con su correo de Firplak) y
   asígnales **rol, perfil y jefe directo**. El jefe directo es necesario para las aprobaciones.
4. **Compartir por defecto:** visibilidad base de cada objeto (p. ej. cuentas visibles para todos,
   oportunidades privadas por jerarquía).
5. **Pipelines y etapas**, **Listas de valores** y **Campos personalizados:** ajústalos a cómo vende
   Firplak. Los de ejemplo son un punto de partida.
6. **Reglas de validación, Procesos de aprobación y Automatizaciones:** vienen ejemplos activos
   (NIT obligatorio para clientes, motivo de pérdida, aprobación de descuentos > 15 %, avisos de
   cierre y de cotizaciones vencidas). Revísalos y desactiva los que no apliquen.
   La regla **«Cliente requiere código SAP»** viene **inactiva**: actívala cuando todos los clientes
   tengan su código.
7. **Metas:** hay metas de compañía de ejemplo para el periodo actual; ajústalas o bórralas y
   define las de cada asesor.

## 6. Cargar los datos desde SAP Business One (Luis / TI)

Mientras no exista la sincronización, la carga inicial se hace con exportaciones de SAP a Excel
guardadas como **CSV UTF-8** (Excel → Guardar como → *CSV UTF-8*). El asistente de importación
(**Configuración → Importar datos**) reconoce los encabezados de SAP en inglés y en español.

| Orden | Qué | Desde SAP | Columnas que el CRM reconoce |
|---|---|---|---|
| 1 | Usuarios | — | Crear antes (paso 5). El vendedor se enlaza por nombre o correo. |
| 2 | Productos | Datos maestros de artículos | `ItemCode`/«Número de artículo» → Referencia; `ItemName`/«Descripción del artículo» → Nombre |
| 3 | Cuentas | Datos maestros de socios de negocio (clientes) | `CardCode`/«Código SN» → Código SAP; `CardName`/«Nombre SN» → Nombre; `LicTradNum` → NIT; `Phone1`, `E_Mail`, `City`, `State1`, `Address`; `SlpName` → Propietario |
| 4 | Contactos | Personas de contacto | `CardCode` → Cuenta (por código SAP); `FirstName`, `LastName`, `E_MailL`, `Tel1`, `Cellolar`, `Position` |
| 5 | Oportunidades abiertas | Oportunidades de venta o una hoja propia | `CardCode` → Cuenta; nombre, etapa, valor y fecha de cierre |

Consejos:

- Usa la **Referencia de producto = ItemCode de SAP** y el **Código SAP de la cuenta = CardCode**.
  Son la llave para la sincronización futura.
- Para cuentas, elige **«Crear o actualizar» por Código SAP**: puedes repetir la importación sin
  duplicar clientes. El NIT también sirve como llave.
- Descarga la plantilla del asistente si prefieres armar el archivo con las columnas del CRM.
- Revisa el informe de errores de cada importación (se puede descargar) y corrige en Excel.
- Importa primero un archivo pequeño (10–20 filas) para validar el formato.

## 7. Regla de operación mientras no hay sincronización

- **Clientes nuevos:** se crean primero en SAP y luego en el CRM, copiando el **CardCode**.
  Cuando actives la regla «Cliente requiere código SAP», el CRM no dejará guardar un cliente sin él.
- **Pedidos:** el CRM lleva el seguimiento comercial (cotización → pedido). La orden de venta
  oficial y la facturación siguen en SAP; anota el número de documento de SAP en la orden de compra
  o la descripción del pedido hasta que exista la integración.

## 8. Asistentes de IA (opcional)

Con `SUPABASE_SERVICE_ROLE_KEY` configurada (paso 3) y los permisos activos en los perfiles
(paso 5.2):

- **ChatGPT y Claude en la web:** agrega un conector personalizado con la dirección
  `https://crm.firplak.com/api/mcp`. La aplicación te lleva al CRM para iniciar sesión y autorizar
  (solo consulta o también cambios). No hay que copiar tokens.
- **Claude Code, Claude Desktop, Cursor, Antigravity o Grok:** cada persona crea su token en
  **Mis preferencias → Asistentes de IA** y copia la configuración de su asistente.

Administración ve y revoca tokens y aplicaciones conectadas y revisa el registro de uso en
**Configuración → Asistentes de IA**.

## 9. Microsoft 365: Outlook, Teams, Planner y SharePoint (TI con un administrador de Microsoft 365)

**Registrar la aplicación en Entra ID** ([entra.microsoft.com](https://entra.microsoft.com) → Identidad → Aplicaciones → Registros de aplicaciones → *Nuevo registro*):

1. Nombre: `Firplak CRM`. Tipo de cuenta: *solo este directorio (un inquilino)*.
2. URI de redirección, plataforma **Web**: `https://crm.firplak.com/api/ms365/callback`
   (Configuración → Microsoft 365 en el CRM muestra la dirección exacta).
3. **Certificados y secretos → Nuevo secreto de cliente** (24 meses). Copia el *valor* (solo se muestra
   una vez) y anota en el calendario la fecha de vencimiento para renovarlo.
4. **Permisos de API → Microsoft Graph → Permisos delegados:** `User.Read`, `Calendars.ReadWrite`,
   `Mail.Read`, `Mail.Send`, `Tasks.ReadWrite`, `Files.ReadWrite.All`, `Sites.Read.All`,
   `offline_access`, `openid`, `profile`, `email`. Luego **Conceder consentimiento de administrador**
   para Firplak.
5. En *Información general* copia el **Id. de directorio (inquilino)** y el **Id. de aplicación (cliente)**.

**Variables en Vercel** (solo servidor):

| Variable | Valor |
|---|---|
| `MS365_TENANT_ID` | Id. de directorio (inquilino) |
| `MS365_CLIENT_ID` | Id. de aplicación (cliente) |
| `MS365_CLIENT_SECRET` | Valor del secreto de cliente |
| `MS365_ENCRYPTION_KEY` | Clave para cifrar los tokens: genera una con `openssl rand -base64 32` y guárdala en el gestor de contraseñas. Si se pierde, cada persona debe volver a conectar su cuenta. |

`SUPABASE_SERVICE_ROLE_KEY` también es necesaria para publicar en Teams.

**Teams:** en cada canal que deba recibir avisos → *…* → **Flujos de trabajo** → plantilla
«Publicar en un canal cuando se recibe una solicitud de webhook» → copia la dirección. En el CRM:
**Configuración → Microsoft 365 → Canales de Teams** → agrégala y pulsa *Probar*. Luego, en
**Automatizaciones**, usa la acción **Publicar en Teams** (p. ej. al ganar una oportunidad).

**SharePoint:** un administrador que ya conectó su cuenta va a **Configuración → Microsoft 365 →
Documentos en SharePoint**, busca el sitio comercial y pulsa *Usar* en la biblioteca de documentos.
Las carpetas se crean en `CRM/Cuentas/<cuenta>` y `CRM/Oportunidades/<oportunidad>`; los permisos de
acceso a los archivos son los de SharePoint.

**Sincronización automática:** agrega la variable `CRON_SECRET` (una cadena aleatoria larga, p. ej.
`openssl rand -hex 32`) y programa una llamada a `https://crm.firplak.com/api/ms365/sync` cada 15–30
minutos con el encabezado `Authorization: Bearer <CRON_SECRET>`:

- **Vercel Pro:** *Settings → Cron Jobs* (Vercel envía ese encabezado solo si la variable se llama
  `CRON_SECRET`). En el plan Hobby los cron solo pueden correr una vez al día.
- **Otra opción:** cualquier programador externo (p. ej. un flujo de Power Automate con
  «Recurrencia» + «HTTP») con el mismo encabezado.

Además, cada persona se sincroniza sola al abrir **Inicio** si pasaron más de 15 minutos.

**Cada persona:** Mis preferencias → **Microsoft 365** → *Conectar con Microsoft 365*, elige su **plan y
depósito de Planner** y, la primera vez, *Sincronizar ahora*. Desde ese momento sus reuniones y tareas
del CRM aparecen en Outlook y Planner al crearlas. Quien conectó su cuenta antes de la Fase 21 verá
el aviso *Volver a conectar* para aceptar los permisos de Planner y SharePoint.

## 10. SAP Business One (TI y el administrador de SAP)

El CRM **lee** de SAP (cartera, pedidos, facturas, inventario, artículos) y, solo si lo habilitas,
**crea ofertas de venta** al activar pedidos. No crea órdenes de venta ni socios de negocio.

1. Crear en SAP un **usuario técnico** (p. ej. `crm.integracion`) con licencia que permita el Service
   Layer, autorizaciones de **lectura** para socios de negocio, pedidos de cliente, facturas de
   clientes y artículos, y —solo si usarás las ofertas desde el CRM— permiso para **crear ofertas de
   venta**. Nada más.
2. Verificar que el servidor del CRM (Vercel) llega al Service Layer por https
   (`https://<servidor-sap>:50000/b1s/v1`). Si SAP está en la red interna, publicarlo a través de un
   proxy inverso con certificado válido y, de preferencia, restringido por IP.
3. **Variables en Vercel** (solo servidor):

   | Variable | Valor |
   |---|---|
   | `SAP_SL_URL` | `https://<servidor-sap>:50000/b1s/v1` |
   | `SAP_COMPANY_DB` | Base de datos de la compañía (p. ej. `SBO_FIRPLAK`) |
   | `SAP_USER` / `SAP_PASSWORD` | Usuario técnico de solo lectura |

4. En **Perfiles y permisos**, activa **Ver información de SAP** en los perfiles que deban ver cartera,
   pedidos, facturas e inventario.
5. Cada cuenta necesita su **Código SAP (CardCode)** y cada producto su **Referencia = ItemCode** (ver la
   sección 6).
6. **Configuración → SAP Business One:** *Probar conexión*; activa, si quieres, «Al activar un pedido,
   crear su oferta de venta en SAP».
7. **Importar productos:** en la misma página, opcionalmente filtra por prefijo de código y relaciona
   campos personalizados de productos con campos de SAP (p. ej. `U_Linea`, `ItemsGroupCode`); revisa la
   vista previa y pulsa *Importar ahora* cuando quieras. Se crean los productos nuevos y se actualizan
   nombre y campos relacionados de los existentes; los precios y la familia no se tocan.

## 11. App en el celular (asesores)

El CRM es una app web instalable (PWA): no pasa por tiendas de aplicaciones y se actualiza sola cada
vez que se publica una versión nueva. Requiere el dominio final con **https**.

- **Android (Chrome):** abrir el CRM, iniciar sesión y tocar *Instalar* en el aviso de Inicio, o menú ⋮ →
  *Instalar app*.
- **iPhone (Safari):** abrir el CRM, tocar *Compartir* → *Agregar a inicio*.
- **Computador (Chrome o Edge):** ícono de instalar en la barra de direcciones.

Las mismas instrucciones están en Mis preferencias → *App en el celular*. La app necesita internet: sin
conexión muestra un aviso y no guarda datos del CRM en el teléfono.

## 12. Notificaciones push (TI)

Lo que llega a la campana también puede llegar al celular o al computador, aunque el CRM esté cerrado.
Es opcional: sin estas variables, la campana sigue funcionando igual.

1. **Claves:** genera un par de claves una sola vez y guárdalas en el gestor de contraseñas. Si se cambian,
   cada dispositivo se vuelve a suscribir solo la próxima vez que abra el CRM.

   ```bash
   npx web-push generate-vapid-keys
   ```

2. **Variables en el hosting** (solo servidor; requieren también `SUPABASE_SERVICE_ROLE_KEY`):

   | Variable | Valor |
   |---|---|
   | `VAPID_PUBLIC_KEY` | Clave pública generada |
   | `VAPID_PRIVATE_KEY` | Clave privada generada |
   | `VAPID_SUBJECT` | Contacto de TI, p. ej. `mailto:ti@firplak.com` |
   | `CRON_SECRET` | La misma cadena de la sección 9, o una nueva (`openssl rand -hex 32`) |

3. **Envío inmediato:** en Supabase → *Database → Webhooks → Create a new hook*: tabla `notifications`,
   evento **Insert**, tipo *HTTP Request*, método `POST`, URL
   `https://crm.firplak.com/api/push/dispatch` y el encabezado
   `Authorization: Bearer <CRON_SECRET>`.
4. **Respaldo:** programa una llamada a esa misma dirección cada 5 a 15 minutos, con el mismo encabezado
   (igual que la sincronización de la sección 9). Recoge lo que el webhook no alcance a enviar. Lo que lleve
   más de un día sin enviarse ya no se envía, pero sigue en la campana.
5. **Cada persona:** Mis preferencias → **Notificaciones push** → *Activar notificaciones* en cada dispositivo
   y *Enviar prueba*. En **iPhone** primero debe instalar la app (sección 11) y activarlas desde ella
   (iOS 16.4 o superior).

**Privacidad:** el contenido viaja cifrado y los servicios de Google, Apple, Mozilla o Microsoft no pueden
leerlo, pero el título y el texto se ven en la pantalla del dispositivo; cada persona decide en los ajustes
de su celular si se muestran con la pantalla bloqueada. Al cerrar sesión, ese dispositivo deja de recibir.

## 13. Lista de verificación antes de anunciarlo

- [ ] Iniciar sesión, cerrar sesión y recuperar contraseña funcionan en el dominio final.
- [ ] Un asesor solo ve lo que debe (prueba con un usuario de cada perfil).
- [ ] Un gerente ve lo de su equipo y aprueba una cotización con descuento.
- [ ] Las importaciones quedaron completas (comparar cantidades con SAP).
- [ ] Las alertas programadas aparecen en la campana al día siguiente (pg_cron activo).
- [ ] Copias de seguridad activas en Supabase.
- [ ] La app se instala en un Android y en un iPhone y abre en Inicio.
- [ ] Una notificación de la campana (p. ej. una aprobación) llega como push a un Android y a un iPhone.

## Lo que sigue después de salir en vivo

- **SAP Business One:** sincronizar clientes (socios de negocio) cuando se decida.
