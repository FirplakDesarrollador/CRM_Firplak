import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckCircle2, Send, Trash2, XCircle } from "lucide-react";
import { ActionForm, ConfirmSubmit } from "@/components/ui/ActionForm";
import { Fmt } from "@/components/ui/Fmt";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Tr } from "@/components/ui/Tr";
import { createClient } from "@/lib/supabase/server";
import { hasServiceRole } from "@/lib/supabase/admin";
import { canSystem } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { getT } from "@/lib/i18n/server";
import { ms365, MS365_SCOPES, ms365Configured, redirectUri } from "@/lib/ms365/config";
import { deleteTeamsChannel, saveTeamsChannel, testTeamsChannel } from "@/lib/ms365/actions";
import { SharePointPicker } from "@/components/ms365/SharePointPicker";

export const metadata: Metadata = { title: "Microsoft 365" };

/** Administración: estado de la integración, canales de Teams y personas conectadas. */
export default async function Ms365AdminPage({ searchParams }: PageProps<"/configuracion/microsoft-365">) {
  const [me, t, sp] = await Promise.all([requireUser(), getT(), searchParams]);
  if (!canSystem(me.access, "customize")) redirect("/configuracion");
  const supabase = await createClient();
  const [{ data: channels }, { data: connections }] = await Promise.all([
    supabase.from("teams_channels").select("id, name, created_at").order("name"),
    supabase.from("ms365_connections").select("user_id, email, connected_at, last_sync_at, user:profiles!ms365_connections_user_id_fkey(full_name)").order("connected_at"),
  ]);
  const checks = [
    { ok: Boolean(ms365.tenant && ms365.clientId), label: "ID de inquilino y de aplicación (MS365_TENANT_ID, MS365_CLIENT_ID)" },
    { ok: Boolean(ms365.clientSecret), label: "Secreto de la aplicación (MS365_CLIENT_SECRET)" },
    { ok: Boolean(ms365.encryptionKey), label: "Clave para cifrar los tokens (MS365_ENCRYPTION_KEY)" },
    { ok: hasServiceRole(), label: "Clave service_role (para publicar en Teams sin exponer los webhooks)" },
  ];

  return (
    <>
      <div>
        <h1 className="text-xl font-medium"><Tr>Microsoft 365</Tr></h1>
        <p className="text-sm text-muted"><Tr>Outlook (calendario y correo) por persona, y avisos de las automatizaciones en canales de Teams.</Tr></p>
      </div>

      <section className="card space-y-3 p-4">
        <h2 className="card-title"><Tr>Configuración del servidor</Tr> {ms365Configured() ? <span className="badge badge-success"><Tr>Lista</Tr></span> : <span className="badge badge-warning"><Tr>Pendiente</Tr></span>}</h2>
        <ul className="space-y-1 text-sm">
          {checks.map((c) => (
            <li key={c.label} className="flex items-center gap-2">
              {c.ok ? <CheckCircle2 size={15} className="text-success" /> : <XCircle size={15} className="text-danger" />} {t(c.label)}
            </li>
          ))}
        </ul>
        <div className="space-y-1 text-xs text-muted">
          <p>{t("Al registrar la aplicación en Entra ID, usa esta dirección de redirección (web):")} <code className="text-ink">{redirectUri()}</code></p>
          <p>{t("Permisos delegados de Microsoft Graph:")} <code className="text-ink">{MS365_SCOPES.filter((s) => s.includes(".")).join(", ")}</code></p>
          <p>{t("Pasos completos en docs/puesta-en-produccion.md.")}</p>
        </div>
      </section>

      <SharePointPicker userId={me.id} query={typeof sp.sitio === "string" ? sp.sitio.trim() : ""} />

      <section className="card overflow-hidden">
        <div className="card-header"><h2 className="card-title"><Tr>Canales de Teams</Tr> <span className="badge">{channels?.length ?? 0}</span></h2></div>
        <p className="px-4 pt-3 text-xs text-muted">
          <Tr>En el canal de Teams: … → Flujos de trabajo → «Publicar en un canal cuando se recibe una solicitud de webhook». Copia la dirección que te da y pégala aquí. Luego usa la acción «Publicar en Teams» en Automatizaciones.</Tr>
        </p>
        <ul className="divide-y divide-[var(--border)]">
          {(channels ?? []).map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
              <span className="min-w-40 flex-1 font-medium">{c.name}</span>
              <ActionForm action={testTeamsChannel.bind(null, c.id)} className="flex flex-col items-end">
                <SubmitButton className="btn btn-sm" pendingText="…"><Send size={14} /> <Tr>Probar</Tr></SubmitButton>
              </ActionForm>
              <ActionForm action={deleteTeamsChannel.bind(null, c.id)} className="flex flex-col items-end">
                <ConfirmSubmit message={t("¿Eliminar este canal? Las automatizaciones que lo usan dejarán de publicar.")} className="btn btn-sm btn-ghost">
                  <Trash2 size={14} /><span className="sr-only"><Tr>Eliminar</Tr></span>
                </ConfirmSubmit>
              </ActionForm>
            </li>
          ))}
        </ul>
        <ActionForm action={saveTeamsChannel} resetOnSuccess className="grid items-end gap-2 border-t border-line bg-surface-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
          <div><label className="label" htmlFor="tc-name"><Tr>Canal</Tr></label><input id="tc-name" name="name" className="input" placeholder={t("Ej. Ventas · Proyectos")} /></div>
          <div><label className="label" htmlFor="tc-url"><Tr>Dirección del webhook</Tr></label><input id="tc-url" name="webhook_url" className="input" placeholder="https://…" /></div>
          <SubmitButton className="btn btn-primary mb-px" pendingText="…"><Tr>Agregar</Tr></SubmitButton>
        </ActionForm>
      </section>

      <section className="card overflow-hidden">
        <div className="card-header"><h2 className="card-title"><Tr>Personas conectadas</Tr> <span className="badge">{connections?.length ?? 0}</span></h2></div>
        {!connections?.length ? <p className="px-4 py-6 text-sm text-muted"><Tr>Nadie ha conectado su cuenta todavía (Mis preferencias → Microsoft 365).</Tr></p> : (
          <table className="table">
            <thead><tr><th><Tr>Usuario</Tr></th><th><Tr>Cuenta de Microsoft</Tr></th><th><Tr>Conectada</Tr></th><th><Tr>Última sincronización</Tr></th></tr></thead>
            <tbody>
              {connections.map((c) => (
                <tr key={c.user_id}>
                  <td>{c.user?.full_name ?? "—"}</td>
                  <td>{c.email ?? "—"}</td>
                  <td className="whitespace-nowrap"><Fmt datetime={c.connected_at} /></td>
                  <td className="whitespace-nowrap">{c.last_sync_at ? <Fmt datetime={c.last_sync_at} /> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
