"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/session";
import type { FormState } from "@/lib/records/form";

const YEAR = 60 * 60 * 24 * 365;

export async function savePreferences(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { message: "Sesión expirada" };
  const pick = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
    const v = String(formData.get(key) ?? "") as T;
    return allowed.includes(v) ? v : fallback;
  };
  const preferences = {
    ...user.preferences,
    theme: pick("theme", ["light", "dark", "system"] as const, "system"),
    density: pick("density", ["comfortable", "compact"] as const, "comfortable"),
    language: pick("language", ["es"] as const, "es"),
    home_page: pick("home_page", ["/inicio", "/oportunidades/pipeline", "/indicadores", "/actividades", "/cuentas", "/oportunidades"] as const, "/inicio"),
    page_size: [10, 25, 50, 100].includes(Number(formData.get("page_size"))) ? Number(formData.get("page_size")) : 25,
  };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ preferences }).eq("id", user.id);
  if (error) return { message: error.message };

  const store = await cookies();
  store.set("fp-theme", preferences.theme, { path: "/", maxAge: YEAR, sameSite: "lax" });
  store.set("fp-density", preferences.density, { path: "/", maxAge: YEAR, sameSite: "lax" });
  revalidatePath("/", "layout");
  return { ok: true, message: "Preferencias guardadas" };
}

export async function saveProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { message: "Sesión expirada" };
  const fullName = String(formData.get("full_name") ?? "").trim();
  if (!fullName) return { errors: { full_name: "Escribe tu nombre" } };
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      title: String(formData.get("title") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
    })
    .eq("id", user.id);
  if (error) return { message: error.message };
  revalidatePath("/", "layout");
  return { ok: true, message: "Perfil actualizado" };
}
