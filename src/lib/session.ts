import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient, mcpSession } from "@/lib/supabase/server";
import type { Access, PermissionMap } from "@/lib/permissions";
import { hasSupabaseEnv } from "@/lib/env";

export type Preferences = {
  theme: "light" | "dark" | "system";
  language: "es" | "en";
  home_page: string;
  density: "comfortable" | "compact";
  page_size: number;
};

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "system",
  language: "es",
  home_page: "/inicio",
  density: "comfortable",
  page_size: 25,
};

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  title: string | null;
  phone: string | null;
  roleId: string | null;
  roleName: string | null;
  isActive: boolean;
  preferences: Preferences;
  access: Access;
};

/** Usuario autenticado + perfil + permisos. Se memoriza por petición. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  if (!hasSupabaseEnv()) return null;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims(mcpSession.getStore()?.accessToken);
  const userId = claims?.claims?.sub;
  if (!userId) return null;

  const [{ data: profile }, { data: perms }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, title, phone, role_id, is_active, preferences, role:roles!profiles_role_id_fkey(name)")
      .eq("id", userId)
      .maybeSingle(),
    supabase.rpc("my_permissions"),
  ]);
  if (!profile) return null;

  const p = (perms ?? {}) as { is_admin?: boolean; profile?: string | null; permissions?: PermissionMap };
  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name || profile.email,
    title: profile.title,
    phone: profile.phone,
    roleId: profile.role_id,
    roleName: profile.role?.name ?? null,
    isActive: profile.is_active,
    preferences: { ...DEFAULT_PREFERENCES, ...((profile.preferences ?? {}) as Partial<Preferences>) },
    access: { isAdmin: Boolean(p.is_admin), profile: p.profile ?? null, permissions: p.permissions ?? {} },
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
