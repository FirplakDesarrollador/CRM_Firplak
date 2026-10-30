"use client";

import { useActionState, useEffect, useRef } from "react";
import { Plus, Trash2 } from "lucide-react";
import { addQuoteLine, removeQuoteLine, updateQuoteLine } from "@/lib/records/phase2-actions";
import { LookupInput } from "@/components/records/LookupInput";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { FormState } from "@/lib/records/form";

export type QuoteLine = {
  id: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  discount: number;
  line_total: number;
  product: { id: string; name: string; product_code: string | null; unit: string } | null;
};

function LineRow({ line, canEdit }: { line: QuoteLine; canEdit: boolean }) {
  const [state, action] = useActionState(updateQuoteLine.bind(null, line.id), {} as FormState);
  const [delState, del] = useActionState(removeQuoteLine.bind(null, line.id), {} as FormState);
  return (
    <li className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_6rem_9rem_6rem_9rem_auto] md:items-center">
      <div className="min-w-0">
        <p className="truncate font-medium">{line.description ?? line.product?.name}</p>
        <p className="text-xs text-muted">{line.product?.product_code} · {line.product?.unit}</p>
      </div>
      {canEdit ? (
        <form action={action} className="contents">
          <input name="quantity" aria-label="Cantidad" defaultValue={line.quantity} inputMode="decimal" className="input num h-8 text-right" />
          <input name="unit_price" aria-label="Precio unitario" defaultValue={line.unit_price} inputMode="decimal" className="input num h-8 text-right" />
          <input name="discount" aria-label="Descuento %" defaultValue={line.discount} inputMode="decimal" className="input num h-8 text-right" />
          <p className="num text-right font-medium">{formatCurrency(line.line_total)}</p>
          <div className="flex items-center justify-end gap-1">
            <SubmitButton className="btn btn-sm" pendingText="…">Guardar</SubmitButton>
            <button type="submit" formAction={del} className="btn btn-sm btn-ghost text-danger" aria-label="Quitar línea"
              onClick={(e) => { if (!confirm("¿Quitar esta línea?")) e.preventDefault(); }}>
              <Trash2 size={14} />
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className="num text-right">{formatNumber(line.quantity)}</p>
          <p className="num text-right">{formatCurrency(line.unit_price)}</p>
          <p className="num text-right">{formatNumber(line.discount)}%</p>
          <p className="num text-right font-medium">{formatCurrency(line.line_total)}</p>
          <span />
        </>
      )}
      {(state.message || delState.message) && <p className="error-text md:col-span-6">{state.message ?? delState.message}</p>}
    </li>
  );
}

export function QuoteLines({ quoteId, lines, canEdit }: { quoteId: string; lines: QuoteLine[]; canEdit: boolean }) {
  const [state, action] = useActionState(addQuoteLine.bind(null, quoteId), {} as FormState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <section className="card overflow-hidden">
      <div className="card-header"><h2 className="card-title">Productos cotizados <span className="badge">{lines.length}</span></h2></div>
      <div className="hidden grid-cols-[minmax(0,1fr)_6rem_9rem_6rem_9rem_auto] gap-2 border-b border-line bg-surface-2 px-4 py-2 text-[0.7rem] font-medium uppercase tracking-[0.12em] text-muted md:grid">
        <span>Producto</span><span className="text-right">Cantidad</span><span className="text-right">Precio unit.</span>
        <span className="text-right">Desc. %</span><span className="text-right">Total</span><span />
      </div>
      <ul className="divide-y divide-[var(--border)]">
        {lines.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">Agrega productos desde la lista de precios de la cotización.</li>}
        {lines.map((line) => <LineRow key={line.id} line={line} canEdit={canEdit} />)}
      </ul>
      {canEdit && (
        <form ref={formRef} action={action} className="grid gap-3 border-t border-line bg-surface-2 p-4 md:grid-cols-[minmax(0,1fr)_7rem_9rem_6rem_auto] md:items-end">
          <div>
            <span className="label">Producto</span>
            <LookupInput key={state.values?.nonce ?? "add"} name="product_id" object="products" placeholder="Buscar producto o referencia…"
              invalid={Boolean(state.errors?.product_id)} />
          </div>
          <div>
            <label className="label" htmlFor="ql-qty">Cantidad</label>
            <input id="ql-qty" name="quantity" defaultValue="1" inputMode="decimal" className="input num text-right" />
          </div>
          <div>
            <label className="label" htmlFor="ql-price">Precio (opcional)</label>
            <input id="ql-price" name="unit_price" inputMode="decimal" className="input num text-right" placeholder="De la lista" />
          </div>
          <div>
            <label className="label" htmlFor="ql-disc">Desc. %</label>
            <input id="ql-disc" name="discount" defaultValue="0" inputMode="decimal" className="input num text-right" />
          </div>
          <SubmitButton pendingText="Agregando…"><Plus size={15} /> Agregar</SubmitButton>
          {!state.ok && (state.message || state.errors) && (
            <p className="error-text md:col-span-5">{state.message ?? Object.values(state.errors ?? {})[0]}</p>
          )}
        </form>
      )}
    </section>
  );
}
