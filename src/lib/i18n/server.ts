import "server-only";
import { cache } from "react";
import { getCurrentUser } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { makeT, makeValueLabel, type DataLabels, type Locale } from "./index";

export const getLocale = cache(async (): Promise<Locale> => {
  const user = await getCurrentUser();
  return user?.preferences.language === "en" ? "en" : "es";
});

/**
 * Etiquetas en inglés definidas en Configuración: valores de listas, pipelines, etapas y
 * opciones de campos personalizados (clave: el valor en español). Solo se cargan en inglés.
 */
export const getDataLabels = cache(async (): Promise<DataLabels> => {
  if ((await getLocale()) !== "en") return {};
  const supabase = await createClient();
  const [picklists, pipelines, stages, fields] = await Promise.all([
    supabase.from("picklist_values").select("value, label_en").not("label_en", "is", null),
    supabase.from("pipelines").select("name, name_en").not("name_en", "is", null),
    supabase.from("pipeline_stages").select("name, name_en").not("name_en", "is", null),
    supabase.from("custom_field_definitions").select("option_labels_en"),
  ]);
  const labels: DataLabels = {};
  for (const f of fields.data ?? []) Object.assign(labels, (f.option_labels_en ?? {}) as DataLabels);
  for (const p of picklists.data ?? []) if (p.label_en) labels[p.value] = p.label_en;
  for (const p of pipelines.data ?? []) if (p.name_en) labels[p.name] = p.name_en;
  for (const s of stages.data ?? []) if (s.name_en) labels[s.name] = s.name_en;
  return labels;
});

export async function getT() {
  const [locale, data] = await Promise.all([getLocale(), getDataLabels()]);
  return makeT(locale, data);
}

/** Traductor solo de valores de listas y etapas (para datos, no textos de la interfaz). */
export async function getValueLabel() {
  const [locale, data] = await Promise.all([getLocale(), getDataLabels()]);
  return makeValueLabel(locale, data);
}
