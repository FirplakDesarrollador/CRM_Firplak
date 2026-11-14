"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/session";
import { can, canSystem } from "@/lib/permissions";
import type { FormState } from "@/lib/records/form";
import { sapGet } from "./client";
import { sendOrderToSap } from "./quotations";
import { getSapSettings, sapSourceOf, validSapField, type SapSettings } from "./settings";
import { fetchSapItems, importSapItems, MAX_PICK } from "./products";

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

/** De dónde se lee la cartera y el inventario: la copia del agente o SAP en vivo. */
export async function saveSapSource(_prev: FormState, fd: FormData): Promise<FormState> {
  if (!(await adminUser())) return { message: "No tienes permiso para esta configuración." };
  const source = fd.get("source") === "direct" ? "direct" : "agent";
  const supabase = await createClient();
  const { error } = await supabase.from("integration_settings").upsert({ key: "sap", value: { ...(await getSapSettings()), source }, updated_at: new Date().toISOString() });
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

/** `requestId`: la pidió al agente de SAP; el panel consulta su estado hasta que termine. */
export type ImportState = FormState & {
  preview?: Record<string, unknown>[]; columns?: string[]; requestId?: string;
  /** Referencias de la lista que ya existen en el CRM, y si SAP tiene más artículos de los que se muestran. */
  existing?: string[]; truncated?: boolean;
};

/** Cuáles de estos códigos ya son productos del CRM. */
async function existingCodes(codes: string[]) {
  const supabase = await createClient();
  const found: string[] = [];
  for (let i = 0; i < codes.length; i += 200) {
    const { data } = await supabase.from("products").select("product_code").in("product_code", codes.slice(i, i + 200));
    found.push(...(data ?? []).map((p) => p.product_code!).filter(Boolean));
  }
  return found;
}
const previewMessage = (n: number, truncated: boolean) => !n ? "No hay artículos de SAP con ese filtro."
  : truncated ? `SAP tiene más de ${n} artículos con ese filtro: se muestran los primeros ${n}. Usa un código más específico para ver el resto.`
    : `${n} artículos de SAP con ese filtro. Elige los que quieres importar.`;

/** Deja una solicitud para el agente de SAP (vista previa o importación) con el filtro y el mapeo vigentes. */
async function requestFromAgent(kind: "product_preview" | "product_import", opts: SapSettings["product_import"], codes?: string[]): Promise<ImportState> {
  const supabase = await createClient();
  const { data: defs } = await supabase.from("custom_field_definitions").select("api_name, field_type").eq("object", "products").eq("is_active", true);
  const types = new Map((defs ?? []).map((d) => [d.api_name, d.field_type]));
  const mappings = opts.mappings.filter((m) => types.has(m.field) && validSapField(m.sap_field)).map((m) => ({ ...m, type: types.get(m.field)! }));
  const { data, error } = await supabase.from("sap_requests")
    .insert({ kind, params: { prefix: opts.prefix, sales_only: opts.sales_only, mappings, ...(kind === "product_preview" ? { limit: MAX_PICK } : { codes }) } }).select("id").single();
  if (error) return { message: error.message };
  return { ok: true, message: "Enviado al agente de SAP: lo atiende en menos de un minuto…", requestId: data.id };
}

/** Estado de una solicitud al agente, ya convertido en lo que muestra el panel. */
export async function checkSapRequest(id: string): Promise<ImportState & { pending?: boolean }> {
  if (!(await adminUser())) return { message: "No tienes permiso para esta configuración." };
  const supabase = await createClient();
  const { data: r } = await supabase.from("sap_requests").select("kind, status, result, error").eq("id", id).maybeSingle();
  if (!r) return { message: "La solicitud ya no existe." };
  if (r.status === "pending" || r.status === "running") return { ok: true, pending: true, requestId: id, message: r.status === "running" ? "El agente está consultando SAP…" : "Enviado al agente de SAP: lo atiende en menos de un minuto…" };
  if (r.status === "error") return { message: `SAP no respondió: ${r.error ?? "error desconocido"}` };
  if (r.kind === "product_preview") {
    const res = (r.result ?? {}) as { rows?: Record<string, unknown>[]; columns?: string[]; truncated?: boolean };
    const rows = res.rows ?? [];
    return {
      ok: true, message: previewMessage(rows.length, Boolean(res.truncated)), preview: rows, columns: res.columns ?? [],
      truncated: Boolean(res.truncated), existing: await existingCodes(rows.map((x) => String(x.ItemCode))),
    };
  }
  const res = (r.result ?? {}) as { total?: number; created?: number; updated?: number; errors?: string[] };
  revalidatePath("/productos");
  const base = `${res.total ?? 0} artículos leídos de SAP: ${res.created ?? 0} productos creados y ${res.updated ?? 0} actualizados.`;
  return res.errors?.length ? { message: `${base} Errores: ${res.errors.slice(0, 3).join(" · ")}` } : { ok: true, message: base };
}

/** Guarda filtro y mapeo, y muestra los primeros artículos que se importarían. */
export async function previewSapImport(_prev: ImportState, fd: FormData): Promise<ImportState> {
  if (!(await adminUser())) return { message: "No tienes permiso para esta configuración." };
  const settings = readSettings(fd, await getSapSettings());
  const supabase = await createClient();
  const stored = await getSapSettings();
  await supabase.from("integration_settings").upsert({ key: "sap", value: { ...stored, product_import: settings.product_import }, updated_at: new Date().toISOString() });
  revalidatePath("/configuracion/sap");
  if (sapSourceOf(stored) === "agent") return requestFromAgent("product_preview", settings.product_import);
  try {
    const all = await fetchSapItems(settings.product_import, MAX_PICK + 1);
    const rows = all.slice(0, MAX_PICK);
    return {
      ok: true, message: previewMessage(rows.length, all.length > MAX_PICK),
      preview: rows, columns: ["ItemCode", "ItemName", ...settings.product_import.mappings.map((m) => m.sap_field)],
      truncated: all.length > MAX_PICK, existing: await existingCodes(rows.map((x) => x.ItemCode)),
    };
  } catch (e) {
    return { message: `SAP no respondió: ${(e as Error).message}` };
  }
}

export async function runSapImport(_prev: ImportState, fd: FormData): Promise<ImportState> {
  const user = await adminUser();
  if (!user) return { message: "No tienes permiso para esta configuración." };
  if (!can(user.access, "products", "create") || !can(user.access, "products", "edit")) return { message: "Necesitas permiso para crear y editar productos." };
  // Solo se importa lo que la persona marcó en la lista.
  const codes = [...new Set(fd.getAll("code").map((c) => String(c).trim()).filter((c) => c && c.length <= 50))].slice(0, MAX_PICK);
  if (!codes.length) return { message: "Marca al menos un artículo de la lista para importarlo." };
  const stored = await getSapSettings();
  if (sapSourceOf(stored) === "agent") return requestFromAgent("product_import", stored.product_import, codes);
  try {
    const r = await importSapItems(stored.product_import, codes);
    revalidatePath("/productos");
    const base = `${r.total} artículos leídos de SAP: ${r.created} productos creados y ${r.updated} actualizados.`;
    return r.errors.length ? { message: `${base} Errores: ${r.errors.slice(0, 3).join(" · ")}` } : { ok: true, message: base };
  } catch (e) {
    return { message: `SAP no respondió: ${(e as Error).message}` };
  }
}
