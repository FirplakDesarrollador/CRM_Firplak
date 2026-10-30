"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/session";
import { canSystem } from "@/lib/permissions";
import type { FormState } from "@/lib/records/form";
import { newToken } from "./auth";

export type TokenState = FormState & { token?: string };

const DAYS: Record<string, number | null> = { "30": 30, "90": 90, "365": 365, never: null };

/** Crea un token MCP propio; el valor se devuelve una sola vez. */
export async function createMcpToken(_prev: TokenState, fd: FormData): Promise<TokenState> {
  const user = await getCurrentUser();
  if (!user) return { message: "Sesión expirada" };
  if (!canSystem(user.access, "use_mcp")) return { message: "Tu perfil no tiene permiso para usar asistentes de IA." };
  const name = String(fd.get("name") ?? "").trim();
  if (!name) return { message: "Ponle un nombre al token (p. ej. «Claude en mi portátil»)." };
  const scope = fd.get("scope") === "write" && canSystem(user.access, "mcp_write") ? "write" : "read";
  const days = DAYS[String(fd.get("expires"))] ?? 90;
  const { raw, hash, prefix } = newToken();
  const supabase = await createClient();
  const { error } = await supabase.from("mcp_tokens").insert({
    user_id: user.id, name, scope, token_hash: hash, token_prefix: prefix,
    expires_at: days ? new Date(Date.now() + days * 86400000).toISOString() : null,
  });
  if (error) return { message: error.message.includes("row-level security") ? "No tienes permiso para crear este token." : error.message };
  revalidatePath("/preferencias");
  return { ok: true, message: "Token creado. Cópialo ahora: no se volverá a mostrar.", token: raw };
}

export async function revokeMcpToken(id: string, path: string): Promise<FormState> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("mcp_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id).is("revoked_at", null).select("id");
  if (error) return { message: error.message };
  if (!data?.length) return { message: "No puedes revocar este token." };
  revalidatePath(path);
  return { ok: true, message: "Token revocado" };
}

/** Desconecta una aplicación OAuth (ChatGPT, Claude web…): revoca todos sus tokens. */
export async function revokeOauthGrant(id: string, path: string): Promise<FormState> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("oauth_grants").update({ revoked_at: new Date().toISOString() }).eq("id", id).is("revoked_at", null).select("id");
  if (error) return { message: error.message };
  if (!data?.length) return { message: "No puedes desconectar esta aplicación." };
  revalidatePath(path);
  return { ok: true, message: "Aplicación desconectada" };
}
