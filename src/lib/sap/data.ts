import "server-only";
import { createClient } from "@/lib/supabase/server";
import { odataString, sapConfigured, sapGet, SapError } from "./client";
import { getSapSource } from "./settings";

import type { SapCustomerSummary, SapDocument, SapItem, SapPartner } from "./types";

export type { SapCustomerSummary, SapDocument, SapItem, SapPartner } from "./types";

/** El agente todavía no ha traído este código (cuenta o producto recién vinculado). */
export class SapPending extends Error {
  constructor() { super("Aún no se ha traído de SAP"); }
}

/** Resumen de un cliente en SAP: socio de negocio, pedidos abiertos, entregas sin facturar, facturas abiertas y las diez más recientes. */
export async function getCustomerSummary(cardCode: string): Promise<SapCustomerSummary | null> {
  if ((await getSapSource()) === "agent") {
    const supabase = await createClient();
    const { data: row, error } = await supabase.from("sap_partners").select("data, synced_at").eq("card_code", cardCode).maybeSingle();
    if (error) throw new SapError(500, error.message);
    if (!row) throw new SapPending();
    // Las copias anteriores a las entregas no traen esa lista.
    if (!row.data) return null;
    const copy = row.data as unknown as SapCustomerSummary;
    return { ...copy, deliveries: copy.deliveries ?? [], syncedAt: row.synced_at };
  }
  const code = odataString(cardCode);
  let partner: SapPartner;
  try {
    partner = await sapGet<SapPartner>(`/BusinessPartners(${code})?$select=CardCode,CardName,FederalTaxID,Phone1,EmailAddress,CurrentAccountBalance,OpenOrdersBalance,OpenDeliveryNotesBalance,CreditLimit`);
  } catch (e) {
    if (e instanceof SapError && e.status === 404) return null;
    throw e;
  }
  // «PaidToDate» solo existe en las facturas: SAP rechaza la consulta de pedidos si se le pide.
  const docSelect = (extra = "") => `$select=DocEntry,DocNum,DocDate,DocDueDate,DocTotal,DocCurrency,DocumentStatus,Cancelled,NumAtCard${extra}&$orderby=DocDate desc&$top=10`;
  // Todos los pedidos abiertos; todas las facturas abiertas (para que el vencido sea exacto) y las diez más recientes.
  const all = docSelect(",VatSum").replace("&$top=10", "&$top=200");
  const allInvoices = docSelect(",VatSum,PaidToDate").replace("&$top=10", "&$top=200");
  const [orders, deliveries, open, recent] = await Promise.all([
    sapGet<{ value: SapDocument[] }>(`/Orders?$filter=CardCode eq ${code} and DocumentStatus eq 'bost_Open'&${all}`),
    sapGet<{ value: SapDocument[] }>(`/DeliveryNotes?$filter=CardCode eq ${code} and DocumentStatus eq 'bost_Open' and Cancelled eq 'tNO'&${all}`),
    sapGet<{ value: SapDocument[] }>(`/Invoices?$filter=CardCode eq ${code} and DocumentStatus eq 'bost_Open' and Cancelled eq 'tNO'&${allInvoices}`),
    sapGet<{ value: SapDocument[] }>(`/Invoices?$filter=CardCode eq ${code} and Cancelled eq 'tNO'&${docSelect(",VatSum,PaidToDate")}`),
  ]);
  const byEntry = new Map([...open.value, ...recent.value].map((d) => [d.DocEntry, d]));
  const invoices = [...byEntry.values()].sort((a, b) => b.DocDate.localeCompare(a.DocDate));
  // En vivo no se traen las líneas de los pedidos (eso lo hace el agente).
  return { partner, orders: orders.value, deliveries: deliveries.value, invoices };
}

export async function getItem(itemCode: string): Promise<(SapItem & { syncedAt?: string }) | null> {
  if ((await getSapSource()) === "agent") {
    const supabase = await createClient();
    const { data: row, error } = await supabase.from("sap_items").select("data, synced_at").eq("item_code", itemCode).maybeSingle();
    if (error) throw new SapError(500, error.message);
    if (!row) throw new SapPending();
    return row.data ? { ...(row.data as unknown as SapItem), syncedAt: row.synced_at } : null;
  }
  try {
    return await sapGet<SapItem>(`/Items(${odataString(itemCode)})?$select=ItemCode,ItemName,QuantityOnStock,QuantityOrderedByCustomers,QuantityOrderedFromVendors,SalesUnit,ItemPrices,ItemWarehouseInfoCollection`);
  } catch (e) {
    if (e instanceof SapError && e.status === 404) return null;
    throw e;
  }
}

/** Saldo pendiente y si está vencida una factura abierta. */
export function invoiceStatus(inv: SapDocument, today = new Date().toISOString().slice(0, 10)) {
  const pending = Math.max(0, inv.DocTotal - (inv.PaidToDate ?? 0));
  const open = inv.DocumentStatus === "bost_Open" && pending > 0;
  return { pending, open, overdue: open && inv.DocDueDate.slice(0, 10) < today };
}

/** ¿Hay de dónde mostrar información de SAP? En vivo exige las credenciales; la copia del agente, no. */
export async function sapAvailable() {
  return (await getSapSource()) === "agent" || sapConfigured();
}
