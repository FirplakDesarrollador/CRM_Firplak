---
version: 1
slug: "src-app-globals-css"
primary_target: "src/app/globals.css"
related_targets: []
---

Scope: toda la app autenticada y el acceso. Modo: Operate. Tarea: leer y actualizar información comercial. Solo diseño: no cambia lógica, datos ni rutas. Tema por defecto: el del dispositivo. Movimiento: lento y constante; quieto en celular.

## Direction contract

THESIS: paneles de vidrio con blur flotando sobre un fondo blanco o negro, con el logo azul de Firplak moviéndose despacio detrás. Rechaza el panel gris de tarjetas planas típico de un CRM; las bolas, el crema, la foto de producto y el logo en cada tarjeta fueron probados y descartados por Luis.

OWN-WORLD: blanco puro en claro con barra navy; negro puro en oscuro con barra negra; verde oliva como acento y en la pestaña activa; botones del contenido azules en claro y oliva en oscuro; azul en datos y logo. Vidrio con borde de luz y brillo superior, esquinas amplias que se deforman al pasar el cursor (el Liquid Morph que Luis pidió). Outfit como única familia.

STORY: la persona entra, lee sus cifras sobre vidrio y encuentra módulos y controles donde los espera. El logo acompaña; nunca tapa un dato.

FIRST VIEWPORT: barra y módulos arriba, pestaña activa como píldora oliva; debajo, título de página y tarjetas KPI de vidrio; el logo azul, cerca de la esquina inferior derecha, se difumina al pasar detrás. En celular, dock flotante abajo y logo quieto.

FORM: dirección fijada por Luis tras varias rondas de muestras sobre la app real; la aprobada es `.impeccable/mocks/fondo7` con barra navy ("Sí, aplícala", 3 nov 2026); construcción por código. Movimiento característico: el logo recorre el fondo en un ciclo de 40 segundos, y el blur va pasando de una tarjeta a otra. seed: none (dirección fijada por Luis; sin sorteo)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
