"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { Plus, Trash2 } from "lucide-react";
import { LookupInput } from "@/components/records/LookupInput";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { AmountInput } from "@/components/ui/AmountInput";
import { ConfirmSubmit } from "@/components/ui/ActionForm";
import { Tr } from "@/components/ui/Tr";
import { Val } from "@/components/ui/Val";
import { addKitComponent, removeKitComponent } from "@/lib/records/phase2-actions";
import { formatNumber } from "@/lib/format";
import type { FormState } from "@/lib/records/form";

export type KitComponent = {
  id: string; quantity: number;
  component: { id: string; name: string; product_code: string | null; plant: string | null; unit: string; is_active: boolean } | null;
};

function Row({ row, canEdit }: { row: KitComponent; canEdit: boolean }) {
  const [state, remove] = useActionState(removeKitComponent.bind(null, row.id), {} as FormState);
  const c = row.component;
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-48 flex-1">
        {c ? <Link href={`/productos/${c.id}`} className="link font-medium">{c.name}</Link> : <span className="text-muted">—</span>}
        <p className="text-xs text-muted">
          {[c?.product_code, c?.plant].filter(Boolean).join(" · ") || <Tr>Sin referencia</Tr>}
          {c && !c.is_active ? <> · <Tr>inactivo</Tr></> : null}
        </p>
      </div>
      <p className="num text-sm"><span className="font-semibold">{formatNumber(row.quantity)}</span> <span className="text-muted"><Val>{c?.unit ?? ""}</Val></span></p>
      {canEdit && (
        <form action={remove}>
          <ConfirmSubmit message={`¿Quitar “${c?.name ?? "este componente"}” del kit?`} confirmLabel="Quitar">
            <Trash2 size={14} /><span className="sr-only"><Tr>Quitar</Tr> {c?.name}</span>
          </ConfirmSubmit>
        </form>
      )}
      {state.message && <p className="error-text w-full">{state.message}</p>}
    </li>
  );
}

/** Tarjeta «Componentes del kit» de la ficha de un kit: lista con cantidad por kit y formulario para agregar. */
export function KitComponents({ kitId, rows, canEdit }: { kitId: string; rows: KitComponent[]; canEdit: boolean }) {
  const [state, action] = useActionState(addKitComponent.bind(null, kitId), {} as FormState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <section className="card overflow-hidden" aria-labelledby="kit-componentes">
      <div className="card-header">
        <h2 id="kit-componentes" className="card-title"><Tr>Componentes del kit</Tr> <span className="badge">{rows.length}</span></h2>
      </div>
      <ul className="divide-y divide-[var(--border)]">
        {rows.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-muted"><Tr>Este kit todavía no tiene componentes. Agrega el primero.</Tr></li>
        )}
        {rows.map((row) => <Row key={row.id} row={row} canEdit={canEdit} />)}
      </ul>
      {canEdit && (
        <form ref={formRef} action={action} className="flex flex-wrap items-end gap-2 border-t border-line bg-surface-2 p-4">
          <div className="min-w-56 flex-1">
            <label className="label" htmlFor="kit-comp"><Tr>Componente</Tr></label>
            <LookupInput key={state.values?.nonce ?? "add"} id="kit-comp" name="component_id" object="products" placeholder="Buscar producto o referencia…"
              invalid={Boolean(state.errors?.component_id)} />
          </div>
          <div className="w-28">
            <label className="label" htmlFor="kit-qty"><Tr>Cantidad por kit</Tr></label>
            <AmountInput id="kit-qty" name="quantity" defaultValue={1} className="input num text-center" />
          </div>
          <SubmitButton className="btn btn-primary" pendingText="Agregando…"><Plus size={15} /> <Tr>Agregar</Tr></SubmitButton>
          {!state.ok && (state.message || state.errors) && (
            <p className="error-text w-full">{state.message ?? Object.values(state.errors ?? {})[0]}</p>
          )}
        </form>
      )}
      <p className="border-t border-line px-4 py-3 text-xs text-muted">
        <Tr>El kit se cotiza y se valoriza con su propia referencia y precio. Los componentes se usan en los informes de producción y logística.</Tr>
      </p>
    </section>
  );
}
