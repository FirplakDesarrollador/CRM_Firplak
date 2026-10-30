import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  columnFor,
  getObject,
  withCustomFields,
  type CustomFieldRow,
  type ListDefinition,
  type ObjectDef,
  type ObjectKey,
} from "@/lib/objects";
import { applyFilter, applySearch, type ListParams } from "./filters";
import type { PicklistRow } from "@/lib/objects/picklist-config";
import { translateObjectDef } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export type Row = Record<string, unknown> & { id: string };
export type UserOption = { id: string; full_name: string; email: string; is_active: boolean };
export type StageRow = {
  id: string; pipeline_id: string; name: string; sort_order: number; probability: number;
  category: "open" | "won" | "lost"; forecast_category: string; color: string;
};
export type PipelineWithStages = {
  id: string; name: string; description: string | null; is_default: boolean; is_active: boolean; sort_order: number;
  stages: StageRow[];
};

/** Cliente sin tipar para consultas genéricas sobre tablas elegidas en tiempo de ejecución. */
export async function untypedClient(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient;
}

export const getCustomFieldRows = cache(async (): Promise<CustomFieldRow[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("custom_field_definitions").select("*").order("sort_order");
  return (data ?? []) as CustomFieldRow[];
});

export const getPicklistRows = cache(async (): Promise<PicklistRow[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("picklist_values").select("*").order("sort_order");
  return (data ?? []) as PicklistRow[];
});

export const getObjectDef = cache(async (key: ObjectKey) => {
  const [custom, picklists, locale] = await Promise.all([getCustomFieldRows(), getPicklistRows(), getLocale()]);
  return translateObjectDef(withCustomFields(getObject(key), custom, picklists), locale);
});

export const getUsers = cache(async (): Promise<UserOption[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, full_name, email, is_active").order("full_name");
  return (data ?? []).map((u) => ({ ...u, full_name: u.full_name || u.email }));
});

export const getPipelines = cache(async (): Promise<PipelineWithStages[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pipelines")
    .select("*, stages:pipeline_stages(*)")
    .order("sort_order")
    .order("created_at");
  return (data ?? []).map((p) => ({
    ...p,
    stages: [...((p.stages ?? []) as StageRow[])].sort((a, b) => a.sort_order - b.sort_order),
  })) as PipelineWithStages[];
});

export async function getListViews(object: ObjectKey) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("list_views")
    .select("id, name, owner_id, is_shared, is_pinned, definition")
    .eq("object", object)
    .order("is_shared", { ascending: false })
    .order("name");
  return (data ?? []).map((v) => ({ ...v, definition: (v.definition ?? {}) as ListDefinition }));
}

export async function listRecords(def: ObjectDef, params: ListParams, userId: string, opts: { all?: boolean } = {}) {
  const db = await untypedClient();
  let query = db.from(def.table).select(def.select, { count: "exact" });

  if (params.scope === "mine" && def.hasOwner !== false) query = query.eq("owner_id", userId);
  for (const filter of params.filters) query = applyFilter(query, def, filter, userId);
  if (params.q) query = applySearch(query, def, params.q);

  const sortField = def.fields.find((f) => f.name === params.sort.field);
  const sortable = !sortField || (sortField.sortable !== false && !["lookup", "user", "stage", "multiselect"].includes(sortField.type));
  const sortColumn = sortable ? columnFor(params.sort.field) : columnFor(def.defaultSort.field);
  query = query.order(sortColumn, { ascending: params.sort.dir === "asc", nullsFirst: false }).order("id");

  if (!opts.all) {
    const from = (params.page - 1) * params.pageSize;
    query = query.range(from, from + params.pageSize - 1);
  } else {
    query = query.limit(5000);
  }

  const { data, count, error } = await query;
  return { rows: (data ?? []) as unknown as Row[], count: count ?? 0, error: error?.message ?? null };
}

export async function getRecord(def: ObjectDef, id: string): Promise<Row | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = await untypedClient();
  const { data } = await db.from(def.table).select(def.select).eq("id", id).maybeSingle();
  return (data as unknown as Row) ?? null;
}

/** Comprueba en la base si el usuario actual puede editar/eliminar el registro. */
export async function getRecordAccess(object: ObjectKey, ownerId: string | null) {
  const supabase = await createClient();
  if (object === "products") {
    const [edit, del] = await Promise.all([
      supabase.rpc("has_perm", { p_object: "products", p_action: "edit" }),
      supabase.rpc("has_perm", { p_object: "products", p_action: "delete" }),
    ]);
    return { canEdit: Boolean(edit.data), canDelete: Boolean(del.data) };
  }
  const [edit, del] = await Promise.all([
    supabase.rpc("can_edit_record", { p_object: object, p_owner: ownerId ?? "00000000-0000-0000-0000-000000000000" }),
    supabase.rpc("can_delete_record", { p_object: object, p_owner: ownerId ?? "00000000-0000-0000-0000-000000000000" }),
  ]);
  return { canEdit: Boolean(edit.data), canDelete: Boolean(del.data) };
}
