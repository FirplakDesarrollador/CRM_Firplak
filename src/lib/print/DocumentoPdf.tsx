import path from "node:path";
import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatCurrency, formatNumber, formatQuantityUnit } from "@/lib/format";
import { COMPANY, type PrintDoc } from "./documento";

// El PDF de una cotización o un pedido, con el mismo contenido y orden que la vista previa
// (`components/print/PrintSheet.tsx`): si cambias una, cambia la otra. Se arma en el servidor porque el iPhone, con el CRM instalado, no abre el diálogo de imprimir.

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
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 0.75, borderBottomColor: LINE, paddingBottom: 14 },
  logo: { width: 142.5, height: 39 },
  headerRight: { alignItems: "flex-end" },
  label: { fontSize: 8.25, fontWeight: 500, textTransform: "uppercase", letterSpacing: 1.5, color: SAGE },
  number: { marginTop: 3, fontSize: 18, fontWeight: 300, lineHeight: 1.3, color: NAVY },
  muted: { color: INK_500 },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingTop: 12, paddingBottom: 2 },
  cell: { width: "50%", paddingRight: 18, marginBottom: 10 },
  strong: { marginTop: 6, fontSize: 12, fontWeight: 500, lineHeight: 1.35, color: NAVY },
  row: { flexDirection: "row", borderBottomWidth: 0.75, borderBottomColor: LINE_SOFT, paddingVertical: 6 },
  head: { flexDirection: "row", borderTopWidth: 0.75, borderBottomWidth: 0.75, borderColor: LINE, paddingVertical: 6, fontSize: 7.5, fontWeight: 500, textTransform: "uppercase", letterSpacing: 1.05, color: INK_500 },
  cRef: { width: "15%", paddingRight: 6 },
  cDesc: { flex: 1, paddingRight: 6 },
  cQty: { width: "14%", paddingRight: 6, textAlign: "right" },
  cPrice: { width: "14%", paddingRight: 6, textAlign: "right" },
  cDisc: { width: "7%", paddingRight: 6, textAlign: "right" },
  cTotal: { width: "15%", textAlign: "right" },
  totals: { width: 216 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  grand: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 6, paddingTop: 6, borderTopWidth: 0.75, borderTopColor: LINE },
  grandValue: { fontSize: 15, fontWeight: 300, color: NAVY },
  block: { marginTop: 12, paddingTop: 10, borderTopWidth: 0.75, borderTopColor: LINE },
  blockText: { marginTop: 3 },
  half: { width: "50%", paddingRight: 18 },
  band: { flexDirection: "row", borderTopWidth: 0.75, borderTopColor: LINE, paddingVertical: 10 },
  afterTable: { marginTop: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  sign: { marginTop: 14, paddingTop: 10, borderTopWidth: 0.75, borderTopColor: LINE, flexDirection: "row" },
  signLine: { marginTop: 22, paddingTop: 3, borderTopWidth: 0.75, borderTopColor: LINE, color: INK_500 },
  legal: { marginTop: 14, paddingTop: 8, borderTopWidth: 0.75, borderTopColor: LINE, textAlign: "center", fontSize: 7.5, lineHeight: 1.35, color: INK_500 },
  // Ubicado desde arriba (la hoja carta mide 792 pt de alto): con `bottom`, la librería no dibuja este texto
  // cuando la página define un interlineado.
  pageNumber: { position: "absolute", top: 758, left: 40, right: 40, textAlign: "right", fontSize: 7.5, color: INK_500 },
});

/** El documento listo para `renderToBuffer` (una función y no un componente: la librería pide el <Document> mismo). */
export function documentoPdf(doc: PrintDoc) {
  const payment = doc.payment.payment_lines.length > 0 || Boolean(doc.payment.payment_note);
  return (
    <Document title={`${doc.title} ${doc.number}`.trim()} author="Firplak" creator="Firplak CRM" producer="Firplak CRM" language="es-CO">
      <Page size="LETTER" style={s.page}>
        <View style={s.header}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- es la imagen de un PDF, no una etiqueta <img> */}
            <Image src={LOGO} style={s.logo} />
            <Text style={[s.muted, { marginTop: 6, fontSize: 8.25 }]}>{COMPANY.taxId}</Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.label}>{doc.title}</Text>
            <Text style={s.number}>{doc.number}</Text>
            <Text style={[s.muted, { marginTop: 3 }]}>{doc.dateLine}</Text>
          </View>
        </View>

        <View style={s.grid}>
          <View style={s.cell}>
            <Text style={s.label}>Cliente</Text>
            <Text style={s.strong}>{doc.customer.name}</Text>
            {doc.customer.lines.map((line) => <Text key={line}>{line}</Text>)}
          </View>
          <View style={s.cell}>
            <Text style={s.label}>Proyecto</Text>
            <Text style={s.strong}>{doc.project.name}</Text>
            {doc.project.lines.map((line) => <Text key={line} style={s.muted}>{line}</Text>)}
          </View>
          <View style={s.cell}>
            <Text style={s.label}>Dirección de facturación</Text>
            {doc.billing.map((line) => <Text key={line} style={s.blockText}>{line}</Text>)}
          </View>
          <View style={s.cell}>
            <Text style={s.label}>Entrega</Text>
            {doc.delivery.map((line) => <Text key={line} style={s.blockText}>{line}</Text>)}
          </View>
        </View>

        {doc.contacts.length > 0 || doc.logistics.length > 0 ? (
          <View style={s.band} wrap={false}>
            {doc.contacts.length > 0 ? (
              <View style={s.half}>
                <Text style={s.label}>Contactos del cliente</Text>
                {doc.contacts.map((c) => (
                  <Text key={`${c.role}-${c.name}`} style={s.blockText}>
                    <Text style={s.muted}>{c.role}: </Text>
                    <Text style={{ fontWeight: 500 }}>{c.name}</Text>
                    {c.detail ? <Text style={s.muted}> · {c.detail}</Text> : null}
                  </Text>
                ))}
              </View>
            ) : null}
            {doc.logistics.length > 0 ? (
              <View style={s.half}>
                <Text style={s.label}>Despacho</Text>
                {doc.logistics.map(([name, value]) => (
                  <Text key={name} style={s.blockText}><Text style={s.muted}>{name}: </Text>{value}</Text>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={s.head}>
          <Text style={s.cRef}>Ref.</Text>
          <Text style={s.cDesc}>Descripción</Text>
          <Text style={s.cQty}>Cant.</Text>
          <Text style={s.cPrice}>Precio unit.</Text>
          <Text style={s.cDisc}>Desc.</Text>
          <Text style={s.cTotal}>Total</Text>
        </View>
        {/* Ninguna fila ni bloque queda partido entre dos páginas (wrap={false}). */}
        {doc.lines.map((l) => (
          <View key={l.id} style={s.row} wrap={false}>
            <Text style={[s.cRef, s.muted]}>{l.code}</Text>
            <Text style={s.cDesc}>{l.description}</Text>
            <Text style={s.cQty}>{l.unit ? formatQuantityUnit(l.quantity, l.unit) : formatNumber(l.quantity)}</Text>
            <Text style={s.cPrice}>{formatCurrency(l.unitPrice, doc.currency)}</Text>
            <Text style={s.cDisc}>{l.discount ? `${formatNumber(l.discount)}%` : "—"}</Text>
            <Text style={s.cTotal}>{formatCurrency(l.total, doc.currency)}</Text>
          </View>
        ))}

        <View style={s.afterTable} wrap={false}>
          <View style={{ flex: 1, paddingRight: 24 }}>
            {payment ? <Text style={s.label}>Forma de pago y consignación</Text> : null}
            {doc.payment.payment_lines.map((line) => <Text key={line} style={s.blockText}>{line}</Text>)}
            {doc.payment.payment_note ? <Text style={[s.blockText, s.muted]}>{doc.payment.payment_note}</Text> : null}
          </View>
          <View style={s.totals}>
            {doc.totals.map(([name, value]) => (
              <View key={name} style={s.totalRow}>
                <Text style={{ color: INK_700 }}>{name}</Text>
                <Text>{formatCurrency(value, doc.currency)}</Text>
              </View>
            ))}
            <View style={s.grand}>
              <Text style={{ fontWeight: 500 }}>Total</Text>
              <Text style={s.grandValue}>{formatCurrency(doc.grandTotal)} {doc.currency}</Text>
            </View>
          </View>
        </View>

        {doc.terms.length > 0 ? (
          <View style={s.block} wrap={false}>
            <Text style={s.label}>Condiciones</Text>
            {doc.terms.map((line) => <Text key={line} style={s.blockText}>{line}</Text>)}
          </View>
        ) : null}

        {doc.notes ? (
          <View style={s.block} wrap={false}>
            <Text style={s.label}>Observaciones</Text>
            <Text style={s.blockText}>{doc.notes}</Text>
          </View>
        ) : null}

        <View style={s.sign} wrap={false}>
          <View style={s.half}>
            <Text style={s.label}>Aceptado por el cliente</Text>
            <Text style={s.signLine}>Firma · C.C. o NIT · Fecha</Text>
          </View>
          <View style={s.half}>
            <Text style={s.label}>Asesor comercial</Text>
            <Text style={{ marginTop: 6, fontWeight: 500 }}>{doc.owner.name}</Text>
            {doc.owner.detail ? <Text style={s.muted}>{doc.owner.detail}</Text> : null}
          </View>
        </View>

        <View style={s.legal} wrap={false}>
          <Text>{COMPANY.privacy}</Text>
          <Text style={{ marginTop: 3, fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.6 }}>{COMPANY.withholding}</Text>
          <Text style={{ marginTop: 3 }}>{COMPANY.address}</Text>
        </View>

        {/* En documentos de varias hojas, cada una dice cuál es. */}
        <Text
          style={s.pageNumber}
          fixed
          render={({ pageNumber, totalPages }) => (totalPages > 1 ? `${doc.number} · Página ${pageNumber} de ${totalPages}` : "")}
        />
      </Page>
    </Document>
  );
}
