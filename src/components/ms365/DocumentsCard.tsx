import { ExternalLink, FileText, Folder, FolderPlus, Upload } from "lucide-react";
import { ActionForm } from "@/components/ui/ActionForm";
import { Fmt } from "@/components/ui/Fmt";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Tr } from "@/components/ui/Tr";
import { getT } from "@/lib/i18n/server";
import { hasScope, ms365Configured } from "@/lib/ms365/config";
import { getConnection } from "@/lib/ms365/graph";
import { getRecordFolder, getSharePointSettings, listFolder, type DriveItem, type FOLDER_BY_OBJECT } from "@/lib/ms365/sharepoint";
import { createFolderForRecord, uploadDocument } from "@/lib/ms365/actions";

const size = (n?: number) => (n === undefined ? "" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** Documentos del registro en su carpeta de SharePoint. */
export async function DocumentsCard({ object, recordId, recordName, userId }: {
  object: keyof typeof FOLDER_BY_OBJECT; recordId: string; recordName: string; userId: string;
}) {
  const t = await getT();
  if (!ms365Configured()) {
    return <section className="card p-4 text-sm text-muted"><Tr>Los documentos se guardan en SharePoint: administración debe configurar Microsoft 365.</Tr></section>;
  }
  const [sp, folder, conn] = await Promise.all([getSharePointSettings(), getRecordFolder(object, recordId), getConnection(userId)]);
  const connected = Boolean(conn && hasScope(conn.scopes, "Files.ReadWrite.All"));
  let files: DriveItem[] | null = null;
  let error: string | null = null;
  if (folder && connected) {
    try {
      files = await listFolder(conn!, folder.drive_id, folder.item_id);
    } catch (e) {
      error = (e as Error).message;
    }
  }

  return (
    <section className="card overflow-hidden">
      <div className="card-header flex-wrap gap-2">
        <h2 className="card-title"><Folder size={16} /> <Tr>Documentos</Tr></h2>
        {folder?.web_url && <a href={folder.web_url} target="_blank" rel="noreferrer" className="btn btn-sm"><ExternalLink size={14} /> <Tr>Abrir en SharePoint</Tr></a>}
      </div>
      {!sp ? (
        <p className="px-4 py-4 text-sm text-muted"><Tr>Administración todavía no eligió la biblioteca de SharePoint (Configuración → Microsoft 365).</Tr></p>
      ) : !folder ? (
        <div className="space-y-2 px-4 py-4 text-sm">
          <p className="text-muted">{t("Este registro aún no tiene carpeta. Se creará en")} <code>{sp.drive_name}/CRM/{object === "accounts" ? "Cuentas" : "Oportunidades"}</code>.</p>
          {connected ? (
            <ActionForm action={createFolderForRecord.bind(null, object, recordId, recordName)} className="flex flex-col items-start gap-1">
              <SubmitButton className="btn btn-primary btn-sm" pendingText="Creando…"><FolderPlus size={14} /> <Tr>Crear carpeta en SharePoint</Tr></SubmitButton>
            </ActionForm>
          ) : (
            <p className="text-xs text-muted"><Tr>Conecta tu cuenta de Microsoft 365 en Mis preferencias para crear la carpeta.</Tr></p>
          )}
        </div>
      ) : (
        <>
          {!connected && <p className="px-4 py-3 text-sm text-muted"><Tr>Conecta tu cuenta de Microsoft 365 en Mis preferencias para ver y subir archivos aquí.</Tr></p>}
          {error && <p className="px-4 py-3 text-sm text-danger">{error}</p>}
          {files && (
            files.length === 0 ? <p className="px-4 py-4 text-sm text-muted"><Tr>La carpeta está vacía.</Tr></p> : (
              <ul className="divide-y divide-[var(--border)]">
                {files.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
                    {f.folder ? <Folder size={15} className="text-muted" /> : <FileText size={15} className="text-muted" />}
                    <a href={f.webUrl} target="_blank" rel="noreferrer" className="link min-w-0 flex-1 truncate">{f.name}</a>
                    <span className="text-xs text-muted">{size(f.size)}</span>
                    {f.lastModifiedDateTime && <span className="text-xs text-muted"><Fmt datetime={f.lastModifiedDateTime} /></span>}
                  </li>
                ))}
              </ul>
            )
          )}
          {connected && (
            <ActionForm action={uploadDocument.bind(null, object, recordId)} resetOnSuccess
              className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-2 px-4 py-3">
              <input type="file" name="file" className="min-w-0 flex-1 text-sm" aria-label={t("Archivo")} />
              <SubmitButton className="btn btn-sm" pendingText="Subiendo…"><Upload size={14} /> <Tr>Subir (máx. 4 MB)</Tr></SubmitButton>
            </ActionForm>
          )}
        </>
      )}
    </section>
  );
}
