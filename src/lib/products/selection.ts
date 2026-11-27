import "server-only";
import { getListViews, getObjectDef, listRecords } from "@/lib/records/data";
import { parseListParams } from "@/lib/records/filters";
import type { CurrentUser } from "@/lib/session";

/**
 * Los productos que muestra la lista con esa dirección (vista, búsqueda y filtros), todos y no solo la página visible.
 * `summary` describe cómo se eligieron, para dejarlo escrito en el ajuste de precios.
 */
export async function selectedProducts(qs: URLSearchParams, user: CurrentUser) {
  const sp = Object.fromEntries(qs.entries());
  const [def, views] = await Promise.all([getObjectDef("products"), getListViews("products")]);
  const view = views.find((v) => v.id === sp.view) ?? null;
  const params = parseListParams(def, sp, view?.definition ?? null, user.preferences.page_size);
  const { rows, error } = await listRecords(def, params, user.id, { all: true });
  const labelOf = (name: string) => def.fields.find((f) => f.name === name)?.label ?? name;
  return {
    ids: error ? [] : rows.map((r) => String(r.id)),
    error,
    summary: {
      view: view?.name ?? null,
      q: params.q || null,
      filters: params.filters.map((f) => ({ field: labelOf(f.field), op: f.op, value: f.value })),
    },
  };
}
