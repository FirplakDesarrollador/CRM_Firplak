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
Crea todas las tablas, la seguridad y la configuración base (perfiles, roles, pipelines y etapas,
campos personalizados, listas, reglas, procesos de aprobación, informes y plantillas) **sin** las
empresas ni personas de ejemplo.

> ¿Ya instalaste con `npm run db:bundle` (con datos de ejemplo)? No hay que reinstalar: el primer
> administrador entra a **Configuración → Resumen → Borrar datos de ejemplo**.

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

## 9. Microsoft 365: Outlook y Teams (TI con un administrador de Microsoft 365)

**Registrar la aplicación en Entra ID** ([entra.microsoft.com](https://entra.microsoft.com) → Identidad → Aplicaciones → Registros de aplicaciones → *Nuevo registro*):

1. Nombre: `Firplak CRM`. Tipo de cuenta: *solo este directorio (un inquilino)*.
2. URI de redirección, plataforma **Web**: `https://crm.firplak.com/api/ms365/callback`
   (Configuración → Microsoft 365 en el CRM muestra la dirección exacta).
3. **Certificados y secretos → Nuevo secreto de cliente** (24 meses). Copia el *valor* (solo se muestra
   una vez) y anota en el calendario la fecha de vencimiento para renovarlo.
4. **Permisos de API → Microsoft Graph → Permisos delegados:** `User.Read`, `Calendars.ReadWrite`,
   `Mail.Read`, `Mail.Send`, `offline_access`, `openid`, `profile`, `email`. Luego **Conceder
   consentimiento de administrador** para Firplak.
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

**Cada persona:** Mis preferencias → **Microsoft 365** → *Conectar con Microsoft 365* y, la primera vez,
*Sincronizar ahora*. Desde ese momento sus reuniones del CRM aparecen en Outlook al crearlas; las
reuniones y correos de Outlook con clientes se traen con *Sincronizar ahora*.

## 10. Lista de verificación antes de anunciarlo

- [ ] Iniciar sesión, cerrar sesión y recuperar contraseña funcionan en el dominio final.
- [ ] Un asesor solo ve lo que debe (prueba con un usuario de cada perfil).
- [ ] Un gerente ve lo de su equipo y aprueba una cotización con descuento.
- [ ] Las importaciones quedaron completas (comparar cantidades con SAP).
- [ ] Las alertas programadas aparecen en la campana al día siguiente (pg_cron activo).
- [ ] Copias de seguridad activas en Supabase.

## Lo que sigue después de salir en vivo

- **Planner** y **SharePoint**, y sincronización automática periódica con Outlook.
- Integración con **SAP Business One** por el Service Layer: socios de negocio, pedidos, despachos
  y facturas, usando el Código SAP y la Referencia como llaves.
