import "server-only";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/env";
import { sapConfigured, sapGet, sapPost } from "./client";
import { getSapSettings } from "./settings";

type Line = { quantity: number; unit_price: number; discount: number; description: string | null; product: { name: string; product_code: string | null } | null };
export type SapQuotationStatus = { DocEntry: number; DocNum: number; DocumentStatus: string; Cancelled: string; DocTotal: number };

/**
 * Crea la OFERTA de venta en SAP de un pedido activado (nunca una orden de venta): cliente por
 * Código SAP y líneas por Referencia = ItemCode. Guarda el número o el error en el pedido.
 */
export async function sendOrderToSap(orderId: string): Promise<{ ok: boolean; message: string }> {
  if (!sapConfigured()) return { ok: false, message: "SAP Business One no está configurado." };
  const supabase = await createClient();
  const { data: order } = await supabase.from("orders")
    .select("id, order_number, name, status, customer_po, requested_delivery_date, sap_quotation_entry, sap_quotation_num, account:accounts!orders_account_id_fkey(name, sap_card_code), owner:profiles!orders_owner_id_fkey(full_name)")
    .eq("id", orderId).maybeSingle();
  if (!order) return { ok: false, message: "El pedido no existe o no tienes acceso." };
  if (order.sap_quotation_entry) return { ok: true, message: `El pedido ya tiene la oferta de venta SAP N.º ${order.sap_quotation_num}.` };
  if (["Borrador", "Cancelado"].includes(order.status)) return { ok: false, message: "Solo se envían a SAP los pedidos activados." };

  const fail = async (message: string) => {
    await supabase.from("orders").update({ sap_error: message }).eq("id", orderId);
    return { ok: false, message };
  };
  const account = order.account as { name: string; sap_card_code: string | null } | null;
  if (!account?.sap_card_code) return fail(`La cuenta «${account?.name ?? ""}» no tiene Código SAP: agrégalo y vuelve a intentar.`);
  const { data: lineRows } = await supabase.from("order_items")
    .select("quantity, unit_price, discount, description, product:products!order_items_product_id_fkey(name, product_code)")
    .eq("order_id", orderId).order("sort_order");
  const lines = (lineRows ?? []) as unknown as Line[];
  const missing = lines.filter((l) => !l.product?.product_code).map((l) => l.product?.name ?? l.description ?? "(sin producto)");
  if (!lines.length) return fail("El pedido no tiene productos.");
  if (missing.length) return fail(`Estos productos no tienen Referencia (ItemCode de SAP): ${missing.join(", ")}.`);

  const in30 = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
  try {
    const created = await sapPost<SapQuotationStatus>("/Quotations", {
      CardCode: account.sap_card_code,
      DocDate: new Date().toISOString().slice(0, 10),
      DocDueDate: order.requested_delivery_date ?? in30,
      NumAtCard: order.customer_po || order.order_number,
      Comments: `Pedido ${order.order_number} del CRM · ${order.name} · ${(order.owner as { full_name: string } | null)?.full_name ?? ""} · ${siteUrl}/pedidos/${order.id}`.slice(0, 254),
      DocumentLines: lines.map((l) => ({ ItemCode: l.product!.product_code, Quantity: Number(l.quantity), UnitPrice: Number(l.unit_price), DiscountPercent: Number(l.discount) })),
    });
    await supabase.from("orders").update({
      sap_quotation_entry: created.DocEntry, sap_quotation_num: created.DocNum, sap_sent_at: new Date().toISOString(), sap_error: null,
    }).eq("id", orderId);
    return { ok: true, message: `Oferta de venta SAP N.º ${created.DocNum} creada.` };
  } catch (e) {
    return fail(`SAP no aceptó la oferta de venta: ${(e as Error).message}`);
  }
}

/** Se envía solo si administración lo habilitó; nunca interrumpe la activación del pedido. */
export async function sendOrderToSapIfEnabled(orderId: string) {
  if (!sapConfigured() || !(await getSapSettings()).create_quotations) return null;
  return sendOrderToSap(orderId);
}

export async function getQuotationStatus(entry: number) {
  return sapGet<SapQuotationStatus>(`/Quotations(${entry})?$select=DocEntry,DocNum,DocumentStatus,Cancelled,DocTotal`);
}
