import { newToken } from "@/lib/mcp/auth";
import { CORS, SCOPES, anonClient, json, oauthError, randomSecret, s256, sha256hex } from "@/lib/mcp/oauth";

// Punto de tokens: canje del código (con PKCE) y renovación con rotación del token de refresco.
async function params(request: Request) {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) return new URLSearchParams(Object.entries(await request.json()).map(([k, v]) => [k, String(v)]));
  return new URLSearchParams(await request.text());
}

export async function POST(request: Request) {
  let p: URLSearchParams;
  try {
    p = await params(request);
  } catch {
    return oauthError("invalid_request", "Cuerpo no válido");
  }
  const clientId = p.get("client_id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) return oauthError("invalid_client", "Falta client_id", 401);

  const access = newToken();
  const refresh = randomSecret("fcrr_");
  const db = anonClient();
  const grantType = p.get("grant_type");

  let result: { scope: string; expires_in: number } | undefined;
  if (grantType === "authorization_code") {
    const verifier = p.get("code_verifier") ?? "";
    if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return oauthError("invalid_request", "Falta code_verifier (PKCE)");
    const { data, error } = await db.rpc("oauth_exchange_code", {
      p_code_hash: sha256hex(p.get("code") ?? ""), p_client: clientId, p_redirect_uri: p.get("redirect_uri") ?? "",
      p_challenge: s256(verifier), p_access_hash: access.hash, p_access_prefix: access.prefix, p_refresh_hash: sha256hex(refresh),
    });
    if (error || !data?.length) {
      if (error && !error.message.includes("invalid_grant")) console.error("OAuth: canje de código", error.message);
      return oauthError("invalid_grant", "Código no válido, vencido o ya usado");
    }
    result = data[0];
  } else if (grantType === "refresh_token") {
    const { data, error } = await db.rpc("oauth_refresh", {
      p_refresh_hash: sha256hex(p.get("refresh_token") ?? ""), p_client: clientId,
      p_access_hash: access.hash, p_access_prefix: access.prefix, p_new_refresh_hash: sha256hex(refresh),
    });
    if (error || !data?.length) {
      if (error) console.error("OAuth: refresco", error.message);
      return oauthError("invalid_grant", "Token de refresco no válido, vencido o revocado");
    }
    result = data[0];
  } else {
    return oauthError("unsupported_grant_type", "Solo authorization_code y refresh_token");
  }

  return json({
    access_token: access.raw,
    token_type: "Bearer",
    expires_in: result.expires_in,
    refresh_token: refresh,
    scope: result.scope === "write" ? `${SCOPES.read} ${SCOPES.write}` : SCOPES.read,
  });
}

export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });
