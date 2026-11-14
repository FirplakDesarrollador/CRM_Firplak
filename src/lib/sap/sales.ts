"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/session";
import { canSystem } from "@/lib/permissions";
import type { FormState } from "@/lib/records/form";

export type SalesBranch = { card_code: string; customer_name: string | null; seller: string | null; amount: number; prev: number | null; account_id: string | null };
export type SalesFilters = { channels: string[]; zones: string[] };
export type SalesSummary = {
  total: number; total_prev: number | null; invoices: number; customers: number; loaded_at: string | null;
  /** Contra qué se compara: mismas fechas del año anterior, o el promedio mensual del año cuando el periodo es un solo mes. */
  compare: { mode: "year" | "average"; from: string; to: string; months: number; available: boolean };
  by_month: { month: string; amount: number }[];
  by_channel: { key: string; amount: number }[];
  by_zone: { key: string; amount: number }[];
  top: { key: string; amount: number; prev: number | null; branches: number; names: string[] | null; crm_name: string | null }[];
};

/** Resumen de ventas reales del periodo, con la selección de canales y zonas (lo que la persona puede ver). */
export async function loadSalesSummary(from: string, to: string, owner: string | null, filters: SalesFilters): Promise<SalesSummary | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("sap_sales_summary", {
    p_from: from, p_to: to, p_top: 15, p_owner: owner ?? undefined,
    p_channels: filters.channels.length ? filters.channels : undefined, p_zones: filters.zones.length ? filters.zones : undefined,
  });
  return (data as unknown as SalesSummary | null) ?? null;
}

/** Sucursales de un grupo de clientes con su venta del periodo y su comparación. */
export async function loadSalesGroup(key: string, from: string, to: string, owner: string | null, filters: SalesFilters): Promise<SalesBranch[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("sap_sales_group", {
    p_key: key, p_from: from, p_to: to, p_owner: owner ?? undefined,
    p_channels: filters.channels.length ? filters.channels : undefined, p_zones: filters.zones.length ? filters.zones : undefined,
  });
  return (data ?? []).map((r) => ({ ...r, amount: Number(r.amount), prev: r.prev === null ? null : Number(r.prev) }));
}

/** Relaciona un vendedor de SAP con un usuario del CRM: a ese usuario se le cuentan sus ventas. */
export async function saveSapSeller(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user || !canSystem(user.access, "customize")) return { message: "No tienes permiso para esta configuración." };
  const seller = String(fd.get("seller") ?? "");
  const userId = String(fd.get("user_id") ?? "") || null;
  const supabase = await createClient();
  const { error } = await supabase.from("sap_sellers").update({ user_id: userId }).eq("seller", seller);
  if (error) return { message: error.message };
  revalidatePath("/configuracion/sap");
  return { ok: true, message: "Guardado" };
}
