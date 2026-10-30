import { CORS, anonClient, json, oauthError } from "@/lib/mcp/oauth";

// Registro dinámico de clientes (RFC 7591). Todos son clientes públicos con PKCE.
export async function POST(request: Request) {
  let body: { redirect_uris?: unknown; client_name?: unknown };
  try {
    body = await request.json();
  } catch {
    return oauthError("invalid_client_metadata", "El cuerpo debe ser JSON");
  }
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (!uris.length) return oauthError("invalid_redirect_uri", "Falta redirect_uris");
  const name = typeof body.client_name === "string" ? body.client_name : "Aplicación";
  const { data, error } = await anonClient().rpc("oauth_register_client", { p_name: name, p_redirect_uris: uris });
  if (error || !data) {
    return oauthError("invalid_redirect_uri", "Las direcciones de redirección deben ser https o de localhost");
  }
  return json({
    client_id: data,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: name.slice(0, 100),
    redirect_uris: uris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  }, 201);
}

export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });
