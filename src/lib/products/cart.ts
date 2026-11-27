import "server-only";
import { createClient } from "@/lib/supabase/server";

const MAX = 100;

/**
 * Agrega a una cotización recién creada los productos de la selección («carrito»), cada uno con el precio que le
 * toca en la lista de esa cotización (la del cliente o la de su canal). Los que no tienen precio no se agregan y se
 * devuelven para avisarlo.
 */
export async function addCartLines(quoteId: string, raw: string): Promise<{ added: number; skipped: string[] }> {
  let items: { id: string; qty: number }[] = [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      items = parsed
        .map((i) => ({ id: String((i as { id?: unknown })?.id ?? ""), qty: Number((i as { qty?: unknown })?.qty) }))
        .filter((i) => /^[0-9a-f-]{36}$/i.test(i.id) && Number.isFinite(i.qty) && i.qty > 0)
        .slice(0, MAX);
    }
  } catch {
    return { added: 0, skipped: [] };
  }
  if (!items.length) return { added: 0, skipped: [] };

  const supabase = await createClient();
  const { data: products } = await supabase.from("products").select("id, name, is_active").in("id", items.map((i) => i.id));
  const byId = new Map((products ?? []).map((p) => [p.id, p]));
  const skipped: string[] = [];
  const rows: { quote_id: string; product_id: string; description: string; quantity: number; unit_price: number; discount: number; sort_order: number }[] = [];
  for (const item of items) {
    const product = byId.get(item.id);
    if (!product?.is_active) continue;
    const { data: price } = await supabase.rpc("quote_line_price", { p_quote: quoteId, p_product: item.id });
    const unitPrice = (price as { unit_price: number | null } | null)?.unit_price;
    if (unitPrice === null || unitPrice === undefined) {
      skipped.push(product.name);
      continue;
    }
    rows.push({ quote_id: quoteId, product_id: item.id, description: product.name, quantity: item.qty, unit_price: unitPrice, discount: 0, sort_order: rows.length + 1 });
  }
  if (rows.length) {
    const { error } = await supabase.from("quote_line_items").insert(rows);
    if (error) return { added: 0, skipped: [...skipped, ...rows.map((r) => r.description)] };
  }
  return { added: rows.length, skipped };
}
