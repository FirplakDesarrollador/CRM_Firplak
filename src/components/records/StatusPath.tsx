"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { setStatus } from "@/lib/records/phase2-actions";

import { useValueLabel } from "@/lib/i18n/client";
import { useConfirm, type ConfirmRequest } from "@/components/ui/ConfirmDialog";
/**
 * Estados con consecuencias que no se deshacen con otro clic: antes de cambiar, se confirma diciendo qué pasa.
 * El avance normal (p. ej. Borrador → En revisión) sigue siendo de un clic.
 */
const CONSEQUENCES: Partial<Record<string, Record<string, ConfirmRequest>>> = {
  quotes: {
    Aceptada: {
      title: "¿El cliente aceptó esta cotización?",
      body: "Si la oportunidad tiene otras cotizaciones abiertas, esta parte se separa en su propia oportunidad ganada; si es la última abierta, la oportunidad queda ganada.",
      confirmLabel: "Sí, aceptada",
    },
    Rechazada: {
      title: "¿Marcar la cotización como rechazada?",
      body: "Deja de sumar al valor de la oportunidad. Si era la última parte abierta, se avisa al asesor y a su jefe para cerrar la oportunidad.",
      confirmLabel: "Rechazar", tone: "danger",
    },
    Reemplazada: {
      title: "¿Marcarla como reemplazada por otra versión?",
      body: "Úsalo para la versión anterior de una parte: deja de sumar al valor de la oportunidad y no genera avisos.",
      confirmLabel: "Marcar reemplazada",
    },
  },
  orders: {
    Activado: {
      title: "¿Activar el pedido?",
      body: "Si SAP está conectado, se crea la oferta de venta en SAP Business One con estos productos, cantidades y precios. Revísalos antes de continuar.",
      confirmLabel: "Activar pedido",
    },
    Cancelado: {
      title: "¿Cancelar el pedido?",
      body: "Se avisa al asesor y a su jefe. Si ya tiene oferta de venta en SAP, revísala allá: el CRM no la anula.",
      confirmLabel: "Cancelar pedido", tone: "danger",
    },
  },
};

/** Ruta de estados (prospectos, cotizaciones, pedidos, casos, campañas): clic para cambiar. */
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
  const [dialog, ask] = useConfirm();

  return (
    <div className="border-t border-line px-5 py-3">
      <ol className="flex overflow-x-auto rounded-full bg-surface-3 p-1" aria-label="Estado">
        {options.map((option, i) => {
          const isCurrent = option === value;
          const done = i < index && !negative.includes(value);
          const bad = isCurrent && negative.includes(option);
          return (
            <li key={option} className="min-w-28 flex-1" aria-current={isCurrent ? "step" : undefined}>
              <button
                type="button"
                disabled={!canEdit || pending || isCurrent}
                onClick={async () => {
                  const consequence = CONSEQUENCES[object]?.[option];
                  if (consequence && !(await ask(consequence))) return;
                  start(async () => {
                    setError(null);
                    setNotice(null);
                    setValue(option);
                    const res = await setStatus(object, id, option);
                    if (res.message) (res.ok ? setNotice : setError)(res.message);
                  });
                }}
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
      {dialog}
    </div>
  );
}
