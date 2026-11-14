"use client";

import { useRef } from "react";
import { X } from "lucide-react";
import { Fmt } from "@/components/ui/Fmt";
import { Tr } from "@/components/ui/Tr";
import { formatNumber } from "@/lib/format";
import type { SapOrderLine } from "@/lib/sap/types";

/** Desde cuántas líneas se muestra el resumen del pedido: en pedidos cortos repetiría lo que ya se ve. */
const SUMMARY_FROM = 6;
const toProduce = (l: SapOrderLine) => Math.max(0, l.Quantity - l.Invoiced - (l.InDispatch ?? 0));

/** Número del pedido que abre una ventana con sus líneas: cada una puede tener su propia fecha de despacho. */
export function SapOrderLines({ docNum, lines }: { docNum: number; lines: SapOrderLine[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  if (!lines.length) return <>{docNum}</>;
  // Resumen del pedido (solo en pedidos largos); si alguna línea no se calcula (artículo de compra), esos dos totales quedan sin dato.
  const known = lines.every((l) => l.InDispatch !== null);
  const sum = (f: (l: SapOrderLine) => number) => lines.reduce((t, l) => t + f(l), 0);
  const totals: { label: string; value: number | null }[] = [
    { label: "Pedida", value: sum((l) => l.Quantity) },
    { label: "Facturada", value: sum((l) => l.Invoiced) },
    { label: "En despacho", value: known ? sum((l) => l.InDispatch ?? 0) : null },
    { label: "Por producir", value: known ? sum(toProduce) : null },
  ];
  return (
    <>
      <button type="button" className="link num" onClick={() => ref.current?.showModal()} aria-haspopup="dialog">{docNum}</button>
      <dialog ref={ref} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
        className="m-auto w-[min(76rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-0 text-ink shadow-[var(--shadow-lg)]">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="text-lg font-medium"><Tr>Pedido</Tr> <span className="num">{docNum}</span> · <Tr>líneas y despachos</Tr></h2>
          <button type="button" className="btn btn-sm" onClick={() => ref.current?.close()} aria-label="Cerrar"><X size={15} /></button>
        </div>
        <div className="max-h-[80vh] overflow-auto p-5">
          {lines.length >= SUMMARY_FROM && (
            <dl className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {totals.map((k) => (
                <div key={k.label} className="rounded-[10px] border border-line p-3">
                  <dt className="text-xs text-muted"><Tr>{k.label}</Tr></dt>
                  <dd className="num mt-0.5 text-lg font-medium">{k.value === null ? "—" : formatNumber(k.value)}</dd>
                </div>
              ))}
            </dl>
          )}
          <table className="table">
            <thead>
              <tr>
                <th><Tr>Artículo</Tr></th>
                <th className="text-right"><Tr>Pedida</Tr></th><th className="text-right"><Tr>Facturada</Tr></th>
                <th className="text-right"><Tr>En despacho</Tr></th><th className="text-right"><Tr>Por producir</Tr></th>
                <th><Tr>Fecha plan despacho</Tr></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.Line} className={l.Open ? undefined : "text-muted"}>
                  <td>
                    <span className="block">{l.ItemDescription}</span>
                    <span className="num block text-xs text-muted">{l.ItemCode}</span>
                  </td>
                  <td className="num text-right">{formatNumber(l.Quantity)}</td>
                  <td className="num text-right">{formatNumber(l.Invoiced)}</td>
                  <td className="num text-right">{l.InDispatch === null ? "—" : formatNumber(l.InDispatch)}</td>
                  <td className="num text-right">{l.InDispatch === null ? "—" : formatNumber(toProduce(l))}</td>
                  <td className="whitespace-nowrap">
                    {l.ShipDate ? <Fmt date={l.ShipDate} /> : "—"}{" "}
                    <span className={`badge ${l.Open ? "badge-warning" : "badge-success"}`}><Tr>{l.Open ? "Abierta" : "Entregada"}</Tr></span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted"><Tr>«En despacho» es lo que producción ya entregó a despacho y aún no se factura. «Por producir» es lo pedido menos lo facturado y lo que está en despacho.</Tr></p>
        </div>
      </dialog>
    </>
  );
}
