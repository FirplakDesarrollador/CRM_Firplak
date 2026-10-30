import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Bot, Check, ExternalLink } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Tr } from "@/components/ui/Tr";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/session";
import { canSystem } from "@/lib/permissions";
import { getT } from "@/lib/i18n/server";
import { SCOPES, validResource } from "@/lib/mcp/oauth";
import { approveAuthorization, denyAuthorization } from "./actions";

export const metadata: Metadata = { title: "Autorizar aplicación" };

/** Consentimiento OAuth: la persona autoriza a ChatGPT, Claude u otra aplicación a usar el CRM como ella. */
export default async function AuthorizePage({ searchParams }: PageProps<"/oauth/authorize">) {
  const [user, sp, t] = await Promise.all([requireUser(), searchParams, getT()]);
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const clientId = get("client_id");
  const redirectUri = get("redirect_uri");
  const supabase = await createClient();
  const { data } = /^[0-9a-f-]{36}$/i.test(clientId) ? await supabase.rpc("oauth_client_info", { p_client: clientId }) : { data: null };
  const client = data?.[0];

  // Sin un cliente y una redirección registrados no se puede volver a la aplicación con seguridad.
  if (!client || !client.redirect_uris.includes(redirectUri)) {
    return <Alert tone="error">{t("La solicitud de autorización no es válida: la aplicación o su dirección de regreso no están registradas.")}</Alert>;
  }
  const fail = (error: string) => {
    const url = new URL(redirectUri);
    url.searchParams.set("error", error);
    if (get("state")) url.searchParams.set("state", get("state"));
    redirect(url.toString());
  };
  if (get("response_type") !== "code") fail("unsupported_response_type");
  if (get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(get("code_challenge"))) fail("invalid_request");
  if (!validResource(get("resource"))) fail("invalid_target");

  const canUse = canSystem(user.access, "use_mcp");
  const canWrite = canSystem(user.access, "mcp_write");
  const wantsWrite = get("scope").split(" ").includes(SCOPES.write);
  const host = new URL(redirectUri).host;
  const hidden = ["client_id", "redirect_uri", "state", "code_challenge", "resource"];

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <Bot size={22} className="mt-0.5 flex-none text-[var(--brand)]" />
        <div>
          <h1 className="text-lg font-medium">{t("Autorizar")} «{client.name}»</h1>
          <p className="text-sm text-muted">
            {t("quiere usar Firplak CRM como")} <strong className="text-ink">{user.fullName}</strong>.
          </p>
        </div>
      </div>

      {!canUse ? (
        <Alert tone="warning">{t("Tu perfil no tiene activado el uso de asistentes de IA. Pídele a administración que active «Usar asistentes de IA (MCP)» en tu perfil de permisos.")}</Alert>
      ) : (
        <form action={approveAuthorization} className="space-y-4">
          {hidden.map((k) => <input key={k} type="hidden" name={k} value={get(k)} />)}
          <ul className="space-y-1.5 text-sm">
            <li className="flex gap-2"><Check size={15} className="mt-0.5 flex-none text-success" /><Tr>Verá lo mismo que tú ves en el CRM, con tus permisos.</Tr></li>
            <li className="flex gap-2"><Check size={15} className="mt-0.5 flex-none text-success" /><Tr>Cada cambio te mostrará una vista previa y pedirá tu confirmación.</Tr></li>
            <li className="flex gap-2"><Check size={15} className="mt-0.5 flex-none text-success" /><Tr>Puedes desconectarla cuando quieras en Mis preferencias → Asistentes de IA.</Tr></li>
          </ul>
          <fieldset className="space-y-1.5">
            <legend className="label"><Tr>Alcance</Tr></legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="scope" value="read" defaultChecked={!wantsWrite || !canWrite} className="accent-[var(--brand)]" /> <Tr>Solo consulta</Tr>
            </label>
            {canWrite && (
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="scope" value="write" defaultChecked={wantsWrite} className="accent-[var(--brand)]" /> <Tr>Consulta y cambios (con confirmación)</Tr>
              </label>
            )}
          </fieldset>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <ExternalLink size={13} /> {t("Después volverás a")} <code className="text-ink">{host}</code>
          </p>
          <div className="flex gap-2">
            <SubmitButton className="btn btn-primary flex-1" pendingText="Autorizando…"><Tr>Autorizar</Tr></SubmitButton>
            <button type="submit" formAction={denyAuthorization} className="btn flex-1"><Tr>Cancelar</Tr></button>
          </div>
        </form>
      )}
      {!canUse && (
        <form action={denyAuthorization}>
          {hidden.map((k) => <input key={k} type="hidden" name={k} value={get(k)} />)}
          <button type="submit" className="btn w-full"><Tr>Volver a la aplicación</Tr></button>
        </form>
      )}
    </div>
  );
}
