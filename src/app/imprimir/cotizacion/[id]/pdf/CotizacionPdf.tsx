import path from "node:path";
import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatCurrency, formatDate, formatNumber, formatQuantityUnit } from "@/lib/format";
import type { PrintQuote } from "../datos";

// El PDF de la cotización, con el mismo contenido y orden que la vista previa (`../page.tsx`): si cambias una,
// cambia la otra. Se arma en el servidor porque el iPhone, con el CRM instalado, no abre el diálogo de imprimir.

// Outfit, la letra del CRM. Los archivos salen del paquete @fontsource/outfit y el logo de /public; en Vercel
// viajan con la función gracias a `outputFileTracingIncludes` (next.config.ts).
const fontFile = (name: string) => path.join(process.cwd(), "node_modules", "@fontsource", "outfit", "files", name);
const LOGO = path.join(process.cwd(), "public", "brand", "firplak-wordmark-navy.png");

// Dos familias: la básica y la de letras de otros idiomas europeos (Ł, ő, ş…), que entra solo donde hace falta.
for (const [family, subset] of [["Outfit", "latin"], ["Outfit Ext", "latin-ext"]]) {
  Font.register({
    family,
    fonts: [300, 400, 500].map((fontWeight) => ({ src: fontFile(`outfit-${subset}-${fontWeight}-normal.woff`), fontWeight })),
  });
}
const FONT = ["Outfit", "Outfit Ext"];

// Las palabras no se cortan con guion (las reglas que trae la librería son del inglés). Lo que sí se parte es un
// texto largo sin espacios —una referencia, un correo, un enlace— que no cabe en su columna: después de un guion,
// barra, arroba o punto, o cada 10 letras si no tiene ninguno. Una parte vacía le dice a la librería «aquí puedes
// cambiar de renglón sin agregar guion».
const LONG_TOKEN = 13;
const CHUNK = 10;
Font.registerHyphenationCallback((word) => {
  if (word.length < LONG_TOKEN) return [word];
  const pieces = word.split(/(?<=[-/_@]|\.(?=\D))/).flatMap((piece) => (piece.length > LONG_TOKEN ? piece.match(new RegExp(`.{1,${CHUNK}}`, "gu")) ?? [piece] : [piece]));
  return pieces.flatMap((piece, i) => (i ? ["", piece] : [piece]));
});

const NAVY = "#173650";
const SAGE = "#4c5a1f";
const INK = "#0c0f10";
const INK_700 = "#2a2e2c";
const INK_500 = "#3e423b";
const LINE = "#d9d9d9"; // rgba(29,29,27,0.14) sobre blanco
const LINE_SOFT = "#ededed"; // rgba(29,29,27,0.08) sobre blanco

// Medidas en puntos: las de la vista previa (px) por 0.75, para que el PDF salga igual que la hoja impresa.
const s = StyleSheet.create({
  page: { paddingTop: 40, paddingHorizontal: 40, paddingBottom: 48, fontFamily: FONT, fontSize: 9.75, lineHeight: 1.45, color: INK },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 0.75, borderBottomColor: LINE, paddingBottom: 18 },
  logo: { width: 142.5, height: 39 },
  headerRight: { alignItems: "flex-end" },
  label: { fontSize: 8.25, fontWeight: 500, textTransform: "uppercase", letterSpacing: 1.5, color: SAGE },
  number: { marginTop: 3, fontSize: 18, fontWeight: 300, lineHeight: 1.3, color: NAVY },
  muted: { color: INK_500 },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingVertical: 15 },
  cell: { width: "50%", paddingRight: 18, marginBottom: 12 },
  strong: { marginTop: 6, fontSize: 12, fontWeight: 500, lineHeight: 1.35, color: NAVY },
  row: { flexDirection: "row", borderBottomWidth: 0.75, borderBottomColor: LINE_SOFT, paddingVertical: 6 },
  head: { flexDirection: "row", borderTopWidth: 0.75, borderBottomWidth: 0.75, borderColor: LINE, paddingVertical: 6, fontSize: 7.5, fontWeight: 500, textTransform: "uppercase", letterSpacing: 1.05, color: INK_500 },
  cRef: { width: "15%", paddingRight: 6 },
  cDesc: { flex: 1, paddingRight: 6 },
  cQty: { width: "14%", paddingRight: 6, textAlign: "right" },
  cPrice: { width: "14%", paddingRight: 6, textAlign: "right" },
  cDisc: { width: "7%", paddingRight: 6, textAlign: "right" },
  cTotal: { width: "15%", textAlign: "right" },
  totals: { marginTop: 18, alignSelf: "flex-end", width: 216 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  grand: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 6, paddingTop: 6, borderTopWidth: 0.75, borderTopColor: LINE },
  grandValue: { fontSize: 15, fontWeight: 300, color: NAVY },
  block: { marginTop: 18, paddingTop: 12, borderTopWidth: 0.75, borderTopColor: LINE },
  blockText: { marginTop: 3 },
  footer: { marginTop: 24, paddingTop: 12, borderTopWidth: 0.75, borderTopColor: LINE, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", color: INK_500 },
  tagline: { fontSize: 8.25, textTransform: "uppercase", letterSpacing: 1.5 },
  // Ubicado desde arriba (la hoja carta mide 792 pt de alto): con `bottom`, la librería no dibuja este texto
  // cuando la página define un interlineado.
  pageNumber: { position: "absolute", top: 758, left: 40, right: 40, textAlign: "right", fontSize: 7.5, color: INK_500 },
});

/** El documento listo para `renderToBuffer` (una función y no un componente: la librería pide el <Document> mismo). */
export function cotizacionPdf({ q, lines, billing, shipping }: PrintQuote) {
  const totals: [string, number][] = [
    ["Subtotal", Number(q.subtotal)],
    ["Descuentos", -Number(q.discount_total)],
    ["Total neto", Number(q.net_total)],
    [`IVA (${formatNumber(q.tax_rate)}%)`, Number(q.tax)],
    ["Flete", Number(q.shipping)],
  ];
  const owner = [q.owner?.title, q.owner?.email, q.owner?.phone].filter(Boolean).join(" · ");

  return (
    <Document title={`Cotización ${q.quote_number ?? ""}`.trim()} author="Firplak" creator="Firplak CRM" producer="Firplak CRM" language="es-CO">
      <Page size="LETTER" style={s.page}>
        <View style={s.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- es la imagen de un PDF, no una etiqueta <img> */}
          <Image src={LOGO} style={s.logo} />
          <View style={s.headerRight}>
            <Text style={s.label}>Cotización</Text>
            <Text style={s.number}>{q.quote_number}</Text>
            <Text style={[s.muted, { marginTop: 3 }]}>Fecha: {formatDate(q.created_at)} · Válida hasta: {formatDate(q.expiration_date)}</Text>
          </View>
        </View>

        <View style={s.grid}>
          <View style={s.cell}>
            <Text style={s.label}>Cliente</Text>
            <Text style={s.strong}>{q.bill_to_name ?? q.account?.name}</Text>
            {q.account?.tax_id ? <Text>NIT {q.account.tax_id}</Text> : null}
            {q.contact ? <Text style={{ marginTop: 3 }}>Atención: {q.contact.full_name}{q.contact.email ? ` · ${q.contact.email}` : ""}</Text> : null}
          </View>
          <View style={s.cell}>
            <Text style={s.label}>Proyecto</Text>
            <Text style={s.strong}>{q.name}</Text>
            {q.opportunity ? <Text style={s.muted}>{q.opportunity.name}</Text> : null}
          </View>
          <View style={s.cell}>
            <Text style={s.label}>Dirección de facturación</Text>
            <Text style={s.blockText}>{billing ?? "—"}</Text>
          </View>
          <View style={s.cell}>
            <Text style={s.label}>Dirección de entrega</Text>
            <Text style={s.blockText}>{shipping ?? "—"}</Text>
          </View>
        </View>

        <View style={s.head}>
          <Text style={s.cRef}>Ref.</Text>
          <Text style={s.cDesc}>Descripción</Text>
          <Text style={s.cQty}>Cant.</Text>
          <Text style={s.cPrice}>Precio unit.</Text>
          <Text style={s.cDisc}>Desc.</Text>
          <Text style={s.cTotal}>Total</Text>
        </View>
        {/* Ninguna fila ni bloque queda partido entre dos páginas (wrap={false}). */}
        {lines.map((l) => (
          <View key={l.id} style={s.row} wrap={false}>
            <Text style={[s.cRef, s.muted]}>{l.product?.product_code}</Text>
            <Text style={s.cDesc}>{l.description}</Text>
            <Text style={s.cQty}>{formatQuantityUnit(l.quantity, l.product?.unit)}</Text>
            <Text style={s.cPrice}>{formatCurrency(l.unit_price, q.currency ?? undefined)}</Text>
            <Text style={s.cDisc}>{Number(l.discount) ? `${formatNumber(l.discount)}%` : "—"}</Text>
            <Text style={s.cTotal}>{formatCurrency(l.line_total, q.currency ?? undefined)}</Text>
          </View>
        ))}

        <View style={s.totals} wrap={false}>
          {totals.map(([label, value]) => (
            <View key={label} style={s.totalRow}>
              <Text style={{ color: INK_700 }}>{label}</Text>
              <Text>{formatCurrency(value, q.currency ?? undefined)}</Text>
            </View>
          ))}
          <View style={s.grand}>
            <Text style={{ fontWeight: 500 }}>Total</Text>
            <Text style={s.grandValue}>{formatCurrency(q.grand_total)} {q.currency ?? "COP"}</Text>
          </View>
        </View>

        {q.payment_terms || q.delivery_terms || q.incoterm ? (
          <View style={s.block} wrap={false}>
            <Text style={s.label}>Condiciones</Text>
            {q.payment_terms ? <Text style={s.blockText}>Condiciones de pago: {q.payment_terms}</Text> : null}
            {q.delivery_terms ? <Text style={s.blockText}>Condiciones de entrega: {q.delivery_terms}</Text> : null}
            {q.incoterm ? <Text style={s.blockText}>Incoterm: {q.incoterm}</Text> : null}
          </View>
        ) : null}

        {q.description ? (
          <View style={s.block} wrap={false}>
            <Text style={s.label}>Observaciones</Text>
            <Text style={s.blockText}>{q.description}</Text>
          </View>
        ) : null}

        <View style={s.footer} wrap={false}>
          <View>
            <Text style={{ fontWeight: 500, color: INK }}>{q.owner?.full_name}</Text>
            {owner ? <Text>{owner}</Text> : null}
          </View>
          <Text style={s.tagline}>inspirando hogares</Text>
        </View>

        {/* En cotizaciones de varias hojas, cada una dice cuál es. */}
        <Text
          style={s.pageNumber}
          fixed
          render={({ pageNumber, totalPages }) => (totalPages > 1 ? `${q.quote_number ?? "Cotización"} · Página ${pageNumber} de ${totalPages}` : "")}
        />
      </Page>
    </Document>
  );
}
