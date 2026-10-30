import { Search } from "lucide-react";
import { ActionForm } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Tr } from "@/components/ui/Tr";
import { getT } from "@/lib/i18n/server";
import { hasScope } from "@/lib/ms365/config";
import { getConnection } from "@/lib/ms365/graph";
import { getSharePointSettings, listDrives, searchSites } from "@/lib/ms365/sharepoint";
import { saveSharePointSite } from "@/lib/ms365/actions";

/** Configuración → Microsoft 365: sitio y biblioteca de SharePoint para los documentos del CRM. */
export async function SharePointPicker({ userId, query }: { userId: string; query: string }) {
  const t = await getT();
  const [current, conn] = await Promise.all([getSharePointSettings(), getConnection(userId)]);
  const canSearch = Boolean(conn && hasScope(conn.scopes, "Sites.Read.All"));
  let results: { id: string; displayName: string; webUrl: string; drives: { id: string; name: string }[] }[] = [];
  let error: string | null = null;
  if (canSearch && query) {
    try {
      const sites = (await searchSites(conn!, query)).slice(0, 5);
      results = await Promise.all(sites.map(async (s) => ({ ...s, drives: await listDrives(conn!, s.id).catch(() => []) })));
    } catch (e) {
      error = (e as Error).message;
    }
  }

  return (
    <section className="card space-y-3 p-4">
      <h2 className="card-title"><Tr>Documentos en SharePoint</Tr></h2>
      <p className="text-sm">
        {current
          ? <>{t("Biblioteca actual:")} <strong>{current.site_name}</strong> → <strong>{current.drive_name}</strong>. {t("Las carpetas se crean en CRM/Cuentas y CRM/Oportunidades.")}</>
          : t("Aún no se ha elegido la biblioteca: las cuentas y oportunidades no pueden tener carpeta de documentos.")}
      </p>
      {!canSearch ? (
        <p className="text-xs text-muted"><Tr>Para buscar el sitio, conecta (o vuelve a conectar) tu cuenta en Mis preferencias → Microsoft 365.</Tr></p>
      ) : (
        <>
          <form className="flex flex-wrap gap-2" action="/configuracion/microsoft-365">
            <input name="sitio" defaultValue={query} className="input min-w-60 flex-1" placeholder={t("Buscar sitio (p. ej. Comercial)")} />
            <button className="btn"><Search size={14} /> <Tr>Buscar</Tr></button>
          </form>
          {error && <p className="text-sm text-danger">{error}</p>}
          {query && !error && !results.length && <p className="text-sm text-muted"><Tr>No se encontraron sitios.</Tr></p>}
          <ul className="space-y-2">
            {results.map((s) => (
              <li key={s.id} className="rounded-[10px] border border-line p-3">
                <p className="font-medium">{s.displayName} <span className="text-xs text-muted">{s.webUrl}</span></p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {s.drives.map((d) => (
                    <ActionForm key={d.id} action={saveSharePointSite} className="flex flex-col items-start">
                      {Object.entries({ site_id: s.id, site_name: s.displayName, site_url: s.webUrl, drive_id: d.id, drive_name: d.name }).map(([k, v]) => (
                        <input key={k} type="hidden" name={k} value={v} />
                      ))}
                      <SubmitButton className="btn btn-sm" pendingText="…">{t("Usar")} «{d.name}»</SubmitButton>
                    </ActionForm>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
