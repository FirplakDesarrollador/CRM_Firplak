import "server-only";
import { createClient } from "@/lib/supabase/server";
import { sapConfigured } from "./client";

/** Campo personalizado de productos del CRM ← campo de SAP (p. ej. U_Linea, ItemsGroupCode). */
export type SapFieldMapping = { field: string; sap_field: string };
/** De dónde lee el CRM la cartera y el inventario: la copia que deja el agente o SAP en vivo. */
export type SapSource = "agent" | "direct";
export type SapSettings = {
  /** Sin elegir: en vivo si el servidor tiene las credenciales de SAP; si no, la copia del agente. */
  source?: SapSource;
  /** Crear la oferta de venta en SAP al activar un pedido. */
  create_quotations: boolean;
  product_import: { prefix: string; sales_only: boolean; mappings: SapFieldMapping[] };
};
export const DEFAULT_SAP_SETTINGS: SapSettings = { create_quotations: false, product_import: { prefix: "", sales_only: true, mappings: [] } };

export async function getSapSettings(): Promise<SapSettings> {
  const supabase = await createClient();
  const { data } = await supabase.from("integration_settings").select("value").eq("key", "sap").maybeSingle();
  const v = (data?.value ?? {}) as Partial<SapSettings>;
  return { ...DEFAULT_SAP_SETTINGS, ...v, product_import: { ...DEFAULT_SAP_SETTINGS.product_import, ...(v.product_import ?? {}) } };
}

export const sapSourceOf = (s: SapSettings): SapSource => s.source ?? (sapConfigured() ? "direct" : "agent");
export const getSapSource = async () => sapSourceOf(await getSapSettings());

/** Nombre de campo de SAP válido (propiedades de Items o campos de usuario U_…). */
export const validSapField = (name: string) => /^[A-Za-z][A-Za-z0-9_]{0,49}$/.test(name);
