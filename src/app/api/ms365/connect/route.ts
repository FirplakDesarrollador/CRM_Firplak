import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { siteUrl } from "@/lib/env";
import { s256 } from "@/lib/mcp/oauth";
import { ms365, MS365_SCOPES, ms365Configured, redirectUri } from "@/lib/ms365/config";

// Inicia la conexión de la cuenta de Microsoft 365 (código de autorización con PKCE).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!ms365Configured()) redirect("/preferencias?tab=microsoft&error=config");
  const state = randomBytes(16).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  (await cookies()).set("ms365_oauth", JSON.stringify({ state, verifier, user: user.id }), {
    httpOnly: true, sameSite: "lax", secure: siteUrl.startsWith("https"), path: "/api/ms365", maxAge: 600,
  });
  const url = new URL(`${ms365.loginUrl}/${ms365.tenant}/oauth2/v2.0/authorize`);
  Object.entries({
    client_id: ms365.clientId, response_type: "code", redirect_uri: redirectUri(), response_mode: "query",
    scope: MS365_SCOPES.join(" "), state, code_challenge: s256(verifier), code_challenge_method: "S256", prompt: "select_account",
  }).forEach(([k, v]) => url.searchParams.set(k, v));
  redirect(url.toString());
}
