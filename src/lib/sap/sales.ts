"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/session";
import { canSystem } from "@/lib/permissions";
import type { FormState } from "@/lib/records/form";
import { todayISO } from "@/lib/format";

/**
 * Un periodo que llega más allá de hoy («este año», «este trimestre») se corta en hoy: así el crecimiento
 * compara lo que va del periodo con esas mismas fechas del año anterior, y no con el periodo anterior completo.
 */
const upToToday = (to: string) => { const today = todayISO(); return to > today ? today : to; };

export type SalesBranch = { card_code: string; customer_name: string | null; seller: string | null; amount: number; prev: number | null; account_id: string | null };
export type SalesFilters = { channels: string[]; zones: string[] };
/** Mercado: nacional, internacional (zona Exterior o cliente del exterior) o todo. */
export type SalesMarket = "national" | "international" | null;
export type SalesSlice = { key: string; amount: number; prev: number | null; customers: number };
export type SalesCountryCustomer = { key: string; names: string[] | null; amount: number; branches: number };
export type SalesSummary = {
  total: number; total_prev: number | null; invoices: number; customers: number; loaded_at: string | null;
  /**
   * Contra qué se compara: las mismas fechas del año anterior o, cuando el periodo es un solo mes, el promedio de
   * los meses anteriores de ese año en los mismos días del mes (`day_to` 31 = mes completo).
   */
  compare: { mode: "year" | "average"; from: string; to: string; months: number; available: boolean; day_from: number; day_to: number };
  by_month: { month: string; amount: number }[];
  by_channel: { key: string; amount: number }[];
  by_zone: { key: string; amount: number }[];
  by_seller: SalesSlice[];
  /** Solo mercado internacional: el territorio de SAP es el país. */
  by_country: SalesSlice[];
  top: { key: string; amount: number; prev: number | null; branches: number; names: string[] | null; crm_name: string | null }[];
};

/** Resumen de ventas reales del periodo, con la selección de canales y zonas (lo que la persona puede ver). */
export async function loadSalesSummary(from: string, to: string, owner: string | null, filters: SalesFilters, market: SalesMarket = null): Promise<SalesSummary | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("sap_sales_summary", {
    p_from: from, p_to: upToToday(to), p_top: 15, p_owner: owner ?? undefined,
    p_channels: filters.channels.length ? filters.channels : undefined, p_zones: filters.zones.length ? filters.zones : undefined,
    p_market: market ?? undefined,
  });
  return (data as unknown as SalesSummary | null) ?? null;
}

/** Sucursales de un grupo de clientes con su venta del periodo y su comparación. */
export async function loadSalesGroup(key: string, from: string, to: string, owner: string | null, filters: SalesFilters, market: SalesMarket = null): Promise<SalesBranch[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("sap_sales_group", {
    p_key: key, p_from: from, p_to: upToToday(to), p_owner: owner ?? undefined,
    p_channels: filters.channels.length ? filters.channels : undefined, p_zones: filters.zones.length ? filters.zones : undefined,
    p_market: market ?? undefined,
  });
  return (data ?? []).map((r) => ({ ...r, amount: Number(r.amount), prev: r.prev === null ? null : Number(r.prev) }));
}

/** Principales clientes de un país del mercado internacional en el periodo. */
export async function loadSalesCountry(country: string, from: string, to: string, owner: string | null, filters: SalesFilters): Promise<SalesCountryCustomer[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("sap_sales_country", {
    p_country: country, p_from: from, p_to: upToToday(to), p_owner: owner ?? undefined,
    p_channels: filters.channels.length ? filters.channels : undefined,
  });
  return (data ?? []).map((r) => ({ key: r.key, names: r.names, amount: Number(r.amount), branches: Number(r.branches) }));
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
