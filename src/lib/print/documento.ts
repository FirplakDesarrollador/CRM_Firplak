import "server-only";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatNumber } from "@/lib/format";

/**
 * Lo que se imprime de una cotización o de un pedido. La vista previa (`components/print/PrintSheet.tsx`) y el
 * archivo PDF (`lib/print/DocumentoPdf.tsx`) parten de aquí, para que digan lo mismo.
 */
export type PrintDoc = {
  kind: "quote" | "order";
  title: "Cotización" | "Pedido";
  number: string;
  /** Renglón bajo el número: fecha y, en la cotización, su validez. */
  dateLine: string;
  customer: { name: string; lines: string[] };
  project: { name: string; lines: string[] };
  billing: string[];
  delivery: string[];
  contacts: { role: string; name: string; detail: string }[];
  /** Datos de despacho del pedido (tipo de entrega, acceso, subida…). */
  logistics: [string, string][];
  lines: { id: string; code: string; description: string; quantity: number; unit: string | null; unitPrice: number; discount: number; total: number }[];
  currency: string;
  totals: [string, number][];
  grandTotal: number;
  terms: string[];
  notes: string | null;
  owner: { name: string; detail: string };
  payment: PrintSettings;
};

/** Formas de pago que se imprimen en un documento: las del mercado de su cuenta. */
export type PrintSettings = { payment_lines: string[]; payment_note: string };
/**
 * Lo que administración carga en Configuración → Documentos impresos: las cuentas del mercado Nacional y, aparte, las
 * del Internacional (bancos distintos). Un documento nunca imprime las del otro mercado: si las suyas están vacías,
 * el bloque no sale.
 */
export type PrintSettingsByMarket = { nacional: PrintSettings; internacional: PrintSettings };

/** Datos públicos de la empresa que van al pie de cada documento. */
export const COMPANY = {
  name: "Firplak S.A.S.",
  taxId: "NIT 890.927.404-0",
  privacy: "Con la firma o aceptación de este documento (vía e-mail), usted nos autoriza para tratar sus datos personales de acuerdo con la Ley Colombiana 1581 de 2012 «Protección de Datos Personales» y nuestra política disponible en www.firplak.com/privacy_policies.",
  withholding: "Somos autorretenedores Res. 64 de mayo 3 de 1995",
  address: "Autopista Sur, Calle 29 No. 41-15, Itagüí – Antioquia · PBX (604) 444 17 71 · www.firplak.com",
};

export async function getPrintSettings(): Promise<PrintSettingsByMarket> {
  const supabase = await createClient();
  const { data } = await supabase.from("integration_settings").select("value").eq("key", "print").maybeSingle();
  const v = (data?.value ?? {}) as Record<string, unknown>;
  const block = (lines: unknown, note: unknown): PrintSettings => ({
    payment_lines: Array.isArray(lines) ? lines.map(String).filter(Boolean) : [],
    payment_note: typeof note === "string" ? note : "",
  });
  return { nacional: block(v.payment_lines, v.payment_note), internacional: block(v.payment_lines_intl, v.payment_note_intl) };
}
const paymentFor = (all: PrintSettingsByMarket, market: string | null | undefined) => (market === "Internacional" ? all.internacional : all.nacional);

type Contact = { full_name: string | null; email: string | null; mobile: string | null; phone: string | null; contact_role: string | null } | null;
const ACCOUNT = "name, tax_id, phone, einvoice_email, billing_street, billing_city, shipping_city, billing_cutoff_day, market";
const CONTACT = "full_name, email, mobile, phone, contact_role";
const OWNER = "full_name, email, phone, title";
const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(" · ");

/** Un contacto con el rol de su ficha; sin rol en la ficha, el que le da el documento (p. ej. «Logística»). */
function contact(c: Contact, fallbackRole: string) {
  if (!c?.full_name) return [];
  return [{ role: c.contact_role || fallbackRole, name: c.full_name, detail: join(c.mobile ?? c.phone, c.email) }];
}

type Line = { id: string; description: string | null; quantity: number; unit_price: number; discount: number; line_total: number | null; product: { product_code: string | null; unit: string | null } | null };
const mapLines = (rows: Line[] | null): PrintDoc["lines"] => (rows ?? []).map((l) => ({
  id: l.id, code: l.product?.product_code ?? "", description: l.description ?? "", quantity: Number(l.quantity), unit: l.product?.unit ?? null,
  unitPrice: Number(l.unit_price), discount: Number(l.discount), total: Number(l.line_total ?? 0),
}));

type Totals = { subtotal: number; discount_total: number; net_total: number; tax_rate: number; tax: number; shipping: number };
const mapTotals = (d: Totals): [string, number][] => [
  ["Subtotal (sin IVA)", Number(d.subtotal)],
  ["Descuento comercial", -Number(d.discount_total)],
  ["Subtotal neto (sin IVA)", Number(d.net_total)],
  [`IVA (${formatNumber(d.tax_rate)}%)`, Number(d.tax)],
  ...(Number(d.shipping) ? [["Flete", Number(d.shipping)] as [string, number]] : []),
];

type Account = { name: string; tax_id: string | null; phone: string | null; einvoice_email: string | null; billing_street: string | null; billing_city: string | null; shipping_city: string | null; billing_cutoff_day: number | null; market: string | null } | null;
const customerOf = (name: string | null | undefined, a: Account): PrintDoc["customer"] => ({
  name: name ?? a?.name ?? "",
  lines: [a?.tax_id ? `NIT ${a.tax_id}` : "", a?.phone ? `Tel. ${a.phone}` : "", a?.einvoice_email ? `Facturación electrónica: ${a.einvoice_email}` : "",
    a?.billing_cutoff_day ? `Cierre de facturación: día ${a.billing_cutoff_day} de cada mes` : ""].filter(Boolean),
});
const endCustomer = (name: string | null, taxId: string | null) => (name ? `Cliente final: ${name}${taxId ? ` (NIT ${taxId})` : ""}` : "");

/** Lee con la sesión del usuario (RLS): quien no puede ver la cotización recibe `null`. */
export async function loadPrintQuote(id: string): Promise<PrintDoc | null> {
  const supabase = await createClient();
  const [{ data: q }, { data: lines }, payment] = await Promise.all([
    supabase
      .from("quotes")
      .select(`*, account:accounts!quotes_account_id_fkey(${ACCOUNT}), contact:contacts!quotes_contact_id_fkey(${CONTACT}), opportunity:opportunities!quotes_opportunity_id_fkey(name), owner:profiles!quotes_owner_id_fkey(${OWNER})`)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("quote_line_items")
      .select("id, description, quantity, unit_price, discount, line_total, product:products!quote_line_items_product_id_fkey(product_code, unit)")
      .eq("quote_id", id)
      .order("sort_order"),
    getPrintSettings(),
  ]);
  if (!q) return null;
  const account = q.account as Account;
  const billing = q.billing_address ?? ([account?.billing_street, account?.billing_city].filter(Boolean).join(", ") || null);
  const city = q.delivery_city ?? account?.shipping_city ?? account?.billing_city ?? null;
  return {
    kind: "quote",
    title: "Cotización",
    number: q.quote_number,
    dateLine: `Fecha: ${formatDate(q.created_at)} · Validez de la oferta: ${q.validity_days} días (hasta el ${formatDate(q.expiration_date)})`,
    customer: customerOf(q.bill_to_name, account),
    project: { name: q.name, lines: [q.opportunity?.name ?? "", join(q.project_segment, q.sale_type !== "Estándar" && q.sale_type)].filter(Boolean) },
    billing: [billing ?? "—"],
    // La dirección exacta se pide en el pedido: la cotización solo la imprime si se escribió una distinta a la de la cuenta.
    delivery: [city ? `Ciudad: ${city}` : "—", q.shipping_manual && q.shipping_address ? q.shipping_address : "", endCustomer(q.end_customer_name, q.end_customer_tax_id),
      q.delivery_date ? `Entrega estimada: ${formatDate(q.delivery_date)}` : ""].filter(Boolean),
    contacts: contact(q.contact as Contact, "Contacto"),
    logistics: [],
    lines: mapLines(lines as unknown as Line[] | null),
    currency: q.currency ?? "COP",
    totals: mapTotals(q),
    grandTotal: Number(q.grand_total),
    terms: [q.payment_terms ? `Condiciones de pago: ${q.payment_terms}` : "", q.delivery_terms ? `Condiciones de entrega: ${q.delivery_terms}` : "", q.incoterm ? `Incoterm: ${q.incoterm}` : ""].filter(Boolean),
    notes: q.description,
    owner: { name: q.owner?.full_name ?? "", detail: join(q.owner?.title, q.owner?.email, q.owner?.phone) },
    payment: paymentFor(payment, account?.market),
  };
}

export async function loadPrintOrder(id: string): Promise<PrintDoc | null> {
  const supabase = await createClient();
  const [{ data: o }, { data: lines }, payment] = await Promise.all([
    supabase
      .from("orders")
      .select(`*, account:accounts!orders_account_id_fkey(${ACCOUNT}), contact:contacts!orders_contact_id_fkey(${CONTACT}), logistics_contact:contacts!orders_logistics_contact_id_fkey(${CONTACT}), finance_contact:contacts!orders_finance_contact_id_fkey(${CONTACT}), opportunity:opportunities!orders_opportunity_id_fkey(name), quote:quotes!orders_quote_id_fkey(quote_number), owner:profiles!orders_owner_id_fkey(${OWNER})`)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("order_items")
      .select("id, description, quantity, unit_price, discount, line_total, product:products!order_items_product_id_fkey(product_code, unit)")
      .eq("order_id", id)
      .order("sort_order"),
    getPrintSettings(),
  ]);
  if (!o) return null;
  const account = o.account as Account;
  const billing = o.billing_address ?? ([account?.billing_street, account?.billing_city].filter(Boolean).join(", ") || null);
  const logistics: [string, string][] = [
    ["Orden de compra", o.customer_po ?? ""],
    ["Entrega solicitada", o.requested_delivery_date ? formatDate(o.requested_delivery_date) : ""],
    ["Tipo de entrega", o.delivery_type ?? ""],
    ["Acceso", join(o.delivery_floor ? `Piso ${o.delivery_floor}` : "", o.delivery_access)],
    ["Servicio de subida", o.lift_service ? "Sí" : "No"],
    ["Muestra", o.is_sample ? "Sí" : "No"],
  ];
  return {
    kind: "order",
    title: "Pedido",
    number: o.order_number,
    dateLine: join(`Fecha: ${formatDate(o.order_date)}`, o.quote?.quote_number ? `Cotización ${o.quote.quote_number}` : ""),
    customer: customerOf(o.bill_to_name, account),
    project: { name: o.name, lines: [o.opportunity?.name ?? "", join(o.project_segment, o.sale_type !== "Estándar" && o.sale_type)].filter(Boolean) },
    billing: [billing ?? "—"],
    delivery: [o.shipping_address ?? "—", o.delivery_city ? `Ciudad: ${o.delivery_city}` : "", endCustomer(o.end_customer_name, o.end_customer_tax_id)].filter(Boolean),
    contacts: [...contact(o.contact as Contact, "Compras"), ...contact(o.logistics_contact as Contact, "Logística"), ...contact(o.finance_contact as Contact, "Financiero")],
    logistics: logistics.filter(([, value]) => value),
    lines: mapLines(lines as unknown as Line[] | null),
    currency: o.currency ?? "COP",
    totals: mapTotals(o),
    grandTotal: Number(o.grand_total),
    terms: [o.payment_terms ? `Condiciones de pago: ${o.payment_terms}` : "", o.delivery_terms ? `Condiciones de entrega: ${o.delivery_terms}` : "", o.incoterm ? `Incoterm: ${o.incoterm}` : ""].filter(Boolean),
    notes: o.description,
    owner: { name: o.owner?.full_name ?? "", detail: join(o.owner?.title, o.owner?.email, o.owner?.phone) },
    payment: paymentFor(payment, account?.market),
  };
}

/** Nombre del archivo PDF: el número del documento, sin caracteres que un sistema de archivos rechace. */
export function printPdfName(number: string | null | undefined, fallback = "documento") {
  const base = (number ?? "").replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "");
  return `${base || fallback}.pdf`;
}
