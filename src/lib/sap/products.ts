import "server-only";
import { createClient } from "@/lib/supabase/server";
import { odataString, sapGet } from "./client";
import { validSapField, type SapSettings } from "./settings";

type SapItemRow = Record<string, unknown> & { ItemCode: string; ItemName: string | null };
type Page = { value: SapItemRow[]; "odata.nextLink"?: string; "@odata.nextLink"?: string };

export const MAX_IMPORT = 5000;
/** Tope de la lista para elegir y de los artículos elegidos en una importación. */
export const MAX_PICK = 1000;

function itemsQuery(opts: SapSettings["product_import"], top?: number) {
  const fields = ["ItemCode", "ItemName", ...opts.mappings.map((m) => m.sap_field).filter(validSapField)];
  const filters = [
    opts.sales_only ? "SalesItem eq 'tYES'" : null,
    opts.prefix.trim() ? `startswith(ItemCode,${odataString(opts.prefix.trim())})` : null,
  ].filter(Boolean);
  const q = [`$select=${[...new Set(fields)].join(",")}`, filters.length ? `$filter=${filters.join(" and ")}` : null, "$orderby=ItemCode", top ? `$top=${top}` : null];
  return `/Items?${q.filter(Boolean).join("&")}`;
}

/** Artículos de SAP según el filtro (todas las páginas, hasta MAX_IMPORT). */
export async function fetchSapItems(opts: SapSettings["product_import"], limit = MAX_IMPORT) {
  const items: SapItemRow[] = [];
  let next: string | undefined = itemsQuery(opts, limit < 50 ? limit : undefined);
  while (next && items.length < limit) {
    const page: Page = await sapGet<Page>(next);
    items.push(...page.value);
    next = page["odata.nextLink"] ?? page["@odata.nextLink"];
  }
  return items.slice(0, limit);
}

/** Valor de SAP convertido al tipo del campo personalizado del CRM. */
function convert(value: unknown, type: string) {
  if (value === null || value === undefined || value === "") return null;
  if (["number", "currency", "percent"].includes(type)) return Number.isFinite(Number(value)) ? Number(value) : null;
  if (type === "checkbox") return value === true || value === "tYES" || value === "Y" || value === 1;
  return String(value);
}

/**
 * Crea o actualiza productos por Referencia = ItemCode: solo nombre (descripción de SAP) y los
 * campos personalizados mapeados. No toca precios, familia ni el resto del producto.
 */
export async function importSapItems(opts: SapSettings["product_import"], codes?: string[], extra: { family?: string | null; plant?: string | null } = {}) {
  // Familia y Planta elegidas en el CRM (el Grupo de Artículo solo lo trae el agente).
  const chosen = { ...(extra.family ? { family: extra.family } : {}), ...(extra.plant ? { plant: extra.plant } : {}) };
  // Con una lista de códigos se importan solo esos (los que la persona eligió en la lista).
  const wanted = codes ? new Set(codes) : null;
  const items = (await fetchSapItems(opts)).filter((it) => !wanted || wanted.has(it.ItemCode));
  const supabase = await createClient();
  const { data: defs } = await supabase.from("custom_field_definitions").select("api_name, field_type").eq("object", "products").eq("is_active", true);
  const types = new Map((defs ?? []).map((d) => [d.api_name, d.field_type]));
  const mappings = opts.mappings.filter((m) => types.has(m.field) && validSapField(m.sap_field));

  let created = 0, updated = 0;
  const errors: string[] = [];
  for (let i = 0; i < items.length; i += 200) {
    const chunk = items.slice(i, i + 200);
    const { data: existing } = await supabase.from("products").select("id, product_code, custom_fields").in("product_code", chunk.map((c) => c.ItemCode));
    const byCode = new Map((existing ?? []).map((p) => [p.product_code, p]));
    const inserts = [];
    for (const it of chunk) {
      const mapped = Object.fromEntries(mappings.map((m) => [m.field, convert(it[m.sap_field], types.get(m.field)!)]));
      const name = (it.ItemName ?? "").trim() || it.ItemCode;
      const current = byCode.get(it.ItemCode);
      if (current) {
        const { error } = await supabase.from("products").update({
          name, custom_fields: { ...((current.custom_fields ?? {}) as object), ...mapped }, ...chosen,
        }).eq("id", current.id);
        if (error) errors.push(`${it.ItemCode}: ${error.message}`); else updated++;
      } else {
        inserts.push({ name, product_code: it.ItemCode, unit: "Unidad", is_active: true, custom_fields: mapped, ...chosen });
      }
    }
    if (inserts.length) {
      const { error, count } = await supabase.from("products").insert(inserts, { count: "exact" });
      if (error) errors.push(error.message); else created += count ?? inserts.length;
    }
  }
  return { total: items.length, created, updated, errors };
}
