# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Asesores comerciales, gerentes y administradores de Firplak. Trabajan en computador y en celular para gestionar cuentas, oportunidades, cotizaciones y metas.

- **Asesor comercial:** lleva sus cuentas, oportunidades, cotizaciones y actividades.
- **Gerente:** es el jefe directo de sus asesores; aprueba los descuentos que superan el límite y define las metas de su equipo.
- **Administración:** configura canales, pipelines, listas de precios, permisos e integraciones.

## Product Purpose

CRM comercial interno de Firplak: reúne cuentas, contactos, prospectos, oportunidades, cotizaciones, pedidos, casos, campañas, actividades, indicadores, metas y pronóstico en un solo lugar.

## Positioning

Hecho al proceso comercial de Firplak (decisión de Luis, 7 nov 2026). Cada canal de venta tiene su propio pipeline y su lista de precios. Se conecta con SAP Business One: los clientes por su Código SAP (CardCode) y los productos por su Referencia (ItemCode). Maneja pesos y dólares con la TRM oficial, y aprueba descuentos con el jefe directo. Todo eso queda en una sola herramienta, en lugar de adaptar un CRM genérico.

## Operating Context

Se usa durante la jornada comercial, en oficina y entre visitas, y se instala en el celular como app. Se integra con SAP Business One y Microsoft 365. Los usuarios eligen tema claro u oscuro; por defecto sigue el dispositivo. También eligen el nivel de vidrio (Transparente, Medio o Sólido); por defecto es Medio.

Estructura comercial (confirmada por Luis, 7 nov 2026):

- **Canales de venta:** Canal Constructores, Canal Distribución y Canal B2C. El canal es obligatorio en cuentas y prospectos. Junto con el mercado, define el pipeline de las oportunidades y la lista de precios de las cotizaciones.
- **Pipelines por mercado y canal** (decisión de Luis, 7 nov 2026): el negocio constructor o de distribución en Colombia no es el mismo que en el exterior (p. ej. Estados Unidos), así que cada mercado y canal tiene su pipeline y sus etapas, y su propio embudo. Si falta el pipeline, la oportunidad no se crea hasta que exista.
- **Varias cotizaciones en una oportunidad** son partes del negocio (alcances distintos que pueden aceptarse a la vez y sumar al valor), no alternativas (respuesta de Luis, 7 nov 2026). Reglas (decisiones de Luis, 7 nov 2026): el valor de la oportunidad es la suma de sus partes abiertas; cada parte que el cliente acepta mientras quedan otras abiertas se separa en su propia oportunidad ganada (así ventas, metas y pronóstico cuentan cada etapa aprobada en su mes y el pipeline no se infla); la oportunidad avanza sola, solo hacia adelante, a las etapas de propuesta y negociación marcadas en su pipeline; gana cuando no quedan partes abiertas; si todas las pendientes se rechazan, se avisa al asesor y a su jefe, sin cerrarla sola.
- **Listas de cliente:** un cliente puede tener su propia lista con sus productos codificados. Lo que no está en ella se cotiza con la lista del canal y queda marcado «No codificado».
- **Mercados:** Nacional, en pesos (COP), e Internacional, en dólares (USD), convertidos con la TRM.
- **Listas por mercado y canal** (decisión de Luis, 7 nov 2026): la lista de precios depende del mercado de la cuenta además de su canal, y la moneda sale del mercado. Nunca se cruza de mercado, canal ni moneda; si falta la lista compatible, se bloquea hasta crearla. En el mercado Internacional cada canal necesita su lista; en el Nacional puede usarse una lista general nacional. Al cambiar el mercado de una cuenta, los borradores sin productos pasan solos; los que tienen productos se avisan para revisión; las cotizaciones presentadas y los pedidos no cambian.
- **Cotización:** «Facturar a» es la cuenta de la oportunidad. Las direcciones y las condiciones de pago vienen de la cuenta y se pueden escribir a mano cuando hace falta.

## Capabilities and Constraints

Interfaz en español, con traducción al inglés. Permisos por perfil y rol. Los cambios de diseño no alteran la lógica, los datos ni las rutas.

Formato de números en toda la app (decisión de Luis, 7 nov 2026): coma de miles y punto decimal, como en 1,250,000.50. Aplica a montos, cantidades y porcentajes, al escribir y al mostrar, en pesos y en dólares, en pantalla, PDF e informes. Los campos de dinero ponen las comas mientras se escribe.

## Brand Commitments

Nombre y logos de Firplak. Paleta de navy, azul, verde oliva, blanco y negro, sin exigir los valores exactos del manual de Firplak; modo claro blanco con barra navy y modo oscuro negro (decisiones de Luis, 3 nov 2026). Glassmorphism con blur, sobre todo en las tarjetas de información, y el logo azul de Firplak en movimiento lento de fondo.

## Evidence on Hand

Modo demo con datos de prueba (`npm run dev:demo`). No hay clientes, cifras ni testimonios reales en este repositorio. Los datos reales viven solo en la base de producción y no se copian al código, a las pruebas ni a los diseños.

## Product Principles

- La información comercial se lee antes que el efecto visual.
- Una misma pantalla debe funcionar en computador y en celular.
- Cada estado importante se entiende sin depender solo del color.

## Accessibility & Inclusion

Contraste mínimo 4.5:1 en texto, foco visible, uso con teclado, y respeto por las preferencias de menos movimiento y menos transparencia.
