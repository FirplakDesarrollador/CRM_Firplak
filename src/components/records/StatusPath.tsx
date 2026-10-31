"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { setStatus } from "@/lib/records/phase2-actions";

import { useValueLabel } from "@/lib/i18n/client";
/** Ruta de estados (prospectos, cotizaciones, casos, campañas): clic para cambiar. */
export function StatusPath({ object, id, options, current, canEdit, negative = [] }: {
  object: "leads" | "quotes" | "orders" | "cases" | "campaigns";
  id: string;
  options: string[];
  current: string;
  canEdit: boolean;
  /** Estados terminales negativos (se pintan en rojo tierra). */
  negative?: string[];
}) {
  const [pending, start] = useTransition();
  const valueLabel = useValueLabel();
  const [value, setValue] = useOptimistic(current);
  const [error, setError] = useState<string | null>(null);
  // Aviso de éxito con mensaje (p. ej. la oferta de venta creada en SAP al activar un pedido).
  const [notice, setNotice] = useState<string | null>(null);
  const index = options.indexOf(value);

  return (
    <div className="border-t border-line px-5 py-3">
      <ol className="flex overflow-x-auto rounded-full bg-surface-3 p-1" aria-label="Estado">
        {options.map((option, i) => {
          const isCurrent = option === value;
          const done = i < index && !negative.includes(value);
          const bad = isCurrent && negative.includes(option);
          return (
            <li key={option} className="min-w-28 flex-1">
              <button
                type="button"
                disabled={!canEdit || pending || isCurrent}
                onClick={() =>
                  start(async () => {
                    setError(null);
                    setNotice(null);
                    setValue(option);
                    const res = await setStatus(object, id, option);
                    if (res.message) (res.ok ? setNotice : setError)(res.message);
                  })
                }
                className={`flex h-8 w-full items-center justify-center gap-1 truncate rounded-full px-3 text-xs font-medium transition ${
                  bad
                    ? "bg-danger text-[var(--cream-50)]"
                    : isCurrent
                      ? "bg-brand text-[var(--brand-contrast)]"
                      : done
                        ? "bg-brand-soft text-brand"
                        : "text-muted hover:bg-surface hover:text-ink"
                } disabled:cursor-default`}
              >
                {done && <Check size={13} />}
                <span className="truncate">{valueLabel(option)}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {error && <p className="error-text">{error}</p>}
      {notice && <p role="status" className="mt-1 text-xs font-semibold text-success">{notice}</p>}
    </div>
  );
}
