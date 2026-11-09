"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";

export type ConfirmRequest = {
  /** La pregunta, p. ej. «¿Eliminar la cuenta “Casa Viva”?». */
  title: string;
  /** Qué va a pasar si se confirma: la consecuencia, en una o dos frases. */
  body?: string;
  /** Texto del botón que confirma (por defecto «Confirmar»). */
  confirmLabel?: string;
  /** «danger» para borrar o cancelar: el foco empieza en «Cancelar» para que un Enter no lo confirme. */
  tone?: "danger" | "primary";
};

/**
 * Confirmación con el estilo del CRM en lugar del cuadro del navegador: un `<dialog>` modal (Esc cancela, el
 * foco queda dentro) que dice la consecuencia antes de una acción difícil de deshacer.
 * Devuelve el diálogo para renderizarlo y `ask`, que resuelve en true si la persona confirma.
 */
export function useConfirm(): [React.ReactNode, (request: ConfirmRequest) => Promise<boolean>] {
  const t = useT();
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (request && !dialog.open) dialog.showModal();
    if (!request && dialog.open) dialog.close();
  }, [request]);

  const finish = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setRequest(null);
  }, []);

  const ask = useCallback((next: ConfirmRequest) => new Promise<boolean>((resolve) => {
    resolver.current?.(false);
    resolver.current = resolve;
    setRequest(next);
  }), []);

  const danger = request?.tone === "danger";
  const dialog = (
    <dialog ref={ref} aria-labelledby={titleId} onCancel={(e) => { e.preventDefault(); finish(false); }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-0 text-ink shadow-[var(--shadow-lg)]">
      {request && (
        <div className="space-y-4 p-5">
          <h2 id={titleId} className="text-lg font-medium">{t(request.title)}</h2>
          {request.body && <p className="text-sm text-muted">{t(request.body)}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" autoFocus={danger} onClick={() => finish(false)}>{t("Volver")}</button>
            <button type="button" className={`btn ${danger ? "btn-danger" : "btn-primary"}`} autoFocus={!danger} onClick={() => finish(true)}>
              {t(request.confirmLabel ?? "Confirmar")}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
  return [dialog, ask];
}
