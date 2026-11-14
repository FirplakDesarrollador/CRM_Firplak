"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/session";
import { canSystem } from "@/lib/permissions";
import type { FormState } from "@/lib/records/form";

export type SalesBranch = { card_code: string; customer_name: string | null; seller: string | null; amount: number; account_id: string | null };

/** Sucursales de un grupo de clientes con su venta del periodo (lo que la persona puede ver). */
export async function loadSalesGroup(key: string, from: string, to: string, owner: string | null): Promise<SalesBranch[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("sap_sales_group", { p_key: key, p_from: from, p_to: to, p_owner: owner ?? undefined });
  return (data ?? []).map((r) => ({ ...r, amount: Number(r.amount) }));
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
