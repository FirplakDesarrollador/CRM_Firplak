import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { siteUrl, supabaseAnonKey, supabaseUrl } from "@/lib/env";

// OAuth 2.1 del servidor MCP (especificación de autorización de MCP): metadatos del recurso
// (RFC 9728) y del servidor de autorización (RFC 8414), registro dinámico (RFC 7591) y PKCE S256.

export const SCOPES = { read: "mcp:read", write: "mcp:write" } as const;
export const resourceUrl = () => `${siteUrl}/api/mcp`;

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
};

export const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { ...CORS, "Cache-Control": "no-store", ...extra } });

export const oauthError = (error: string, description: string, status = 400) => json({ error, error_description: description }, status);

export function protectedResourceMetadata() {
  return {
    resource: resourceUrl(),
    resource_name: "Firplak CRM",
    authorization_servers: [siteUrl],
    scopes_supported: Object.values(SCOPES),
    bearer_methods_supported: ["header"],
  };
}

export function authorizationServerMetadata() {
  return {
    issuer: siteUrl,
    authorization_endpoint: `${siteUrl}/oauth/authorize`,
    token_endpoint: `${siteUrl}/api/oauth/token`,
    registration_endpoint: `${siteUrl}/api/oauth/register`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: Object.values(SCOPES),
  };
}

/** Desafío PKCE S256 de un verificador: BASE64URL(SHA256(verificador)). */
export const s256 = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");
export const sha256hex = (value: string) => createHash("sha256").update(value).digest("hex");
export const randomSecret = (prefix: string) => `${prefix}${randomBytes(32).toString("base64url")}`;

export const anonClient = () =>
  createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });

/** El recurso pedido (RFC 8707), si viene, debe ser este servidor MCP. */
export function validResource(resource: string | null | undefined) {
  if (!resource) return true;
  return resource.replace(/\/$/, "") === resourceUrl();
}
