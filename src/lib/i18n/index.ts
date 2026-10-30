import type { ObjectDef } from "@/lib/objects";
import { FIELDS_EN, FIELD_OVERRIDES_EN, OBJECTS_EN, OPTION_LABELS_EN, OPS_EN, PHRASES_EN, SECTIONS_EN } from "./en";
import { UI_EN } from "./en-ui";
import { VALUES_EN } from "./values-en";

export type Locale = "es" | "en";
export type T = (es: string) => string;
/** Etiquetas en inglés de datos (valores de listas, etapas) definidas en Configuración. */
export type DataLabels = Record<string, string>;

/** Traduce un valor de lista o etapa: etiqueta propia, luego el diccionario estándar. */
export function makeValueLabel(locale: Locale, data: DataLabels = {}): T {
  if (locale !== "en") return (s) => s;
  return (s) => data[s] || VALUES_EN[s] || s;
}

export function makeT(locale: Locale, data: DataLabels = {}): T {
  if (locale !== "en") return (s) => s;
  return (s) => PHRASES_EN[s] ?? UI_EN[s] ?? OBJECTS_EN_BY_PLURAL[s] ?? (data[s] || VALUES_EN[s]) ?? s;
}

const OBJECTS_EN_BY_PLURAL: Record<string, string> = {
  Prospectos: "Leads", Cuentas: "Accounts", Contactos: "Contacts", Oportunidades: "Opportunities", Cotizaciones: "Quotes",
  Productos: "Products", Casos: "Cases", Campañas: "Campaigns", Actividades: "Activities", Pedidos: "Orders",
};

export function opLabels(locale: Locale, es: Record<string, string>) {
  return locale === "en" ? { ...es, ...OPS_EN } : es;
}

/** Traduce etiquetas de objeto, secciones, campos estándar y opciones con etiqueta. */
export function translateObjectDef<D extends ObjectDef>(def: D, locale: Locale, data: DataLabels = {}): D {
  if (locale !== "en") return def;
  const names = OBJECTS_EN[def.key];
  const value = makeValueLabel(locale, data);
  // Listas sin etiquetas propias en el código: cada valor muestra su traducción.
  const valueLabels = (f: ObjectDef["fields"][number]) =>
    !f.optionLabels && (f.type === "select" || f.type === "multiselect") && f.options?.length
      ? Object.fromEntries(f.options.map((o) => [o, value(o)]))
      : undefined;
  return {
    ...def,
    label: names?.label ?? def.label,
    plural: names?.plural ?? def.plural,
    sections: def.sections.map((s) => ({
      ...s,
      label: s.key === "info" ? `${names?.label ?? def.label} information` : SECTIONS_EN[s.key] ?? s.label,
    })),
    fields: def.fields.map((f) =>
      f.custom
        ? { ...f, label: f.labelEn ?? f.label, help: f.helpEn ?? f.help, optionLabels: f.optionLabels ?? valueLabels(f) }
        : {
            ...f,
            label: FIELD_OVERRIDES_EN[`${def.key}.${f.name}`] ?? FIELDS_EN[f.name] ?? f.label,
            optionLabels: f.optionLabels
              ? Object.fromEntries(Object.entries(f.optionLabels).map(([k, v]) => [k, OPTION_LABELS_EN[k] ?? v]))
              : valueLabels(f),
          },
    ),
  };
}
