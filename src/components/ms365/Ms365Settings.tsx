import { CalendarSync, LogOut, RefreshCw } from "lucide-react";
import { ActionForm, ConfirmSubmit } from "@/components/ui/ActionForm";
import { Alert } from "@/components/ui/Alert";
import { Fmt } from "@/components/ui/Fmt";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Tr } from "@/components/ui/Tr";
import { getT } from "@/lib/i18n/server";
import { ms365Configured } from "@/lib/ms365/config";
import { getConnection } from "@/lib/ms365/graph";
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

/** Mis preferencias → Microsoft 365. */
export async function Ms365Settings({ userId, status }: { userId: string; status: { error?: string; connected?: boolean } }) {
  const t = await getT();
  if (!ms365Configured()) {
    return <div className="p-4"><Alert tone="info">{t("Administración debe configurar la integración con Microsoft 365 (Configuración → Microsoft 365) antes de que puedas conectar tu cuenta.")}</Alert></div>;
  }
  const conn = await getConnection(userId);

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
          <ActionForm action={saveMs365Settings} className="space-y-2">
            {OPTIONS.map((o) => (
              <label key={o.key} className="flex items-start gap-2 text-sm">
                <input type="checkbox" name={o.key} defaultChecked={conn.settings[o.key]} className="mt-0.5 accent-[var(--brand)]" /> {t(o.label)}
              </label>
            ))}
            <p className="text-xs text-muted"><Tr>Las reuniones del CRM llegan a tu calendario sin invitar a nadie: si quieres invitar al cliente, hazlo desde Outlook.</Tr></p>
            <SubmitButton className="btn btn-sm" pendingText="…"><Tr>Guardar</Tr></SubmitButton>
          </ActionForm>
        </>
      )}
    </div>
  );
}
