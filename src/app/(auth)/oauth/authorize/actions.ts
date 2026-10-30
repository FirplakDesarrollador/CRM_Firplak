"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/session";
import { canSystem } from "@/lib/permissions";
import { siteUrl } from "@/lib/env";
import { randomSecret, sha256hex, validResource } from "@/lib/mcp/oauth";

const back = (redirectUri: string, params: Record<string, string>) => {
  const url = new URL(redirectUri);
  Object.entries(params).forEach(([k, v]) => v && url.searchParams.set(k, v));
  url.searchParams.set("iss", siteUrl);
  return url.toString();
};

/** La persona autoriza la aplicación: código de un solo uso y vuelta a la aplicación. */
export async function approveAuthorization(fd: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const clientId = String(fd.get("client_id") ?? "");
  const redirectUri = String(fd.get("redirect_uri") ?? "");
  const state = String(fd.get("state") ?? "");
  const resource = String(fd.get("resource") ?? "");
  const scope = fd.get("scope") === "write" && canSystem(user.access, "mcp_write") ? "write" : "read";
  if (!validResource(resource)) redirect(back(redirectUri, { error: "invalid_target", state }));

  const code = randomSecret("fcrc_");
  const supabase = await createClient();
  const { error } = await supabase.rpc("oauth_create_code", {
    p_client: clientId, p_redirect_uri: redirectUri, p_code_challenge: String(fd.get("code_challenge") ?? ""),
    p_scope: scope, p_resource: resource, p_code_hash: sha256hex(code),
  });
  // Si el cliente o la redirección no son válidos no se redirige a ninguna parte.
  if (error?.message.includes("invalid_client")) redirect("/inicio");
  if (error) redirect(back(redirectUri, { error: error.message.includes("access_denied") ? "access_denied" : "invalid_request", state }));
  redirect(back(redirectUri, { code, state }));
}

export async function denyAuthorization(fd: FormData) {
  const clientId = String(fd.get("client_id") ?? "");
  const redirectUri = String(fd.get("redirect_uri") ?? "");
  const supabase = await createClient();
  const { data } = await supabase.rpc("oauth_client_info", { p_client: clientId });
  // Solo se vuelve a una redirección registrada por la aplicación.
  if (!data?.[0]?.redirect_uris.includes(redirectUri)) redirect("/inicio");
  redirect(back(redirectUri, { error: "access_denied", state: String(fd.get("state") ?? "") }));
}
