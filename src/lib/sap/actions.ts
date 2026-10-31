"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/session";
import { can, canSystem } from "@/lib/permissions";
import type { FormState } from "@/lib/records/form";
import { sapGet } from "./client";
import { sendOrderToSap } from "./quotations";
import { getSapSettings, validSapField, type SapSettings } from "./settings";
import { fetchSapItems, importSapItems } from "./products";

export async function sendOrderToSapNow(orderId: string): Promise<FormState> {
  const r = await sendOrderToSap(orderId);
  revalidatePath(`/pedidos/${orderId}`);
  return { ok: r.ok, message: r.message };
}

async function adminUser() {
  const user = await getCurrentUser();
  return user && canSystem(user.access, "customize") ? user : null;
}

/** Ajustes de SAP desde el formulario (ofertas al activar; filtro y mapeo de la importación). */
function readSettings(fd: FormData, current: SapSettings): SapSettings {
  const fields = fd.getAll("map_field").map(String);
  const sapFields = fd.getAll("map_sap_field").map((v) => String(v).trim());
  return {
    create_quotations: fd.has("create_quotations") ? fd.get("create_quotations") === "on" : current.create_quotations,
    product_import: {
      prefix: String(fd.get("prefix") ?? "").trim().slice(0, 20),
      sales_only: fd.get("sales_only") === "on",
      mappings: fields.map((field, i) => ({ field, sap_field: sapFields[i] ?? "" })).filter((m) => m.field && validSapField(m.sap_field)),
    },
  };
}

export async function saveSapQuotationSetting(_prev: FormState, fd: FormData): Promise<FormState> {
  if (!(await adminUser())) return { message: "No tienes permiso para esta configuración." };
  const current = await getSapSettings();
  const supabase = await createClient();
  const value = { ...current, create_quotations: fd.get("create_quotations") === "on" };
  const { error } = await supabase.from("integration_settings").upsert({ key: "sap", value, updated_at: new Date().toISOString() });
  if (error) return { message: error.message };
  revalidatePath("/configuracion/sap");
  return { ok: true, message: "Preferencias guardadas" };
}

export async function testSapConnection(_prev?: FormState, _fd?: FormData): Promise<FormState> {
  if (!(await adminUser())) return { message: "No tienes permiso para esta configuración." };
  try {
    await sapGet("/Items?$select=ItemCode&$top=1");
    return { ok: true, message: "Conexión con SAP correcta" };
  } catch (e) {
    return { message: `No se pudo conectar con SAP: ${(e as Error).message}` };
  }
}

export type ImportState = FormState & { preview?: Record<string, unknown>[]; columns?: string[] };

/** Guarda filtro y mapeo, y muestra los primeros artículos que se importarían. */
export async function previewSapImport(_prev: ImportState, fd: FormData): Promise<ImportState> {
  if (!(await adminUser())) return { message: "No tienes permiso para esta configuración." };
  const settings = readSettings(fd, await getSapSettings());
  const supabase = await createClient();
  await supabase.from("integration_settings").upsert({ key: "sap", value: { ...settings, create_quotations: (await getSapSettings()).create_quotations }, updated_at: new Date().toISOString() });
  try {
    const rows = await fetchSapItems(settings.product_import, 10);
    revalidatePath("/configuracion/sap");
    return {
      ok: true, message: rows.length ? "Vista previa (primeros 10 artículos)" : "No hay artículos de SAP con ese filtro.",
      preview: rows, columns: ["ItemCode", "ItemName", ...settings.product_import.mappings.map((m) => m.sap_field)],
    };
  } catch (e) {
    return { message: `SAP no respondió: ${(e as Error).message}` };
  }
}

export async function runSapImport(_prev: ImportState, _fd: FormData): Promise<ImportState> {
  const user = await adminUser();
  if (!user) return { message: "No tienes permiso para esta configuración." };
  if (!can(user.access, "products", "create") || !can(user.access, "products", "edit")) return { message: "Necesitas permiso para crear y editar productos." };
  try {
    const r = await importSapItems((await getSapSettings()).product_import);
    revalidatePath("/productos");
    const base = `${r.total} artículos leídos de SAP: ${r.created} productos creados y ${r.updated} actualizados.`;
    return r.errors.length ? { message: `${base} Errores: ${r.errors.slice(0, 3).join(" · ")}` } : { ok: true, message: base };
  } catch (e) {
    return { message: `SAP no respondió: ${(e as Error).message}` };
  }
}
