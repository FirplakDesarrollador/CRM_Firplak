"use client";

import { useActionState, useEffect, useRef } from "react";
import { Plus, Trash2 } from "lucide-react";
import { addQuoteLine, removeQuoteLine, updateQuoteLine } from "@/lib/records/phase2-actions";
import { addOrderLine, removeOrderLine, updateOrderLine } from "@/lib/orders/actions";
import { LookupInput } from "@/components/records/LookupInput";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { AmountInput } from "@/components/ui/AmountInput";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { FormState } from "@/lib/records/form";

import { Tr } from "@/components/ui/Tr";
export type QuoteLine = {
  id: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  discount: number;
  line_total: number;
  /** Producto que no está en la lista propia del cliente (precio de la lista del canal). */
  not_listed?: boolean;
  product: { id: string; name: string; product_code: string | null; unit: string } | null;
};

/** Las líneas de cotización y de pedido comparten interfaz; cambian las acciones y los textos. */
const KINDS = {
  quote: { add: addQuoteLine, update: updateQuoteLine, remove: removeQuoteLine, title: "Productos cotizados", empty: "Agrega productos desde la lista de precios de la cotización." },
  order: { add: addOrderLine, update: updateOrderLine, remove: removeOrderLine, title: "Productos del pedido", empty: "Agrega productos desde la lista de precios del pedido." },
} as const;
type Kind = keyof typeof KINDS;

/**
 * Una sola plantilla de columnas para títulos, líneas y el formulario de agregar: cada fila es su propia
 * cuadrícula, así que una columna `auto` mediría distinto en cada una y los títulos quedarían corridos.
 * Columnas: producto · cantidad · precio unit. · desc. % · total · acciones (Guardar y quitar).
 */
const COLS = "md:grid-cols-[minmax(0,1fr)_6rem_9rem_6rem_9rem_7.5rem]";

function LineRow({ line, canEdit, kind, currency }: { line: QuoteLine; canEdit: boolean; kind: Kind; currency: string }) {
  const [state, action] = useActionState(KINDS[kind].update.bind(null, line.id), {} as FormState);
  const [delState, del] = useActionState(KINDS[kind].remove.bind(null, line.id), {} as FormState);
  return (
    <li className={`grid gap-2 px-4 py-3 md:items-center ${COLS}`}>
      <div className="min-w-0">
        <p className="truncate font-medium">{line.description ?? line.product?.name}</p>
        <p className="text-xs text-muted">
          {line.product?.product_code} · {line.product?.unit}
          {line.not_listed && <span className="badge badge-warning ml-2" title="No está en la lista de precios del cliente: se cotiza con la lista del canal."><Tr>No codificado</Tr></span>}
        </p>
      </div>
      {canEdit ? (
        <form action={action} className="contents">
          <AmountInput name="quantity" aria-label="Cantidad" defaultValue={line.quantity} className="input num h-8 text-right" />
          <AmountInput name="unit_price" aria-label="Precio unitario" defaultValue={line.unit_price} className="input num h-8 text-right" />
          <AmountInput name="discount" aria-label="Descuento %" defaultValue={line.discount} className="input num h-8 text-right" />
          <p className="num text-right font-medium">{formatCurrency(line.line_total, currency)}</p>
          <div className="flex items-center justify-end gap-1">
            <SubmitButton className="btn btn-sm" pendingText="…"><Tr>Guardar</Tr></SubmitButton>
            <button type="submit" formAction={del} className="btn btn-sm btn-ghost text-danger" aria-label="Quitar línea"
              onClick={(e) => { if (!confirm("¿Quitar esta línea?")) e.preventDefault(); }}>
              <Trash2 size={14} />
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className="num text-right">{formatNumber(line.quantity)}</p>
          <p className="num text-right">{formatCurrency(line.unit_price, currency)}</p>
          <p className="num text-right">{formatNumber(line.discount)}%</p>
          <p className="num text-right font-medium">{formatCurrency(line.line_total, currency)}</p>
          <span />
        </>
      )}
      {(state.message || delState.message) && <p className="error-text md:col-span-6">{state.message ?? delState.message}</p>}
    </li>
  );
}

export function QuoteLines({ quoteId, lines, canEdit, kind = "quote", currency = "COP" }: { quoteId: string; lines: QuoteLine[]; canEdit: boolean; kind?: Kind; currency?: string }) {
  const [state, action] = useActionState(KINDS[kind].add.bind(null, quoteId), {} as FormState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <section className="card overflow-hidden">
      <div className="card-header"><h2 className="card-title"><Tr>{KINDS[kind].title}</Tr> <span className="badge">{lines.length}</span></h2></div>
      <div className={`hidden ${COLS} gap-2 border-b border-line bg-surface-2 px-4 py-2 text-[0.7rem] font-medium uppercase tracking-[0.12em] text-muted md:grid`}>
        <span><Tr>Producto</Tr></span><span className="text-right"><Tr>Cantidad</Tr></span><span className="text-right"><Tr>Precio unit.</Tr></span>
        <span className="text-right"><Tr>Desc. %</Tr></span><span className="text-right"><Tr>Total</Tr></span><span />
      </div>
      <ul className="divide-y divide-[var(--border)]">
        {lines.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted"><Tr>{KINDS[kind].empty}</Tr></li>}
        {lines.map((line) => <LineRow key={line.id} line={line} canEdit={canEdit} kind={kind} currency={currency} />)}
      </ul>
      {canEdit && (
        <form ref={formRef} action={action} className={`grid gap-2 border-t border-line bg-surface-2 px-4 py-4 md:items-end ${COLS}`}>
          <div>
            <label className="label" htmlFor="ql-product"><Tr>Producto</Tr></label>
            <LookupInput key={state.values?.nonce ?? "add"} id="ql-product" name="product_id" object="products" placeholder="Buscar producto o referencia…"
              invalid={Boolean(state.errors?.product_id)} />
          </div>
          <div>
            <label className="label" htmlFor="ql-qty"><Tr>Cantidad</Tr></label>
            <AmountInput id="ql-qty" name="quantity" defaultValue={1} className="input num text-right" />
          </div>
          <div>
            <label className="label" htmlFor="ql-price"><Tr>Precio (opcional)</Tr></label>
            <AmountInput id="ql-price" name="unit_price" className="input num text-right" placeholder="De la lista" />
          </div>
          <div>
            <label className="label" htmlFor="ql-disc"><Tr>Desc. %</Tr></label>
            <AmountInput id="ql-disc" name="discount" defaultValue={0} className="input num text-right" />
          </div>
          {/* Ocupa las columnas de total y acciones, para que los campos queden bajo sus títulos. */}
          <div className="flex md:col-span-2 md:justify-end">
            <SubmitButton className="btn btn-primary w-full md:w-auto" pendingText="Agregando…"><Plus size={15} /> <Tr>Agregar</Tr></SubmitButton>
          </div>
          {!state.ok && (state.message || state.errors) && (
            <p className="error-text md:col-span-6">{state.message ?? Object.values(state.errors ?? {})[0]}</p>
          )}
        </form>
      )}
    </section>
  );
}
