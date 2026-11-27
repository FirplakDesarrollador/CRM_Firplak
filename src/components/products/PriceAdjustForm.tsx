"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Tr } from "@/components/ui/Tr";
import { formatCurrency, formatNumber } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import { adjustPrices, type PriceAdjustState } from "@/lib/products/price-actions";

type Book = { id: string; name: string; currency: string; kind: string };

/**
 * Ajuste masivo en dos pasos: «Ver vista previa» calcula cómo quedarían los precios sin guardar; «Aplicar ajuste»
 * exige escribir la palabra de confirmación. Si se cambia algo después de la vista previa, hay que volver a verla.
 */
export function PriceAdjustForm({ qs, books }: { qs: string; books: Book[] }) {
  const t = useT();
  const [state, action] = useActionState(adjustPrices, {} as PriceAdjustState);
  // Al tocar el formulario la vista previa deja de corresponder: se oculta el paso de aplicar.
  const [seen, setSeen] = useState(state);
  const [dirty, setDirty] = useState(false);
  if (state !== seen) {
    setSeen(state);
    setDirty(false);
  }
  const preview = dirty ? undefined : state.preview;
  // Campos controlados: al terminar cada envío React devuelve el formulario a sus valores iniciales, y el paso de
  // aplicar debe enviar lo mismo que se vio en la vista previa.
  const [percents, setPercents] = useState<Record<string, string>>({});
  const [rounding, setRounding] = useState("1000");
  const [note, setNote] = useState("");
  const touched = (e: React.FormEvent<HTMLFormElement>) => {
    // La nota y la palabra de confirmación no cambian lo que se calculó.
    if (!["confirm", "note"].includes((e.target as HTMLElement).getAttribute("name") ?? "")) setDirty(true);
  };

  // Todo lo que se envía sale del estado de este componente y no de los campos del formulario: React los devuelve a
  // su valor inicial al terminar cada envío (una lista desplegable volvía a su primera opción).
  const submit = (fd: FormData) => {
    fd.set("_qs", qs);
    fd.set("_signature", preview?.signature ?? "");
    fd.set("rounding", rounding);
    fd.set("note", note);
    for (const b of books) fd.set(`pct:${b.id}`, percents[b.id] ?? "");
    action(fd);
  };

  return (
    <form action={submit} onInput={touched} className="space-y-4">
      <section className="card overflow-hidden">
        <div className="card-header">
          <h2 className="card-title"><Tr>Cuánto cambia cada lista</Tr></h2>
          <p className="text-xs text-muted"><Tr>Escribe el porcentaje solo en las listas que quieras ajustar: 8 sube 8 %; -5 baja 5 %. Las vacías no cambian.</Tr></p>
        </div>
        <ul className="divide-y divide-[var(--border)]">
          {books.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <label htmlFor={`pct-${b.id}`} className="min-w-48 flex-1">
                <span className="font-medium">{b.name}</span>
                <span className="block text-xs text-muted">{b.kind} · {b.currency}</span>
              </label>
              <div className="flex items-center gap-1.5">
                <input id={`pct-${b.id}`} name={`pct:${b.id}`} type="text" inputMode="decimal" autoComplete="off" className="input num w-28 text-right" placeholder="0"
                  value={percents[b.id] ?? ""} onChange={(e) => setPercents((p) => ({ ...p, [b.id]: e.target.value.replace(/[^\d.,-]/g, "") }))} />
                <span className="text-sm text-muted">%</span>
              </div>
            </li>
          ))}
        </ul>
        <div className="grid gap-4 border-t border-line p-4 sm:grid-cols-2">
          <label className="block">
            <span className="label"><Tr>Redondeo (listas en pesos)</Tr></span>
            <select name="rounding" className="select" value={rounding} onChange={(e) => { setRounding(e.target.value); setDirty(true); }}>
              <option value="0">{t("Sin redondeo")}</option>
              <option value="100">{t("Al múltiplo de 100 más cercano")}</option>
              <option value="1000">{t("Al múltiplo de 1.000 más cercano")}</option>
            </select>
            <span className="help"><Tr>Las listas en dólares quedan con centavos.</Tr></span>
          </label>
          <label className="block">
            <span className="label"><Tr>Nota (opcional)</Tr></span>
            <input name="note" type="text" className="input" maxLength={200} placeholder={t("P. ej. Incremento 2027")} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        <div className="flex justify-end border-t border-line px-4 py-3">
          <SubmitButton name="_step" value="preview" className="btn btn-primary" pendingText="Calculando…"><Tr>Ver vista previa</Tr></SubmitButton>
        </div>
      </section>

      {state.message && <Alert tone="error">{t(state.message)}</Alert>}

      {preview && (
        <section className="card overflow-hidden" aria-label={t("Vista previa")}>
          <div className="card-header">
            <h2 className="card-title"><Tr>Vista previa</Tr></h2>
            <p className="text-xs text-muted"><Tr>Todavía no se ha cambiado nada.</Tr></p>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {preview.lists.map((l) => (
              <li key={l.price_book_id} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <p className="font-medium">{l.name} <span className={`badge ml-1 ${l.percent > 0 ? "badge-success" : "badge-warning"}`}>{l.percent > 0 ? "+" : ""}{formatNumber(l.percent)}%</span></p>
                  <p className="text-sm text-muted">
                    {l.prices === 0 ? t("Ninguno de los productos elegidos tiene precio en esta lista.")
                      : `${formatNumber(l.prices)} ${t("precios")} · ${t("suma")} ${formatCurrency(l.before, l.currency)} → ${formatCurrency(l.after, l.currency)}`}
                  </p>
                </div>
                {l.samples.length > 0 && (
                  <table className="table mt-2">
                    <thead><tr><th><Tr>Ejemplos</Tr></th><th className="text-right"><Tr>Precio actual</Tr></th><th className="text-right"><Tr>Precio nuevo</Tr></th></tr></thead>
                    <tbody>
                      {l.samples.map((s) => (
                        <tr key={`${s.code}-${s.name}`}>
                          <td>{s.name}{s.code && <span className="ml-2 text-xs text-muted">{s.code}</span>}</td>
                          <td className="num text-right">{formatCurrency(s.before, l.currency)}</td>
                          <td className="num text-right font-medium">{formatCurrency(s.after, l.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-end justify-end gap-3 border-t border-line bg-surface-2 px-4 py-4">
            <label className="block">
              <span className="label"><Tr>Para aplicar, escribe AJUSTAR</Tr></span>
              <input name="confirm" type="text" className="input w-44" autoComplete="off" autoCapitalize="characters" />
            </label>
            <SubmitButton name="_step" value="apply" className="btn btn-primary" pendingText="Aplicando…"><Tr>Aplicar ajuste</Tr></SubmitButton>
          </div>
        </section>
      )}
    </form>
  );
}
