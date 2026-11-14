# Agente de sincronización SAP → CRM

El Service Layer de SAP Business One solo responde dentro de la red de Firplak (oficina o VPN), y el CRM
corre en la nube. Este programa corre en un equipo dentro de la red, lee SAP y deja una copia de solo
lectura en el CRM. **Nunca escribe en SAP.**

Qué trae, de lunes a viernes a las 7, 9, 11, 13, 15 y 17 horas:

- De cada cuenta del CRM que tiene **Código SAP**: saldo de cartera, cupo, pedidos de venta abiertos y
  las diez facturas más recientes.
- De cada producto activo del CRM (por su Referencia): inventario por bodega y listas de precios.

Si a esa hora el equipo está apagado, dormido o fuera de la red, la corrida se salta o falla, y el CRM
sigue mostrando la copia anterior con su hora. Cada corrida queda registrada en Configuración → SAP.

## Instalación (macOS)

1. **Configuración** (sin contraseñas). Copia `config.ejemplo.json` a `~/.firplak-crm/agente-sap.json`
   y complétalo: URL del Service Layer, base de datos y usuario de SAP; URL y clave pública (anon) del
   CRM; y el correo del usuario técnico del agente. `sapCertificadoAutofirmado: true` acepta el
   certificado autofirmado **solo** para el servidor de SAP.
2. **Contraseñas, en el Llavero de macOS.** Cada comando pide la contraseña y no la muestra:

   ```bash
   security add-generic-password -U -s firplak-crm-agente-sap -a sap -w
   ```

   ```bash
   security add-generic-password -U -s firplak-crm-agente-sap -a crm -w
   ```

   La primera es la del usuario de SAP; la segunda, la del usuario técnico del agente en el CRM.
3. **Prueba** (no guarda nada):

   ```bash
   node agente-sap/agente.mjs probar
   ```

4. **Primera corrida a mano y luego dejarlo solo:**

   ```bash
   node agente-sap/agente.mjs correr --ahora
   ```

   ```bash
   node agente-sap/agente.mjs instalar
   ```

Otros comandos: `estado` (si está instalado) y `desinstalar` (deja de correr solo).
Registro: `~/Library/Logs/Firplak CRM agente SAP.log`.

## Seguridad

- Las contraseñas solo viven en el Llavero del equipo. No van en archivos, en el repositorio ni en el CRM.
- El usuario técnico del agente tiene el perfil «Integración SAP»: no ve clientes ni negocios. Solo
  puede pedir la lista de códigos por sincronizar y guardar la copia, por cuatro funciones de la base.
- El agente solo hace `GET` contra SAP (además del inicio y cierre de sesión), con una sola sesión por
  corrida.
- Lo ideal es un usuario de SAP de solo lectura dedicado al CRM.

## Pasarlo a otro equipo

Repite la instalación en el equipo nuevo y corre `desinstalar` en el anterior. No hay nada más que mover.
