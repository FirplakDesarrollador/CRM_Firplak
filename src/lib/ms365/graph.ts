import "server-only";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_SETTINGS, ms365, MS365_SCOPES, redirectUri, type Ms365Settings } from "./config";
import { decrypt, encrypt } from "./crypto";

export type Connection = {
  user_id: string; ms_user_id: string | null; email: string | null; display_name: string | null; expires_at: string; scopes: string | null;
  access_token_enc: string; refresh_token_enc: string; settings: Ms365Settings; last_sync_at: string | null; last_sync_summary: string | null;
};

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number; scope?: string };

/** Pide tokens a Entra ID (canje de código o renovación). */
export async function requestToken(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${ms365.loginUrl}/${ms365.tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: ms365.clientId, client_secret: ms365.clientSecret, redirect_uri: redirectUri(), scope: MS365_SCOPES.join(" "), ...params }),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse & { error_description?: string };
  if (!res.ok || !json.access_token) throw new Error(json.error_description ?? `Microsoft respondió ${res.status}`);
  return json;
}

export async function getConnection(userId: string): Promise<Connection | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("ms365_connections").select("*").eq("user_id", userId).maybeSingle();
  if (!data) return null;
  return { ...(data as unknown as Connection), settings: { ...DEFAULT_SETTINGS, ...((data.settings ?? {}) as Partial<Ms365Settings>) } };
}

/** Token de acceso vigente; si vence en menos de 2 minutos, lo renueva y lo guarda. */
async function accessToken(conn: Connection) {
  if (new Date(conn.expires_at).getTime() > Date.now() + 120_000) return decrypt(conn.access_token_enc);
  const t = await requestToken({ grant_type: "refresh_token", refresh_token: decrypt(conn.refresh_token_enc) });
  const patch = {
    access_token_enc: encrypt(t.access_token),
    refresh_token_enc: t.refresh_token ? encrypt(t.refresh_token) : conn.refresh_token_enc,
    expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
  };
  const supabase = await createClient();
  await supabase.from("ms365_connections").update(patch).eq("user_id", conn.user_id);
  Object.assign(conn, patch);
  return t.access_token;
}

export class GraphError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/**
 * Llamada a Microsoft Graph como la persona conectada. `raw` envía bytes (subida de archivos);
 * `body` se envía como JSON.
 */
export async function graph<T = unknown>(conn: Connection, path: string, init: {
  method?: string; body?: unknown; raw?: ArrayBuffer; contentType?: string; headers?: Record<string, string>;
} = {}): Promise<T> {
  const res = await fetch(path.startsWith("http") ? path : `${ms365.graphUrl}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${await accessToken(conn)}`,
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(init.raw ? { "Content-Type": init.contentType ?? "application/octet-stream" } : {}),
      Prefer: 'outlook.timezone="UTC"',
      ...init.headers,
    },
    body: init.raw ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
  });
  if (res.status === 204 || res.status === 202) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new GraphError(res.status, (json as { error?: { message?: string } }).error?.message ?? `Microsoft Graph respondió ${res.status}`);
  return json as T;
}
