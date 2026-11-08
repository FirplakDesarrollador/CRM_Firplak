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

- **Canales de venta:** Canal Constructores, Canal Distribución y Canal B2C. El canal es obligatorio en cuentas y prospectos. Define el pipeline de las oportunidades (cada canal tiene sus etapas) y la lista de precios de las cotizaciones.
- **Listas de cliente:** un cliente puede tener su propia lista con sus productos codificados. Lo que no está en ella se cotiza con la lista del canal y queda marcado «No codificado».
- **Mercados:** Nacional, en pesos (COP), e Internacional, en dólares (USD), convertidos con la TRM.
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
