"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/session";
import { parseAmount } from "@/lib/records/form";
import { selectedProducts } from "./selection";

export type PricePreviewList = {
  price_book_id: string; name: string; currency: string; percent: number; prices: number; before: number; after: number;
  samples: { name: string; code: string | null; before: number; after: number }[];
};
export type PriceAdjustState = {
  message?: string;
  ok?: boolean;
  /** Vista previa calculada con lo que hay en el formulario: es lo que se aplicará. */
  preview?: { lists: PricePreviewList[]; products: number; signature: string };
};

/** Palabra que hay que escribir para aplicar: cambia muchos precios de una vez. */
const CONFIRM_WORD = "AJUSTAR";
const ROUNDINGS = new Set(["0", "100", "1000"]);

function friendly(message: string) {
  if (message.includes("42501") || message.includes("Solo un administrador")) return "Solo un administrador puede ajustar precios.";
  return message;
}

/**
 * Ajuste masivo de precios: primero «Ver vista previa» (no guarda nada) y después «Aplicar», que exige escribir la
 * palabra de confirmación y que el formulario siga igual al de la vista previa.
 */
export async function adjustPrices(_prev: PriceAdjustState, fd: FormData): Promise<PriceAdjustState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.access.isAdmin) return { message: "Solo un administrador puede ajustar precios." };

  const changes: { price_book_id: string; percent: number }[] = [];
  for (const [key, value] of fd.entries()) {
    if (!key.startsWith("pct:") || !String(value).trim()) continue;
    const percent = parseAmount(String(value).trim());
    if (percent === null || !Number.isFinite(percent)) return { message: "Revisa los porcentajes: deben ser números (p. ej. 8 o -5)." };
    if (percent === 0) continue;
    if (percent < -90 || percent > 200) return { message: "Cada porcentaje debe estar entre -90 y 200." };
    changes.push({ price_book_id: key.slice(4), percent });
  }
  if (!changes.length) return { message: "Escribe el porcentaje de al menos una lista." };
  const rounding = ROUNDINGS.has(String(fd.get("rounding"))) ? Number(fd.get("rounding")) : 0;
  const qs = String(fd.get("_qs") ?? "");
  const { ids, summary } = await selectedProducts(new URLSearchParams(qs), user);
  if (!ids.length) return { message: "No hay productos en la lista con esos filtros." };

  const supabase = await createClient();
  // Lo que identifica esta vista previa: si después cambia algo del formulario, hay que volver a verla.
  const signature = JSON.stringify([qs, changes, rounding, ids.length]);
  const { data: preview, error } = await supabase.rpc("preview_price_adjustment", { p_products: ids, p_changes: changes, p_rounding: rounding });
  if (error) return { message: friendly(error.message) };
  const lists = (preview ?? []) as unknown as PricePreviewList[];
  const state: PriceAdjustState = { preview: { lists, products: ids.length, signature } };

  if (fd.get("_step") !== "apply") return state;
  if (String(fd.get("_signature") ?? "") !== signature) return { ...state, message: "Cambiaste algo después de la vista previa: revísala de nuevo antes de aplicar." };
  if (String(fd.get("confirm") ?? "").trim().toUpperCase() !== CONFIRM_WORD) return { ...state, message: `Para aplicar, escribe ${CONFIRM_WORD} en la casilla de confirmación.` };
  if (!lists.some((l) => l.prices > 0)) return { ...state, message: "Ninguno de los productos elegidos tiene precio en esas listas." };

  const { error: applyError } = await supabase.rpc("apply_price_adjustment", {
    p_products: ids, p_changes: changes, p_rounding: rounding, p_note: String(fd.get("note") ?? "").trim().slice(0, 200), p_filter: summary,
  });
  if (applyError) return { ...state, message: friendly(applyError.message) };
  revalidatePath("/", "layout");
  redirect("/productos/ajustar-precios?hecho=1");
}

export async function revertPriceAdjustment(id: string, _prev?: unknown, _fd?: FormData): Promise<{ ok?: boolean; message?: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.access.isAdmin) return { message: "Solo un administrador puede deshacer un ajuste de precios." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("revert_price_adjustment", { p_adjustment: id });
  if (error) return { message: friendly(error.message) };
  revalidatePath("/", "layout");
  return { ok: true, message: `Ajuste deshecho: ${data} precios volvieron a su valor anterior.` };
}
