"use client";

import { useActionState } from "react";
import { Download, Eye } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { previewSapImport, runSapImport, type ImportState } from "@/lib/sap/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";

type Field = { api_name: string; label: string };

/** Importación de productos desde SAP: filtro, mapeo de campos personalizados, vista previa e importar. */
export function SapImportPanel({ fields, prefix, salesOnly, mappings }: {
  fields: Field[]; prefix: string; salesOnly: boolean; mappings: { field: string; sap_field: string }[];
}) {
  const t = useT();
  const [preview, previewAction] = useActionState<ImportState, FormData>(previewSapImport, {});
  const [result, importAction] = useActionState<ImportState, FormData>(runSapImport, {});
  const mapped = new Map(mappings.map((m) => [m.field, m.sap_field]));

  return (
    <div className="space-y-4">
      <form action={previewAction} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div>
            <label className="label" htmlFor="sap-prefix">{t("Solo códigos que empiezan por (opcional)")}</label>
            <input id="sap-prefix" name="prefix" defaultValue={prefix} className="input" placeholder={t("Ej. MB-")} />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm font-semibold">
            <input type="checkbox" name="sales_only" defaultChecked={salesOnly} className="accent-[var(--brand)]" /> {t("Solo artículos de venta")}
          </label>
        </div>
        <div>
          <p className="label">{t("Campos que se importan")}</p>
          <ul className="space-y-1.5 text-sm">
            <li className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2"><span>{t("Referencia")}</span><code className="text-muted">ItemCode</code></li>
            <li className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2"><span>{t("Nombre del producto")}</span><code className="text-muted">ItemName</code></li>
            {fields.map((f) => (
              <li key={f.api_name} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
                <label htmlFor={`map-${f.api_name}`}>{f.label}</label>
                <input type="hidden" name="map_field" value={f.api_name} />
                <input id={`map-${f.api_name}`} name="map_sap_field" defaultValue={mapped.get(f.api_name) ?? ""} className="input h-8" placeholder={t("Campo de SAP (p. ej. U_Linea) o vacío")} />
              </li>
            ))}
          </ul>
          {fields.length === 0 && <p className="mt-1 text-xs text-muted">{t("Para traer más datos de SAP, crea campos personalizados de Productos en Configuración → Campos personalizados y relaciónalos aquí con su campo de SAP.")}</p>}
        </div>
        <SubmitButton className="btn" pendingText="Consultando SAP…"><Eye size={14} /> {t("Guardar y ver vista previa")}</SubmitButton>
        {preview.message && <p role="status" className={`text-xs font-semibold ${preview.ok ? "text-success" : "text-danger"}`}>{t(preview.message)}</p>}
      </form>

      {preview.preview && preview.preview.length > 0 && (
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr>{preview.columns!.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>
              {preview.preview.map((r) => (
                <tr key={String(r.ItemCode)}>{preview.columns!.map((c) => <td key={c}>{r[c] === null || r[c] === undefined ? "—" : String(r[c])}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form action={importAction} className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
        <SubmitButton className="btn btn-primary" pendingText="Importando…"><Download size={14} /> {t("Importar ahora")}</SubmitButton>
        <span className="text-xs text-muted">{t("Crea los productos nuevos y actualiza nombre y campos mapeados de los existentes (por Referencia). No cambia precios ni familia.")}</span>
        {result.message && <p role="status" className={`basis-full text-sm font-semibold ${result.ok ? "text-success" : "text-danger"}`}>{t(result.message)}</p>}
      </form>
    </div>
  );
}
