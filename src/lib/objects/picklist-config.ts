import type { ObjectKey } from "./types";

/**
 * Listas de valores que el administrador puede personalizar. Los estados que usan
 * reglas en la base de datos (etapas, estados de casos/cotizaciones/prospectos,
 * prioridades) no se editan aquí para no romper esas reglas.
 */
export const EDITABLE_PICKLISTS: Partial<Record<ObjectKey, string[]>> = {
  accounts: ["account_type", "industry", "segment"],
  contacts: ["salutation", "lead_source"],
  leads: ["salutation", "industry", "lead_source"],
  opportunities: ["opportunity_type", "lead_source", "loss_reason"],
  cases: ["case_type", "origin"],
  campaigns: ["campaign_type"],
  products: ["family", "unit"],
  activities: ["call_result"],
};

export type PicklistRow = { id: string; object: string; field: string; value: string; sort_order: number; is_active: boolean };
