"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/session";
import { parseAmount, type FormState } from "@/lib/records/form";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

function friendly(message: string) {
  if (message.includes("row-level security") || message.includes("42501")) return "No tienes permiso para realizar esta acción.";
  return message;
}

/** Crea el pedido desde una cotización aceptada y abre su ficha. */
export async function createOrderFromQuote(quoteId: string, _prev?: FormState, _fd?: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_order_from_quote", { p_quote: quoteId });
  if (error || !data) return { message: friendly(error?.message ?? "No se pudo crear el pedido") };
  revalidatePath("/", "layout");
  redirect(`/pedidos/${data}`);
}

export async function addOrderLine(orderId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const productId = str(fd, "product_id");
  if (!isUuid(productId)) return { errors: { product_id: "Elige un producto" } };
  const quantity = parseAmount(str(fd, "quantity")) ?? 1;
  if (quantity <= 0) return { errors: { quantity: "Cantidad no válida" } };
  const discount = Math.min(100, Math.max(0, parseAmount(str(fd, "discount")) ?? 0));

  const supabase = await createClient();
  const { data: order } = await supabase.from("orders").select("price_book_id").eq("id", orderId).maybeSingle();
  if (!order) return { message: "Pedido no encontrado" };
  const [{ data: entry }, { data: product }, { count }] = await Promise.all([
    supabase.from("price_book_entries").select("unit_price")
      .eq("product_id", productId).eq("price_book_id", order.price_book_id ?? "").eq("is_active", true).maybeSingle(),
    supabase.from("products").select("name").eq("id", productId).maybeSingle(),
    supabase.from("order_items").select("id", { count: "exact", head: true }).eq("order_id", orderId),
  ]);
  const unitPrice = parseAmount(str(fd, "unit_price")) ?? entry?.unit_price;
  if (unitPrice === undefined || unitPrice === null) {
    return { errors: { unit_price: "El producto no tiene precio en la lista de este pedido; escribe el precio." } };
  }
  const { error } = await supabase.from("order_items").insert({
    order_id: orderId,
    product_id: productId,
    description: str(fd, "description") || product?.name || null,
    quantity,
    unit_price: unitPrice,
    discount,
    sort_order: (count ?? 0) + 1,
  });
  if (error) return { message: friendly(error.message) };
  revalidatePath("/", "layout");
  return { ok: true, values: { nonce: crypto.randomUUID() } };
}

export async function updateOrderLine(lineId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const quantity = parseAmount(str(fd, "quantity"));
  const unitPrice = parseAmount(str(fd, "unit_price"));
  const discount = parseAmount(str(fd, "discount")) ?? 0;
  if (!quantity || quantity <= 0 || unitPrice === null || unitPrice < 0 || !(discount >= 0 && discount <= 100)) {
    return { message: "Revisa cantidad, precio y descuento" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("order_items")
    .update({ quantity, unit_price: unitPrice, discount }).eq("id", lineId).select("id");
  if (error) return { message: friendly(error.message) };
  if (!data?.length) return { message: "No tienes permiso para editar esta línea." };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeOrderLine(lineId: string, _prev?: FormState, _fd?: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("order_items").delete().eq("id", lineId).select("id");
  if (error) return { message: friendly(error.message) };
  if (!data?.length) return { message: "No tienes permiso para quitar esta línea." };
  revalidatePath("/", "layout");
  return { ok: true };
}
