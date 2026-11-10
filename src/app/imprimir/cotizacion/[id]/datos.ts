import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Datos de la cotización para imprimir: los usan la vista previa y el PDF, para que digan lo mismo.
 * Lee con la sesión del usuario (RLS): quien no puede ver la cotización recibe `null`.
 */
export async function loadPrintQuote(id: string) {
  const supabase = await createClient();
  const [{ data: q }, { data: lines }] = await Promise.all([
    supabase
      .from("quotes")
      .select("*, account:accounts!quotes_account_id_fkey(name, tax_id, billing_street, billing_city, phone), contact:contacts!quotes_contact_id_fkey(full_name, email, mobile), opportunity:opportunities!quotes_opportunity_id_fkey(name), owner:profiles!quotes_owner_id_fkey(full_name, email, phone, title)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("quote_line_items")
      .select("id, description, quantity, unit_price, discount, line_total, product:products!quote_line_items_product_id_fkey(product_code, unit)")
      .eq("quote_id", id)
      .order("sort_order"),
  ]);
  if (!q) return null;
  // La dirección de facturación viene de la cuenta; la de entrega, si no se escribió otra, es la misma.
  const billing = q.billing_address ?? ([q.account?.billing_street, q.account?.billing_city].filter(Boolean).join(", ") || null);
  const shipping = q.shipping_address ?? billing;
  return { q, lines: lines ?? [], billing, shipping };
}

export type PrintQuote = NonNullable<Awaited<ReturnType<typeof loadPrintQuote>>>;

/** Nombre del archivo PDF: el número de la cotización, sin caracteres que un sistema de archivos rechace. */
export function quotePdfName(quoteNumber: string | null | undefined) {
  const base = (quoteNumber ?? "").replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "");
  return `${base || "cotizacion"}.pdf`;
}
