import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const TOKEN_PREFIX = "fcrm_";

export type McpIdentity = { tokenId: string; userId: string; email: string; scope: "read" | "write"; accessToken: string };

export const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

/** Token nuevo: el valor se muestra una sola vez; en la base solo queda el hash. */
export function newToken() {
  const raw = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { raw, hash: hashToken(raw), prefix: raw.slice(0, 12) };
}

/** ¿Hay forma de abrir sesión como el dueño del token? */
export function mcpConfigured() {
  return Boolean(process.env.SUPABASE_JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY);
}

const anonClient = () =>
  createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });

// Sesiones por token, reutilizadas mientras falten más de 2 minutos para vencer.
const sessions = new Map<string, { accessToken: string; expiresAt: number }>();

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");

/**
 * JWT de corta duración para el dueño del token. Con SUPABASE_JWT_SECRET se firma aquí
 * (HS256, como Supabase); si no, se usa la clave service_role para abrir una sesión normal
 * con un enlace mágico generado en el servidor (no se envía ningún correo).
 */
async function sessionFor(tokenId: string, userId: string, email: string): Promise<string | null> {
  const cached = sessions.get(tokenId);
  if (cached && cached.expiresAt > Date.now() + 120_000) return cached.accessToken;

  const secret = process.env.SUPABASE_JWT_SECRET;
  if (secret) {
    const now = Math.floor(Date.now() / 1000);
    const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({
      sub: userId, email, role: "authenticated", aud: "authenticated", iat: now, exp: now + 900, iss: `${supabaseUrl}/auth/v1`,
    })}`;
    const accessToken = `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
    sessions.set(tokenId, { accessToken, expiresAt: (now + 900) * 1000 });
    return accessToken;
  }

  const admin = createAdminClient();
  if (!admin) return null;
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !link.properties?.hashed_token) return null;
  const { data } = await anonClient().auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (!data.session) return null;
  sessions.set(tokenId, { accessToken: data.session.access_token, expiresAt: (data.session.expires_at ?? 0) * 1000 });
  return data.session.access_token;
}

/** Valida el token del encabezado Authorization y devuelve la identidad con su sesión. */
export async function resolveToken(raw: string): Promise<McpIdentity | { error: string; status: number }> {
  if (!raw.startsWith(TOKEN_PREFIX)) return { error: "Token no válido", status: 401 };
  const { data } = await anonClient().rpc("mcp_resolve_token", { p_hash: hashToken(raw) });
  const row = data?.[0];
  if (!row) return { error: "Token no válido, vencido, revocado o sin permiso para usar asistentes de IA", status: 401 };
  if (!mcpConfigured()) {
    return { error: "El servidor MCP no está configurado: falta SUPABASE_JWT_SECRET o SUPABASE_SERVICE_ROLE_KEY", status: 503 };
  }
  const accessToken = await sessionFor(row.token_id, row.user_id, row.email);
  if (!accessToken) return { error: "No se pudo abrir la sesión del usuario del token", status: 503 };
  return { tokenId: row.token_id, userId: row.user_id, email: row.email, scope: row.scope === "write" ? "write" : "read", accessToken };
}
