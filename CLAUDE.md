# Firplak CRM — instrucciones para Claude

@AGENTS.md

## Forma de trabajo (instrucción fija de Luis)

- Al terminar una fase con **`npm run db:test`, `npm run lint` y `npm run build` en verde**, haz el
  **commit local sin preguntar** y sigue **de inmediato** con la siguiente fase que recomiendes.
- **Nunca hagas push.** Solo cuando Luis lo pida explícitamente.
- Detente a preguntar **solo** cuando necesites una decisión de diseño, credenciales o accesos
  externos, o vayas a hacer algo destructivo.
- Antes de cada commit revisa que no entren claves ni archivos `.env*` (salvo `.env.example`),
  `rea/` ni `supabase/setup*.sql`. Cierra los mensajes de commit con la línea de coautoría indicada
  por el entorno.

## Reglas del proyecto

- Las claves solo van en `.env.local` o en las variables del hosting; nunca en el código. La
  `service_role` y los secretos (`MS365_*`, `SAP_*`, `CRON_SECRET`, `SUPABASE_JWT_SECRET`,
  `RESEND_API_KEY`) son solo de servidor.
- No modifiques `rea/`. Nunca apliques REA ni extracción o copia sobre Salesforce: los módulos se
  basan en su documentación pública.
- Interfaz en español (con traducción en `src/lib/i18n/en-ui.ts`), responsive, con el Firplak Design
  System (navy #254153, sage #749094, ink #1d1d1b, cream #f5f1ea; Outfit y Fraunces; iconos Lucide).
- Cada cambio de base de datos va en una migración nueva de `supabase/migrations/` con su prueba en
  `scripts/test-db.mjs`; después `npm run db:types:local`.
- Verifica en el navegador con `npm run dev:demo` (base en memoria, Microsoft 365 simulado).
- Si cambias la interfaz, corre también `npm run test:e2e` y agrega la prueba del flujo en `tests/e2e/`. Los clics reales
  importan: un clic por JavaScript se saltó un error de cierre de sesión que solo aparecía con el mouse.
- La integración con el ERP es con **SAP Business One** (Service Layer); los clientes se vinculan por
  el Código SAP (CardCode) y los productos por la Referencia (ItemCode).
