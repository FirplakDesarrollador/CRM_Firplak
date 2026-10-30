"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/records/form";

type SplitInput = { user_id: string; percent: number; note?: string };

/** Guarda el reparto completo de una oportunidad (vacío = 100 % para el propietario). */
export async function saveSplits(opportunityId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  let splits: SplitInput[];
  try {
    splits = (JSON.parse(String(fd.get("splits") ?? "[]")) as SplitInput[])
      .filter((s) => s.user_id)
      .map((s) => ({ user_id: s.user_id, percent: Math.round(Number(s.percent) * 100) / 100, note: s.note?.trim() || undefined }));
  } catch {
    return { message: "Formato de reparto no válido" };
  }
  const total = Math.round(splits.reduce((sum, s) => sum + s.percent, 0) * 100) / 100;
  if (splits.length && total !== 100) return { message: "El reparto debe sumar 100 %" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_opportunity_splits", { p_opportunity: opportunityId, p_splits: splits });
  if (error) {
    if (error.message.includes("dos veces")) return { message: "Una persona aparece dos veces en el reparto" };
    if (error.code === "42501") return { message: "No puedes cambiar el reparto de esta oportunidad" };
    return { message: error.message };
  }
  revalidatePath(`/oportunidades/${opportunityId}`);
  revalidatePath("/pronostico");
  revalidatePath("/metas");
  return { ok: true, message: splits.length ? "Reparto guardado" : "Reparto eliminado: el 100 % es del propietario" };
}
