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
import type { PicklistDependency, PicklistRow } from "@/lib/objects/picklist-config";
import { translateObjectDef } from "@/lib/i18n";
import { getDataLabels, getLocale } from "@/lib/i18n/server";

export type Row = Record<string, unknown> & { id: string };
export type UserOption = { id: string; full_name: string; email: string; is_active: boolean };
export type StageRow = {
  id: string; pipeline_id: string; name: string; sort_order: number; probability: number;
  category: "open" | "won" | "lost"; forecast_category: string; color: string; name_en?: string | null;
  /** Etapa a la que avanza la oportunidad según sus cotizaciones: propuesta o negociacion. */
  stage_role?: string | null;
};
export type PipelineWithStages = {
  id: string; name: string; name_en?: string | null; description: string | null; is_default: boolean; is_active: boolean; sort_order: number;
  /** Canal de venta cuyas oportunidades van a este pipeline. */
  channel: string | null;
  /** Mercado del pipeline (Nacional o Internacional): uno por mercado y canal. */
  market: string;
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

export const getPicklistDependencies = cache(async (): Promise<PicklistDependency[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("picklist_dependencies").select("object, field, controlling_field");
  return (data ?? []) as PicklistDependency[];
});

export const getObjectDef = cache(async (key: ObjectKey) => {
  const [custom, picklists, dependencies, locale, labels] = await Promise.all([
    getCustomFieldRows(), getPicklistRows(), getPicklistDependencies(), getLocale(), getDataLabels(),
  ]);
  return translateObjectDef(withCustomFields(getObject(key), custom, picklists, dependencies), locale, labels);
});

export const getUsers = cache(async (): Promise<UserOption[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, full_name, email, is_active").order("full_name");
  return (data ?? []).map((u) => ({ ...u, full_name: u.full_name || u.email }));
});

/** Países (Colombia primero) y municipios de Colombia por departamento, para los campos de dirección. */
export type GeoData = { countries: string[]; departments: Record<string, string[]> };
export const getGeo = cache(async (): Promise<GeoData> => {
  const supabase = await createClient();
  const [{ data: countries }, { data: places }] = await Promise.all([
    supabase.from("countries").select("name").order("name"),
    // Son 1.122 municipios y la API corta en 1000: sin leer por páginas faltaban los últimos departamentos
    // (parte de Sucre, Tolima, Valle del Cauca, Vaupés y Vichada).
    fetchAllRows<{ department: string; city: string }>((from, to) =>
      supabase.from("co_municipalities").select("department, city").order("department").order("city").range(from, to)).then((data) => ({ data }), () => ({ data: [] as { department: string; city: string }[] })),
  ]);
  const departments: Record<string, string[]> = {};
  for (const p of places ?? []) (departments[p.department] ??= []).push(p.city);
  const names = (countries ?? []).map((c) => c.name);
  return { countries: names.includes("Colombia") ? ["Colombia", ...names.filter((n) => n !== "Colombia")] : names, departments };
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

/** Canales de venta: los valores del campo Canal de las cuentas (Configuración → Listas). */
export const getChannels = cache(async (): Promise<string[]> => {
  const def = await getObjectDef("accounts");
  return def.fields.find((f) => f.name === "industry")?.options ?? [];
});

/** Listas de precios de cliente activas (para asignarlas a una cuenta), con su mercado: solo sirve una del mercado de la cuenta. */
export const getClientPriceBooks = cache(async (): Promise<{ id: string; name: string }[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("price_books").select("id, name, market, currency").eq("is_client_list", true).eq("is_active", true)
    .order("market").order("name");
  return (data ?? []).map((b) => ({ id: b.id, name: `${b.name} · ${b.market} (${b.currency})` }));
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

/** La API entrega como máximo 1000 filas por consulta (`max_rows`): lo que pide más se lee por páginas. */
export const API_PAGE = 1000;
/** Tope de filas de una exportación o un informe. */
const MAX_ALL = 20000;

/** Todas las filas de una consulta, leídas por páginas. `page` arma la consulta de cada tramo. */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  max = MAX_ALL,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < max; from += API_PAGE) {
    const { data, error } = await page(from, from + API_PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < API_PAGE) break;
  }
  return rows;
}

export async function listRecords(def: ObjectDef, params: ListParams, userId: string, opts: { all?: boolean } = {}) {
  const db = await untypedClient();
  const none = "00000000-0000-0000-0000-000000000000";
  // Lo que los filtros necesitan saber de otras tablas se consulta una sola vez, antes de armar la consulta.
  let creditIds: string[] | null = null;
  if (params.credit) {
    const { data: credited } = await db.from("opportunity_credit").select("opportunity_id").eq("user_id", params.credit);
    creditIds = ((credited ?? []) as { opportunity_id: string }[]).map((r) => r.opportunity_id);
  }
  // Cuentas de cuyo equipo hace parte; oportunidades de su equipo o de esas cuentas (si el
  // equipo de cuenta le da acceso a sus oportunidades).
  let accRows: { account_id: string; opportunity_access: string }[] = [];
  let oppIds: string[] = [];
  if (params.scope === "team") {
    const { data: accTeams } = await db.from("account_team_members").select("account_id, opportunity_access").eq("user_id", userId);
    accRows = (accTeams ?? []) as { account_id: string; opportunity_access: string }[];
    if (def.key !== "accounts") {
      const { data: oppTeams } = await db.from("opportunity_team_members").select("opportunity_id").eq("user_id", userId);
      oppIds = ((oppTeams ?? []) as { opportunity_id: string }[]).map((r) => r.opportunity_id);
    }
  }
  const sortField = def.fields.find((f) => f.name === params.sort.field);
  const sortable = !sortField || (sortField.sortable !== false && !["lookup", "user", "stage", "multiselect"].includes(sortField.type));
  const sortColumn = sortable ? columnFor(params.sort.field) : columnFor(def.defaultSort.field);

  const build = () => {
    let query = db.from(def.table).select(def.select, { count: "exact" });
    if (params.scope === "mine" && def.hasOwner !== false) query = query.eq("owner_id", userId);
    if (creditIds) query = query.in("id", creditIds.length ? creditIds : [none]);
    if (params.scope === "team") {
      if (def.key === "accounts") {
        query = query.in("id", accRows.length ? accRows.map((r) => r.account_id) : [none]);
      } else {
        const accIds = accRows.filter((r) => r.opportunity_access !== "none").map((r) => r.account_id);
        query = query.or(`id.in.(${[none, ...oppIds].join(",")}),account_id.in.(${[none, ...accIds].join(",")})`);
      }
    }
    for (const filter of params.filters) query = applyFilter(query, def, filter, userId);
    if (params.q) query = applySearch(query, def, params.q);
    return query.order(sortColumn, { ascending: params.sort.dir === "asc", nullsFirst: false }).order("id");
  };

  if (!opts.all) {
    const from = (params.page - 1) * params.pageSize;
    const { data, count, error } = await build().range(from, from + params.pageSize - 1);
    return { rows: (data ?? []) as unknown as Row[], count: count ?? 0, error: error?.message ?? null };
  }
  // Exportaciones e informes: todas las filas, por páginas (antes se cortaban en las primeras 1000).
  const rows: Row[] = [];
  let total = 0;
  for (let from = 0; from < MAX_ALL; from += API_PAGE) {
    const { data, count, error } = await build().range(from, from + API_PAGE - 1);
    if (error) return { rows: [] as Row[], count: 0, error: error.message };
    rows.push(...((data ?? []) as unknown as Row[]));
    total = count ?? rows.length;
    if (!data || data.length < API_PAGE) break;
  }
  return { rows, count: total, error: null };
}

export async function getRecord(def: ObjectDef, id: string): Promise<Row | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = await untypedClient();
  const { data } = await db.from(def.table).select(def.select).eq("id", id).maybeSingle();
  return (data as unknown as Row) ?? null;
}

/** Comprueba en la base si el usuario actual puede editar/eliminar el registro. */
/**
 * Permisos del usuario sobre un registro. Con `recordId`, un registro bloqueado por una
 * aprobación pendiente no se puede editar ni eliminar (salvo el aprobador o administración).
 */
export async function getRecordAccess(object: ObjectKey, ownerId: string | null, recordId?: string) {
  const supabase = await createClient();
  const locked = recordId && object !== "activities"
    ? supabase.rpc("is_record_locked", { p_object: object, p_id: recordId }).then((r) => Boolean(r.data))
    : Promise.resolve(false);
  const [edit, del, isLocked] = await Promise.all(object === "products"
    ? [
      supabase.rpc("has_perm", { p_object: "products", p_action: "edit" }),
      supabase.rpc("has_perm", { p_object: "products", p_action: "delete" }),
      locked,
    ]
    : [
      // Con el id del registro también cuenta el acceso de edición por equipo (Fase 15).
      recordId
        ? supabase.rpc("can_edit_team_record", { p_object: object, p_owner: ownerId ?? "00000000-0000-0000-0000-000000000000", p_id: recordId })
        : supabase.rpc("can_edit_record", { p_object: object, p_owner: ownerId ?? "00000000-0000-0000-0000-000000000000" }),
      supabase.rpc("can_delete_record", { p_object: object, p_owner: ownerId ?? "00000000-0000-0000-0000-000000000000" }),
      locked,
    ]);
  return { canEdit: Boolean(edit.data) && !isLocked, canDelete: Boolean(del.data) && !isLocked, locked: isLocked };
}
