import "server-only";
import { createClient } from "@/lib/supabase/server";
import { odataString, sapConfigured, sapGet, SapError } from "./client";
import { getSapSource } from "./settings";

export type SapPartner = {
  CardCode: string; CardName: string; FederalTaxID?: string | null; Phone1?: string | null; EmailAddress?: string | null;
  CurrentAccountBalance: number; OpenOrdersBalance: number; OpenDeliveryNotesBalance: number; CreditLimit: number;
};
export type SapDocument = {
  DocEntry: number; DocNum: number; DocDate: string; DocDueDate: string; DocTotal: number; PaidToDate?: number;
  DocCurrency?: string; DocumentStatus: string; Cancelled?: string; NumAtCard?: string | null;
};
export type SapItem = {
  ItemCode: string; ItemName: string; QuantityOnStock: number; QuantityOrderedByCustomers?: number; QuantityOrderedFromVendors?: number;
  SalesUnit?: string | null;
  ItemPrices?: { PriceList: number; PriceListName?: string; Price: number; Currency?: string | null }[];
  ItemWarehouseInfoCollection?: { WarehouseCode: string; InStock: number; Committed: number; Ordered: number }[];
};

/** El agente todavía no ha traído este código (cuenta o producto recién vinculado). */
export class SapPending extends Error {
  constructor() { super("Aún no se ha traído de SAP"); }
}
export type SapCustomerSummary = { partner: SapPartner; orders: SapDocument[]; invoices: SapDocument[]; syncedAt?: string };

/** Resumen de un cliente en SAP: socio de negocio, pedidos abiertos y facturas recientes. */
export async function getCustomerSummary(cardCode: string): Promise<SapCustomerSummary | null> {
  if ((await getSapSource()) === "agent") {
    const supabase = await createClient();
    const { data: row, error } = await supabase.from("sap_partners").select("data, synced_at").eq("card_code", cardCode).maybeSingle();
    if (error) throw new SapError(500, error.message);
    if (!row) throw new SapPending();
    return row.data ? { ...(row.data as unknown as SapCustomerSummary), syncedAt: row.synced_at } : null;
  }
  const code = odataString(cardCode);
  let partner: SapPartner;
  try {
    partner = await sapGet<SapPartner>(`/BusinessPartners(${code})?$select=CardCode,CardName,FederalTaxID,Phone1,EmailAddress,CurrentAccountBalance,OpenOrdersBalance,OpenDeliveryNotesBalance,CreditLimit`);
  } catch (e) {
    if (e instanceof SapError && e.status === 404) return null;
    throw e;
  }
  const docSelect = "$select=DocEntry,DocNum,DocDate,DocDueDate,DocTotal,PaidToDate,DocCurrency,DocumentStatus,Cancelled,NumAtCard&$orderby=DocDate desc&$top=10";
  const [orders, invoices] = await Promise.all([
    sapGet<{ value: SapDocument[] }>(`/Orders?$filter=CardCode eq ${code} and DocumentStatus eq 'bost_Open'&${docSelect}`),
    sapGet<{ value: SapDocument[] }>(`/Invoices?$filter=CardCode eq ${code} and Cancelled eq 'tNO'&${docSelect}`),
  ]);
  return { partner, orders: orders.value, invoices: invoices.value };
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
