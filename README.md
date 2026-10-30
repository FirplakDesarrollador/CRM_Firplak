# Firplak CRM

CRM comercial de Firplak construido con **Next.js 16 (App Router, TypeScript)** y **Supabase** (Postgres + Auth + RLS).
Funcionalidad inspirada en los CRM empresariales (barra de objetos, listas con vistas guardadas, fichas con listas
relacionadas, pipeline por etapas), con identidad visual propia de Firplak.

## Módulos incluidos (Fases 1 a 8)

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
| Casos | Servicio y garantías: número automático, estado, prioridad, origen, tipo, producto, solución y actividad. |
| Campañas | Miembros (contactos y prospectos) con estado de respuesta, prospectos generados, oportunidades influenciadas, ventas ganadas y retorno. |
| Calendario | Vista mensual y semanal de reuniones, tareas y llamadas; filtro por asesor o equipo; crear actividad desde un día. |
| Informes | Constructor sobre cualquier objeto: filtros, agrupación por filas y columnas (fechas por mes/trimestre/año), contar/sumar/promediar, barras o columnas, tabla matriz con totales y % del total, detalle de registros, guardar en carpetas, compartir y exportar CSV. |
| Correo | Redactor desde contacto, prospecto, oportunidad o caso con plantillas y campos combinados (`{{contacto.nombre}}`, `{{cuenta.nombre}}`…); envío con Resend si está configurado o apertura del cliente de correo; siempre queda registrado como actividad. |
| Listas de valores | Personalización de las listas de selección (tipos, sectores, orígenes, motivos de pérdida, tipos de caso, familias…): agregar, ordenar, desactivar o restablecer. |
| Reglas de validación | Bloquean el guardado cuando el registro cumple condiciones (p. ej. «Cliente requiere NIT», «Motivo de pérdida obligatorio»); se aplican en formularios, pipeline y rutas de estado. |
| Automatizaciones | Al crear/actualizar (opcionalmente solo si cambia un campo) y si se cumplen condiciones: asignar propietario, crear tarea, notificar (propietario, jefe o usuario) o actualizar un campo. Notificaciones en la campana de la cabecera. |
| Auditoría | Historial de cambios por campo en cada ficha (registrado por triggers de la base) y vista global en Configuración → Auditoría de cambios. |
| Metas | Cuotas por asesor o de la compañía, por mes, trimestre o año (ventas ganadas, negocios ganados, oportunidades y prospectos nuevos, actividades). Avance con ritmo esperado, brecha y estado; resumen en Inicio e Indicadores. Las define administración o el gerente para su equipo (nadie la propia). |
| Pronóstico | Por mes, trimestre o año: cerrado, compromiso, mejor caso y pipeline por asesor (según la categoría de pronóstico de cada oportunidad) frente a su meta de ventas, con barra apilada y marca de la meta. El gerente (o administración) registra un **ajuste** con nota que reemplaza el pronóstico calculado; cada cifra abre la lista de oportunidades filtrada. |
| Aprobaciones | Procesos configurables por objeto (Configuración → Procesos de aprobación): condiciones de entrada, aprobador (jefe directo del propietario o un usuario), bloqueo del registro mientras espera y cambios de campos al enviar, aprobar y rechazar o retirar. Se envían desde la ficha con comentario; el aprobador decide desde la ficha o la **bandeja de aprobaciones** (rechazar exige motivo) y recibe avisos en la campana. Historial en la pestaña Aprobaciones. Ejemplo incluido: cotizaciones en borrador con más de 15 % de descuento (`discount_percent`) las aprueba el jefe directo y pasan a «Aprobada». |
| Idioma | Español o inglés por usuario (Mis preferencias). Se traducen la interfaz, las fechas (meses, «hoy», «en N días»), las opciones de listas fijas y los mensajes del servidor. Los datos (etapas, valores de listas, campos personalizados, mensajes de reglas) se muestran como se crearon, y las etiquetas de agrupación por fecha de los informes salen en español. |
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
| `npm run lint` / `typecheck` | Calidad de código. |
| `npm run db:test` | Aplica migraciones + semilla en un Postgres embebido (PGlite) y prueba RLS, triggers e indicadores. |
| `npm run db:types:local` | Regenera `src/lib/database.types.ts` desde las migraciones (sin Docker). |
| `npm run db:types` | Regenera los tipos desde el proyecto enlazado con la CLI de Supabase. |
| `npm run db:bundle` | Genera `supabase/setup.sql` (migraciones + semilla) para el SQL Editor. |
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
- Automatizaciones programadas (acciones a N días de una fecha del registro) con Supabase Cron.
- Aprobaciones en varios pasos (p. ej. jefe y luego gerencia comercial según el monto).
- Historial del pronóstico (instantáneas semanales) para comparar contra semanas anteriores.
- Traducción de valores de listas de selección por idioma (etiqueta en español e inglés).
