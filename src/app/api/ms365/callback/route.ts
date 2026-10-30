import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { ms365, MS365_SCOPES } from "@/lib/ms365/config";
import { encrypt } from "@/lib/ms365/crypto";
import { requestToken } from "@/lib/ms365/graph";

const back = (status: string) => redirect(`/preferencias?tab=microsoft&${status}`);

// Regreso de Microsoft: canjea el código, identifica la cuenta y guarda los tokens cifrados.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const params = new URL(request.url).searchParams;
  const store = await cookies();
  const saved = JSON.parse(store.get("ms365_oauth")?.value ?? "{}") as { state?: string; verifier?: string; user?: string };
  store.delete({ name: "ms365_oauth", path: "/api/ms365" });
  if (params.get("error")) back("error=denied");
  if (!saved.state || saved.state !== params.get("state") || saved.user !== user.id || !saved.verifier) back("error=state");

  let token;
  try {
    token = await requestToken({ grant_type: "authorization_code", code: params.get("code") ?? "", code_verifier: saved.verifier! });
  } catch (e) {
    console.error("Microsoft 365: canje de código", (e as Error).message);
    back("error=token");
  }
  const me = await fetch(`${ms365.graphUrl}/me?$select=id,displayName,mail,userPrincipalName`, {
    headers: { Authorization: `Bearer ${token!.access_token}` },
  }).then((r) => r.json()).catch(() => ({})) as { id?: string; displayName?: string; mail?: string; userPrincipalName?: string };

  const supabase = await createClient();
  const { error } = await supabase.from("ms365_connections").upsert({
    user_id: user.id,
    ms_user_id: me.id ?? null,
    email: me.mail ?? me.userPrincipalName ?? null,
    display_name: me.displayName ?? null,
    access_token_enc: encrypt(token!.access_token),
    refresh_token_enc: encrypt(token!.refresh_token ?? ""),
    expires_at: new Date(Date.now() + token!.expires_in * 1000).toISOString(),
    scopes: token!.scope ?? MS365_SCOPES.join(" "),
    connected_at: new Date().toISOString(),
  });
  if (error) back("error=save");
  back("conectado=1");
}
