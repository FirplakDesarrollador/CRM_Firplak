import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Lo que un asesor quiere saber de un producto sin abrirlo: su disponible real (En inventario − Comprometido en
 * PT-01; en un kit, kits completos) y su precio en las listas de los canales que atiende (los de sus territorios;
 * quien no tiene territorios ve todas las listas de canal).
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/productos/[id]/resumen">) {
  const [{ id }, user] = await Promise.all([ctx.params, getCurrentUser()]);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Producto no válido" }, { status: 400 });
  const supabase = await createClient();
  const [{ data: product }, { data: territories }, { data: books }, { data: entries }] = await Promise.all([
    supabase.from("products").select("id, name, product_code, unit, is_kit, available_qty, available_at").eq("id", id).maybeSingle(),
    supabase.from("territories").select("channels, market").eq("user_id", user.id),
    supabase.from("price_books").select("id, name, market, channel, currency").eq("is_active", true).eq("is_client_list", false).order("market").order("name"),
    supabase.from("price_book_entries").select("price_book_id, unit_price").eq("product_id", id).eq("is_active", true),
  ]);
  if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  const mine = new Set((territories ?? []).flatMap((t) => t.channels.map((c) => `${t.market}|${c}`)));
  const lists = (books ?? []).filter((b) => (mine.size ? b.channel !== null && mine.has(`${b.market}|${b.channel}`) : true));
  const priceOf = new Map((entries ?? []).map((e) => [e.price_book_id, Number(e.unit_price)]));
  return NextResponse.json({
    name: product.name,
    code: product.product_code,
    unit: product.unit,
    isKit: product.is_kit,
    available: product.available_qty === null ? null : Number(product.available_qty),
    availableAt: product.available_at,
    ownChannels: mine.size > 0,
    prices: lists.map((b) => ({ list: b.name, channel: b.channel, market: b.market, currency: b.currency, price: priceOf.get(b.id) ?? null })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
