"use client";

import { useEffect, useRef, useState } from "react";
import { LOSS_REASONS } from "@/lib/objects/picklists";

import { Tr } from "@/components/ui/Tr";
/** Pide el motivo de pérdida antes de mover una oportunidad a una etapa perdida. */
export function LossDialog({ open, onCancel, onConfirm, reasons = LOSS_REASONS }: {
  open: boolean; onCancel: () => void; onConfirm: (reason: string) => void; reasons?: string[];
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState(reasons[0] ?? "");

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} onCancel={onCancel} className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-0 text-ink shadow-[var(--shadow-lg)]">
      <form method="dialog" onSubmit={(e) => { e.preventDefault(); onConfirm(reason); }} className="space-y-4 p-5">
        <h2 className="text-lg font-medium"><Tr>Marcar como perdida</Tr></h2>
        <div>
          <label className="label" htmlFor="loss-reason"><Tr>Motivo de pérdida</Tr></label>
          <select id="loss-reason" className="select" value={reason} onChange={(e) => setReason(e.target.value)}>
            {reasons.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onCancel}><Tr>Cancelar</Tr></button>
          <button type="submit" className="btn btn-danger"><Tr>Confirmar pérdida</Tr></button>
        </div>
      </form>
    </dialog>
  );
}
