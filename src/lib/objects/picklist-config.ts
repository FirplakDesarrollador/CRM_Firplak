import type { ObjectKey } from "./types";
import { TEAM_ROLES } from "@/lib/teams/config";

/**
 * Listas de valores que el administrador puede personalizar. Los estados que usan
 * reglas en la base de datos (etapas, estados de casos/cotizaciones/prospectos,
 * prioridades) no se editan aquí para no romper esas reglas.
 */
export const EDITABLE_PICKLISTS: Partial<Record<ObjectKey, string[]>> = {
  accounts: ["account_type", "market", "industry", "segment", "payment_terms"],
  contacts: ["salutation", "lead_source"],
  leads: ["salutation", "lead_source"],
  opportunities: ["opportunity_type", "lead_source", "loss_reason", "team_role"],
  cases: ["case_type", "origin"],
  campaigns: ["campaign_type"],
  products: ["family", "plant", "item_group", "unit"],
  activities: ["call_result"],
};

/**
 * Listas que un objeto toma de otro, con sus dependencias: los prospectos usan Mercado, Canal y Segmento
 * de Cuentas para que al convertir la cuenta reciba valores de su propia lista. Se editan en la pestaña de Cuentas.
 */
export const SHARED_PICKLISTS: Partial<Record<ObjectKey, { from: ObjectKey; fields: string[] }>> = {
  leads: { from: "accounts", fields: ["market", "industry", "segment"] },
};

/** Listas que no son un campo del objeto: se guardan con el objeto de la pestaña donde aparecen. */
export const EXTRA_PICKLISTS: Record<string, { label: string; options: string[] }> = {
  team_role: { label: "Rol en el equipo (cuentas y oportunidades)", options: TEAM_ROLES },
};

export type PicklistRow = {
  id: string; object: string; field: string; value: string; sort_order: number; is_active: boolean; label_en: string | null;
  /** Por cada lista que la controla, los valores de esa lista con los que este valor se puede elegir. */
  controlling_map: Record<string, string[]>;
};

/** Lista dependiente: `field` solo ofrece los valores ligados al valor elegido en `controlling_field` (puede haber varias). */
export type PicklistDependency = { object: string; field: string; controlling_field: string };
