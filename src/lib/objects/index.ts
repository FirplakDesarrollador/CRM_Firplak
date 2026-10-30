import { accounts } from "./accounts";
import { activities } from "./activities";
import { contacts } from "./contacts";
import { opportunities } from "./opportunities";
import { leads } from "./leads";
import { campaigns } from "./campaigns";
import { products } from "./products";
import { quotes } from "./quotes";
import { cases } from "./cases";
import type { CustomFieldRow, FieldDef, FieldType, ObjectDef, ObjectKey } from "./types";

export * from "./types";

export const OBJECTS: Record<ObjectKey, ObjectDef> = {
  leads, accounts, contacts, opportunities, quotes, products, cases, campaigns, activities,
};

export function getObject(key: string): ObjectDef {
  const def = OBJECTS[key as ObjectKey];
  if (!def) throw new Error(`Objeto desconocido: ${key}`);
  return def;
}

export function isObjectKey(key: string): key is ObjectKey {
  return key in OBJECTS;
}

const CUSTOM_TYPE_MAP: Record<string, FieldType> = {
  text: "text", textarea: "textarea", number: "number", currency: "currency", percent: "percent",
  date: "date", checkbox: "checkbox", select: "select", multiselect: "multiselect",
  email: "email", phone: "phone", url: "url",
};

export function customFieldToDef(row: CustomFieldRow): FieldDef {
  const options = Array.isArray(row.options) ? (row.options as unknown[]).map(String) : [];
  return {
    name: `cf.${row.api_name}`,
    label: row.label,
    type: CUSTOM_TYPE_MAP[row.field_type] ?? "text",
    required: row.is_required,
    options,
    section: "custom",
    wide: row.field_type === "textarea",
    help: row.help_text ?? undefined,
    custom: true,
  };
}

/** Definición del objeto con sus campos personalizados activos al final. */
export function withCustomFields(def: ObjectDef, rows: CustomFieldRow[]): ObjectDef & { listCustom: string[] } {
  const active = rows.filter((r) => r.object === def.key && r.is_active).sort((a, b) => a.sort_order - b.sort_order);
  return {
    ...def,
    fields: [...def.fields, ...active.map(customFieldToDef)],
    listCustom: active.filter((r) => r.show_in_list).map((r) => `cf.${r.api_name}`),
  };
}

export function fieldValue(row: Record<string, unknown>, name: string): unknown {
  if (name.startsWith("cf.")) {
    const cf = (row.custom_fields ?? {}) as Record<string, unknown>;
    return cf[name.slice(3)];
  }
  return row[name];
}

/** Nombre de columna PostgREST (los personalizados se leen como texto del jsonb). */
export function columnFor(name: string) {
  return name.startsWith("cf.") ? `custom_fields->>${name.slice(3)}` : name;
}

export function recordTitle(def: ObjectDef, row: Record<string, unknown>) {
  return String(row[def.nameField] ?? "(sin nombre)");
}
