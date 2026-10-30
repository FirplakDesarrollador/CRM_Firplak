import { CalendarSync, LogOut, RefreshCw } from "lucide-react";
import { ActionForm, ConfirmSubmit } from "@/components/ui/ActionForm";
import { Alert } from "@/components/ui/Alert";
import { Fmt } from "@/components/ui/Fmt";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Tr } from "@/components/ui/Tr";
import { getT } from "@/lib/i18n/server";
import { hasScope, ms365Configured } from "@/lib/ms365/config";
import { getConnection, graph, type Connection } from "@/lib/ms365/graph";
import { disconnectMs365, saveMs365Settings, syncMs365Now } from "@/lib/ms365/actions";

const OPTIONS = [
  { key: "calendar_push", label: "Enviar mis reuniones del CRM a mi calendario de Outlook" },
  { key: "calendar_pull", label: "Importar reuniones de Outlook con contactos o prospectos del CRM" },
  { key: "mail_pull", label: "Registrar los correos que intercambio con contactos o prospectos del CRM" },
  { key: "send_via_outlook", label: "Enviar los correos del CRM desde mi buzón de Outlook" },
] as const;

const ERRORS: Record<string, string> = {
  config: "Microsoft 365 todavía no está configurado en el servidor.",
  denied: "Cancelaste la conexión en Microsoft.",
  state: "La conexión expiró o no coincide; inténtalo de nuevo.",
  token: "Microsoft no aceptó la conexión. Inténtalo de nuevo o avisa a administración.",
  save: "No se pudo guardar la conexión.",
};

type Option = { id: string; name: string };

/** Planes de Planner de la persona y depósitos del plan elegido (vacío si Graph falla). */
async function plannerOptions(conn: Connection): Promise<{ plans: Option[]; buckets: Option[] }> {
  try {
    const { value: plans } = await graph<{ value: { id: string; title: string }[] }>(conn, "/me/planner/plans");
    const planId = conn.settings.planner_plan_id;
    const buckets = planId ? (await graph<{ value: { id: string; name: string }[] }>(conn, `/planner/plans/${planId}/buckets`)).value : [];
    return { plans: plans.map((p) => ({ id: p.id, name: p.title })), buckets: buckets.map((b) => ({ id: b.id, name: b.name })) };
  } catch {
    return { plans: [], buckets: [] };
  }
}

/** Mis preferencias → Microsoft 365. */
export async function Ms365Settings({ userId, status }: { userId: string; status: { error?: string; connected?: boolean } }) {
  const t = await getT();
  if (!ms365Configured()) {
    return <div className="p-4"><Alert tone="info">{t("Administración debe configurar la integración con Microsoft 365 (Configuración → Microsoft 365) antes de que puedas conectar tu cuenta.")}</Alert></div>;
  }
  const conn = await getConnection(userId);
  const needsReconnect = Boolean(conn && !hasScope(conn.scopes, "Tasks.ReadWrite"));
  const planner = conn && !needsReconnect ? await plannerOptions(conn) : { plans: [], buckets: [] };

  return (
    <div className="space-y-4 p-4">
      {status.error && <Alert tone="error">{t(ERRORS[status.error] ?? ERRORS.token)}</Alert>}
      {status.connected && conn && <Alert tone="success">{t("Cuenta de Microsoft conectada.")}</Alert>}
      <div className="flex gap-3">
        <CalendarSync size={20} className="mt-0.5 flex-none text-[var(--brand)]" />
        <p className="text-sm">
          <Tr>Conecta tu cuenta de Microsoft 365 para tener tus reuniones del CRM en Outlook, registrar automáticamente las reuniones y correos con tus clientes, y enviar correos desde tu buzón.</Tr>
        </p>
      </div>
      {!conn ? (
        <a href="/api/ms365/connect" className="btn btn-primary"><Tr>Conectar con Microsoft 365</Tr></a>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-line p-4">
            <div className="min-w-48 flex-1">
              <p className="font-medium">{conn.display_name ?? conn.email}</p>
              <p className="text-xs text-muted">{conn.email}</p>
              <p className="mt-1 text-xs text-muted">
                {conn.last_sync_at ? <>{t("Última sincronización:")} <Fmt datetime={conn.last_sync_at} />{conn.last_sync_summary ? ` · ${conn.last_sync_summary}` : ""}</> : t("Aún no se ha sincronizado.")}
              </p>
            </div>
            <ActionForm action={syncMs365Now} className="flex flex-col items-end gap-1">
              <SubmitButton className="btn btn-primary btn-sm" pendingText="Sincronizando…"><RefreshCw size={14} /> <Tr>Sincronizar ahora</Tr></SubmitButton>
            </ActionForm>
            <ActionForm action={disconnectMs365} className="flex flex-col items-end gap-1">
              <ConfirmSubmit message={t("¿Desconectar tu cuenta de Microsoft? Lo ya sincronizado se conserva en el CRM.")} className="btn btn-sm btn-ghost">
                <LogOut size={14} /> <Tr>Desconectar</Tr>
              </ConfirmSubmit>
            </ActionForm>
          </div>
          {needsReconnect && (
            <Alert tone="warning">
              {t("Vuelve a conectar tu cuenta para activar Planner y los documentos de SharePoint.")}{" "}
              <a href="/api/ms365/connect" className="link font-semibold">{t("Volver a conectar")}</a>
            </Alert>
          )}
          <ActionForm action={saveMs365Settings} className="space-y-2">
            {OPTIONS.map((o) => (
              <label key={o.key} className="flex items-start gap-2 text-sm">
                <input type="checkbox" name={o.key} defaultChecked={conn.settings[o.key]} className="mt-0.5 accent-[var(--brand)]" /> {t(o.label)}
              </label>
            ))}
            <p className="text-xs text-muted"><Tr>Las reuniones del CRM llegan a tu calendario sin invitar a nadie: si quieres invitar al cliente, hazlo desde Outlook.</Tr></p>
            {!needsReconnect && (
              <fieldset className="grid gap-2 border-t border-line pt-3 sm:grid-cols-2">
                <legend className="mb-1 text-sm font-semibold"><Tr>Planner: tus tareas del CRM en un plan</Tr></legend>
                <div>
                  <label className="label" htmlFor="ms-plan"><Tr>Plan</Tr></label>
                  <select id="ms-plan" name="planner_plan" className="select" defaultValue={conn.settings.planner_plan_id ? `${conn.settings.planner_plan_id}|${conn.settings.planner_plan_name ?? ""}` : ""}>
                    <option value="">{t("Sin Planner")}</option>
                    {planner.plans.map((p) => <option key={p.id} value={`${p.id}|${p.name}`}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="ms-bucket"><Tr>Depósito</Tr></label>
                  <select id="ms-bucket" name="planner_bucket" className="select" disabled={!conn.settings.planner_plan_id}
                    defaultValue={conn.settings.planner_bucket_id ? `${conn.settings.planner_bucket_id}|${conn.settings.planner_bucket_name ?? ""}` : ""}>
                    <option value="">{t(conn.settings.planner_plan_id ? "Selecciona…" : "Primero elige el plan y guarda")}</option>
                    {planner.buckets.map((b) => <option key={b.id} value={`${b.id}|${b.name}`}>{b.name}</option>)}
                  </select>
                </div>
                <p className="text-xs text-muted sm:col-span-2"><Tr>Las tareas pendientes que tienes en el CRM se crean en ese depósito, asignadas a ti; al completarlas en Planner o en el CRM se completan en el otro.</Tr></p>
              </fieldset>
            )}
            <SubmitButton className="btn btn-sm" pendingText="…"><Tr>Guardar</Tr></SubmitButton>
          </ActionForm>
        </>
      )}
    </div>
  );
}
