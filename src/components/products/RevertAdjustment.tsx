"use client";

import { useActionState } from "react";
import { Undo2 } from "lucide-react";
import { ConfirmSubmit } from "@/components/ui/ActionForm";
import { Tr } from "@/components/ui/Tr";
import { revertPriceAdjustment } from "@/lib/products/price-actions";

/** Deshace un ajuste de precios completo (pide confirmación). */
export function RevertAdjustment({ id }: { id: string }) {
  const [state, action] = useActionState(revertPriceAdjustment.bind(null, id), {} as { ok?: boolean; message?: string });
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <ConfirmSubmit className="btn btn-sm" message="¿Deshacer este ajuste de precios?" confirmLabel="Deshacer"
        body="Cada precio vuelve al que tenía antes del ajuste. Los que alguien cambió después se respetan.">
        <Undo2 size={14} /> <Tr>Deshacer</Tr>
      </ConfirmSubmit>
      {state.message && <p className={state.ok ? "text-xs text-muted" : "error-text"}>{state.message}</p>}
    </form>
  );
}
