import type { ObjectKey } from "@/lib/objects";

export const IMPORTABLE: ObjectKey[] = ["accounts", "contacts", "leads", "opportunities", "products"];

/** Campos que sirven para encontrar registros existentes al actualizar. */
export const MATCH_FIELDS: Partial<Record<ObjectKey, string[]>> = {
  accounts: ["tax_id", "account_number", "name"],
  contacts: ["email", "full_name"],
  leads: ["email"],
  opportunities: ["name"],
  products: ["product_code", "name"],
};

export const CHUNK_SIZE = 200;
export const MAX_ROWS = 5000;
