"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Download, FileUp, Upload } from "lucide-react";
import { parseCsv, normalizeHeader, toCsv } from "@/lib/import/csv";
import { CHUNK_SIZE, MAX_ROWS } from "@/lib/import/config";
import { importChunk, logImport, type ChunkResult } from "@/lib/import/actions";
import { Alert } from "@/components/ui/Alert";

type Field = { name: string; label: string; type: string; required: boolean };

export function ImportWizard({ object, label, plural, path, fields, matchFields, canUpdate }: {
  object: string; label: string; plural: string; path: string; fields: Field[];
  matchFields: { name: string; label: string }[]; canUpdate: boolean;
}) {
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<"create" | "upsert">("create");
  const [matchField, setMatchField] = useState<string>(matchFields[0]?.name ?? "");
  const [fileError, setFileError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<ChunkResult | null>(null);

  const step = result ? 3 : rows.length ? 2 : 1;
  const mappedFields = new Set(Object.values(mapping).filter(Boolean));
  const missingRequired = fields.filter((f) => f.required && !mappedFields.has(f.name) && !["account_type", "status", "unit", "stage_id", "close_date", "amount"].includes(f.name));
  const matchMapped = mode === "create" || mappedFields.has(matchField);

  const autoMap = (hs: string[]) => {
    const byKey = new Map<string, string>();
    fields.forEach((f) => { byKey.set(normalizeHeader(f.label), f.name); byKey.set(normalizeHeader(f.name), f.name); });
    const used = new Set<string>();
    const map: Record<string, string> = {};
    hs.forEach((h, i) => {
      const f = byKey.get(normalizeHeader(h));
      if (f && !used.has(f)) { map[String(i)] = f; used.add(f); }
    });
    return map;
  };

  const onFile = async (file: File) => {
    setFileError(null);
    setResult(null);
    const buffer = await file.arrayBuffer();
    let text = new TextDecoder("utf-8").decode(buffer);
    // Excel en Windows guarda CSV en ANSI (windows-1252): se reintenta si hay caracteres inválidos.
    if (text.includes("�")) text = new TextDecoder("windows-1252").decode(buffer);
    const parsed = parseCsv(text);
    if (!parsed.headers.length || !parsed.rows.length) { setFileError("El archivo no tiene encabezados o filas de datos."); return; }
    if (parsed.rows.length > MAX_ROWS) { setFileError(`El archivo tiene ${parsed.rows.length} filas; el máximo por importación es ${MAX_ROWS}.`); return; }
    setFileName(file.name);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setMapping(autoMap(parsed.headers));
  };

  const sample = (col: number) => rows.find((r) => (r[col] ?? "").trim())?.[col] ?? "";

  const downloadTemplate = () => {
    const blob = new Blob([toCsv([fields.map((f) => f.label)])], { type: "text/csv;charset=utf-8" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `plantilla-${object}.csv` });
    a.click();
  };

  const downloadErrors = () => {
    if (!result) return;
    const lines = [["Fila", "Error", ...headers], ...result.errors.map((e) => [e.row + 1, e.message, ...(rows[e.row - 1] ?? [])])];
    const blob = new Blob([toCsv(lines)], { type: "text/csv;charset=utf-8" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `errores-${fileName || object}.csv` });
    a.click();
  };

  const run = async () => {
    const total: ChunkResult = { created: 0, updated: 0, skipped: 0, errors: [] };
    const cleanMapping = Object.fromEntries(Object.entries(mapping).filter(([, f]) => f));
    setProgress(0);
    for (let start = 0; start < rows.length; start += CHUNK_SIZE) {
      const res = await importChunk({
        object, mode, matchField: mode === "upsert" ? matchField : null, mapping: cleanMapping,
        rows: rows.slice(start, start + CHUNK_SIZE), startRow: start + 1,
      });
      if (res.fatal) { setFileError(res.fatal); setProgress(null); return; }
      total.created += res.created;
      total.updated += res.updated;
      total.skipped += res.skipped;
      total.errors.push(...res.errors);
      setProgress(Math.min(rows.length, start + CHUNK_SIZE) / rows.length);
    }
    await logImport({ object, fileName, mode, matchField: mode === "upsert" ? matchField : null, total: rows.length, ...total });
    setResult(total);
    setProgress(null);
  };

  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap gap-2 text-sm">
        {["Archivo", "Columnas", "Resultado"].map((s, i) => (
          <li key={s} className={`badge py-1 ${step === i + 1 ? "badge-brand" : step > i + 1 ? "badge-success" : ""}`}>{i + 1}. {s}</li>
        ))}
      </ol>
      {fileError && <Alert tone="error">{fileError}</Alert>}

      {step === 1 && (
        <section className="glass space-y-4 p-6">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[16px] border-2 border-dashed border-line-strong bg-surface/60 px-6 py-12 text-center hover:border-brand">
            <FileUp size={32} className="text-brand" />
            <span className="font-medium">Selecciona un archivo CSV</span>
            <span className="text-sm text-muted">En Excel: Archivo → Guardar como → CSV (delimitado por comas o punto y coma). Máximo {MAX_ROWS.toLocaleString("en-US")} filas.</span>
            <input type="file" accept=".csv,.txt,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-muted">Las relaciones se escriben por nombre (p. ej. el nombre de la cuenta) y el propietario por nombre o correo. Las fechas en DD/MM/AAAA.</span>
            <button type="button" className="btn btn-sm" onClick={downloadTemplate}><Download size={14} /> Plantilla de {plural.toLowerCase()}</button>
          </div>
        </section>
      )}

      {step === 2 && (
        <>
          <section className="card overflow-hidden">
            <div className="card-header">
              <h2 className="card-title">{fileName} · {rows.length.toLocaleString("en-US")} filas</h2>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setRows([]); setHeaders([]); }}>Cambiar archivo</button>
            </div>
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Columna del archivo</th><th>Ejemplo</th><th>Campo del CRM</th></tr></thead>
                <tbody>
                  {headers.map((h, i) => (
                    <tr key={i}>
                      <td className="font-medium">{h || `(columna ${i + 1})`}</td>
                      <td className="max-w-64 truncate text-muted">{sample(i)}</td>
                      <td>
                        <select className="select h-9" aria-label={`Campo para ${h}`} value={mapping[String(i)] ?? ""}
                          onChange={(e) => setMapping({ ...mapping, [String(i)]: e.target.value })}>
                          <option value="">— No importar —</option>
                          {fields.map((f) => (
                            <option key={f.name} value={f.name} disabled={mappedFields.has(f.name) && mapping[String(i)] !== f.name}>
                              {f.label}{f.required ? " *" : ""}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="glass space-y-3 p-5">
            <p className="eyebrow">Cómo importar</p>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="radio" checked={mode === "create"} onChange={() => setMode("create")} /> Crear todos como nuevos</label>
              {canUpdate && matchFields.length > 0 && (
                <label className="flex items-center gap-2"><input type="radio" checked={mode === "upsert"} onChange={() => setMode("upsert")} /> Actualizar existentes y crear los nuevos</label>
              )}
            </div>
            {mode === "upsert" && (
              <div className="max-w-sm">
                <label className="label" htmlFor="match">Identificar registros existentes por</label>
                <select id="match" className="select" value={matchField} onChange={(e) => setMatchField(e.target.value)}>
                  {matchFields.map((m) => <option key={m.name} value={m.name}>{m.label}</option>)}
                </select>
                {!matchMapped && <p className="error-text">Asigna una columna al campo elegido para poder actualizar.</p>}
              </div>
            )}
            {missingRequired.length > 0 && mode === "create" && (
              <Alert tone="warning">Faltan campos obligatorios: {missingRequired.map((f) => f.label).join(", ")}. Las filas sin ellos se omitirán.</Alert>
            )}
            <p className="text-xs text-muted">Se aplican las reglas de validación; las filas que no las cumplan se omiten y se informan. Las automatizaciones no se ejecutan durante la importación.</p>
            <div className="flex justify-end">
              <button type="button" className="btn btn-primary" disabled={progress !== null || !matchMapped || mappedFields.size === 0} onClick={run}>
                <Upload size={15} /> {progress !== null ? `Importando… ${Math.round(progress * 100)}%` : `Importar ${rows.length.toLocaleString("en-US")} filas`}
              </button>
            </div>
            {progress !== null && (
              <div className="h-2 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full bg-brand transition-[width] duration-300" style={{ width: `${progress * 100}%` }} />
              </div>
            )}
          </section>
        </>
      )}

      {step === 3 && result && (
        <section className="glass space-y-4 p-6">
          <h2 className="card-title"><CheckCircle2 size={18} className="text-success" /> Importación terminada</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><p className="eyebrow">Creados</p><p className="kpi-value mt-1">{result.created}</p></div>
            <div><p className="eyebrow">Actualizados</p><p className="kpi-value mt-1">{result.updated}</p></div>
            <div><p className="eyebrow">Omitidos</p><p className="kpi-value mt-1">{result.skipped}</p></div>
          </div>
          {result.errors.length > 0 && (
            <div className="space-y-2">
              <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
                {result.errors.slice(0, 20).map((e) => <li key={e.row}><span className="font-medium">Fila {e.row + 1}:</span> {e.message}</li>)}
              </ul>
              <button type="button" className="btn btn-sm" onClick={downloadErrors}><Download size={14} /> Descargar errores ({result.errors.length})</button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Link href={path} className="btn btn-primary">Ver {plural.toLowerCase()}</Link>
            <button type="button" className="btn" onClick={() => { setResult(null); setRows([]); setHeaders([]); }}>Importar otro archivo de {label.toLowerCase()}s</button>
          </div>
        </section>
      )}
    </div>
  );
}
