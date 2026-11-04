import { cookies } from "next/headers";
import type { createClient } from "@/lib/supabase/server";
import { DEFAULT_PREFERENCES, type Preferences } from "@/lib/session";

const YEAR = 60 * 60 * 24 * 365;

/** La app pinta el tema y el vidrio desde cookies, para no consultar el perfil en cada página. */
export async function setAppearanceCookies({ theme, glass }: Pick<Preferences, "theme" | "glass">) {
  const store = await cookies();
  store.set("fp-theme", theme, { path: "/", maxAge: YEAR, sameSite: "lax" });
  store.set("fp-glass", glass, { path: "/", maxAge: YEAR, sameSite: "lax" });
}

/**
 * Al iniciar sesión, trae del perfil el tema y el vidrio: así se aplican en un dispositivo nuevo, y en uno
 * compartido no queda lo de la persona anterior. Si el perfil no se puede leer, el ingreso sigue igual.
 */
export async function applyProfileAppearance(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data, error } = await supabase.from("profiles").select("preferences").eq("id", userId).maybeSingle();
  if (error) return;
  const { theme, glass } = { ...DEFAULT_PREFERENCES, ...((data?.preferences ?? {}) as Partial<Preferences>) };
  await setAppearanceCookies({
    theme: theme === "light" || theme === "dark" ? theme : "system",
    glass: glass === "clear" || glass === "solid" ? glass : "medium",
  });
}
