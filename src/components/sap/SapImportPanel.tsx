"use client";

import { useActionState, useEffect, useState } from "react";
import { Download, Eye, Search } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { checkSapRequest, previewSapImport, runSapImport, type ImportState } from "@/lib/sap/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";

type Field = { api_name: string; label: string };

/**
 * Resultado de una acción: si la atendió el servidor, es el estado tal cual; si la pidió al agente de
 * SAP (`requestId`), consulta la solicitud cada tres segundos hasta que termine o pasen tres minutos.
 */
function useAgentResult(state: ImportState) {
  const [done, setDone] = useState<{ id: string; state: ImportState } | null>(null);
  const id = state.requestId;
  useEffect(() => {
    if (!id) return;
    let active = true;
    const started = Date.now();
    const tick = async () => {
      const next = await checkSapRequest(id).catch(() => null);
      if (!active) return;
      if (next && !next.pending) return setDone({ id, state: next });
      if (Date.now() - started > 180_000) return setDone({ id, state: { message: "El agente de SAP no respondió. Revisa que su equipo esté encendido y dentro de la red de Firplak." } });
      timer = setTimeout(tick, 3000);
    };
    let timer = setTimeout(tick, 1500);
    return () => { active = false; clearTimeout(timer); };
  }, [id]);
  if (!id) return { state, waiting: false };
  return done?.id === id ? { state: done.state, waiting: false } : { state, waiting: true };
}

/** Importación de productos desde SAP: filtro, mapeo de campos personalizados, vista previa e importar. */
export function SapImportPanel({ fields, prefix, salesOnly, mappings, families, plants, canBringGroup }: {
  fields: Field[]; prefix: string; salesOnly: boolean; mappings: { field: string; sap_field: string }[];
  /** Valores de las listas Familia y Planta de Productos; el grupo de artículo solo lo trae el agente. */
  families: string[]; plants: string[]; canBringGroup: boolean;
}) {
  const t = useT();
  const [previewState, previewAction] = useActionState<ImportState, FormData>(previewSapImport, {});
  const [resultState, importAction] = useActionState<ImportState, FormData>(runSapImport, {});
  const { state: preview, waiting: previewWaiting } = useAgentResult(previewState);
  const { state: result, waiting: importWaiting } = useAgentResult(resultState);
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
        <SubmitButton className="btn" pendingText="Consultando SAP…"><Eye size={14} /> {t("Guardar y ver artículos")}</SubmitButton>
        {preview.message && <p role="status" aria-busy={previewWaiting} className={`text-xs font-semibold ${previewWaiting ? "text-muted" : preview.ok ? "text-success" : "text-danger"}`}>{t(preview.message)}</p>}
      </form>

      {preview.preview && preview.preview.length > 0 && (
        <PickAndImport key={previewState.requestId ?? preview.preview.length} rows={preview.preview} columns={preview.columns ?? []}
          existing={preview.existing ?? []} action={importAction} waiting={importWaiting} result={result}
          families={families} plants={plants} canBringGroup={canBringGroup} />
      )}
    </div>
  );
}

/** Lista de artículos de SAP para marcar cuáles se importan: solo entra al CRM lo que la persona elige. */
function PickAndImport({ rows, columns, existing, action, waiting, result, families, plants, canBringGroup }: {
  rows: Record<string, unknown>[]; columns: string[]; existing: string[];
  action: (fd: FormData) => void; waiting: boolean; result: ImportState;
  families: string[]; plants: string[]; canBringGroup: boolean;
}) {
  const t = useT();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const inCrm = new Set(existing);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = rows.filter((r) => {
    const text = columns.map((c) => String(r[c] ?? "")).join(" ").toLowerCase();
    return words.every((w) => text.includes(w));
  });
  const shownCodes = shown.map((r) => String(r.ItemCode));
  const allShown = shownCodes.length > 0 && shownCodes.every((c) => picked.has(c));
  const toggle = (code: string) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(code)) next.delete(code); else next.add(code);
    return next;
  });
  const toggleShown = () => setPicked((prev) => {
    const next = new Set(prev);
    for (const c of shownCodes) { if (allShown) next.delete(c); else next.add(c); }
    return next;
  });

  return (
    <form action={action} className="space-y-3 border-t border-line pt-3">
      {[...picked].map((c) => <input key={c} type="hidden" name="code" value={c} />)}
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-[14rem] flex-1">
          <span className="sr-only">{t("Buscar en la lista")}</span>
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} className="input pl-8" placeholder={t("Buscar en la lista")} />
        </label>
        <span className="text-sm text-muted" aria-live="polite">{picked.size} {t("de")} {rows.length} {t("elegidos")}</span>
      </div>
      <div className="max-h-[28rem] overflow-auto rounded-[10px] border border-line">
        <table className="table">
          <thead>
            <tr>
              <th className="w-10"><input type="checkbox" checked={allShown} onChange={toggleShown} aria-label={t("Elegir todos los de la lista")} className="accent-[var(--brand)]" /></th>
              {columns.map((c) => <th key={c}>{c === "ItemCode" ? t("Código") : c === "ItemName" ? t("Descripción") : c}</th>)}
              <th>{t("En el CRM")}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const code = String(r.ItemCode);
              return (
                <tr key={code}>
                  <td><input type="checkbox" checked={picked.has(code)} onChange={() => toggle(code)} aria-label={`${t("Elegir")} ${code}`} className="accent-[var(--brand)]" /></td>
                  {columns.map((c) => <td key={c} className={c === "ItemCode" ? "num whitespace-nowrap" : undefined}>{r[c] === null || r[c] === undefined ? "—" : String(r[c])}</td>)}
                  <td>{inCrm.has(code) ? <span className="badge badge-success">{t("Ya está")}</span> : <span className="text-muted">—</span>}</td>
                </tr>
              );
            })}
            {shown.length === 0 && <tr><td colSpan={columns.length + 2} className="text-sm text-muted">{t("Nada en la lista coincide con la búsqueda.")}</td></tr>}
          </tbody>
        </table>
      </div>
      <fieldset className="grid gap-3 rounded-[10px] border border-line p-3 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold">{t("Datos para los artículos elegidos")}</legend>
        <div>
          <label className="label" htmlFor="sap-family">{t("Familia")}</label>
          <select id="sap-family" name="family" className="select" defaultValue="">
            <option value="">{t("Sin familia")}</option>
            {families.map((f) => <option key={f}>{f}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="sap-plant">{t("Planta")}</label>
          <select id="sap-plant" name="plant" className="select" defaultValue="">
            <option value="">{t("Sin planta")}</option>
            {plants.map((p) => <option key={p}>{p}</option>)}
          </select>
          {plants.length === 0 && <p className="mt-1 text-xs text-muted">{t("La lista de Plantas está vacía: créalas en Configuración → Listas de valores → Productos.")}</p>}
        </div>
        {canBringGroup && (
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="with_group" defaultChecked className="mt-0.5 accent-[var(--brand)]" />
            <span>{t("Traer de SAP el Grupo de Artículo")} <span className="block text-xs text-muted">{t("Si un grupo no está en la lista de valores, se crea solo y queda atado a la familia elegida.")}</span></span>
          </label>
        )}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton className="btn btn-primary" pendingText="Importando…"><Download size={14} /> {t("Importar seleccionados")} ({picked.size})</SubmitButton>
        <span className="text-xs text-muted">{t("Crea los productos nuevos y actualiza los que ya están (por Referencia): nombre, campos mapeados y lo que elijas aquí. No cambia precios.")}</span>
        {result.message && <p role="status" aria-busy={waiting} className={`basis-full text-sm font-semibold ${waiting ? "text-muted" : result.ok ? "text-success" : "text-danger"}`}>{t(result.message)}</p>}
      </div>
    </form>
  );
}
