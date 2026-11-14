"use client";

import { useRef } from "react";
import { X } from "lucide-react";
import { Fmt } from "@/components/ui/Fmt";
import { Tr } from "@/components/ui/Tr";
import { formatNumber } from "@/lib/format";
import type { SapOrderLine } from "@/lib/sap/types";

/** Número del pedido que abre una ventana con sus líneas: cada una puede tener su propia fecha de despacho. */
export function SapOrderLines({ docNum, lines }: { docNum: number; lines: SapOrderLine[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  if (!lines.length) return <>{docNum}</>;
  return (
    <>
      <button type="button" className="link num" onClick={() => ref.current?.showModal()} aria-haspopup="dialog">{docNum}</button>
      <dialog ref={ref} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
        className="m-auto w-[min(60rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-0 text-ink shadow-[var(--shadow-lg)]">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="text-lg font-medium"><Tr>Pedido</Tr> <span className="num">{docNum}</span> · <Tr>líneas y despachos</Tr></h2>
          <button type="button" className="btn btn-sm" onClick={() => ref.current?.close()} aria-label="Cerrar"><X size={15} /></button>
        </div>
        <div className="max-h-[70vh] overflow-auto p-5">
          <table className="table">
            <thead>
              <tr>
                <th><Tr>Código</Tr></th><th><Tr>Descripción</Tr></th>
                <th className="text-right"><Tr>Pedida</Tr></th><th className="text-right"><Tr>Facturada</Tr></th>
                <th className="text-right"><Tr>En despacho</Tr></th><th className="text-right"><Tr>Por producir</Tr></th>
                <th><Tr>Fecha plan despacho</Tr></th><th><Tr>Estado</Tr></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.Line} className={l.Open ? undefined : "text-muted"}>
                  <td className="num whitespace-nowrap">{l.ItemCode}</td>
                  <td>{l.ItemDescription}</td>
                  <td className="num text-right">{formatNumber(l.Quantity)}</td>
                  <td className="num text-right">{formatNumber(l.Invoiced)}</td>
                  <td className="num text-right">{l.InDispatch === null ? "—" : formatNumber(l.InDispatch)}</td>
                  <td className="num text-right">{l.InDispatch === null ? "—" : formatNumber(Math.max(0, l.Quantity - l.Invoiced - l.InDispatch))}</td>
                  <td className="whitespace-nowrap">{l.ShipDate ? <Fmt date={l.ShipDate} /> : "—"}</td>
                  <td><span className={`badge ${l.Open ? "badge-warning" : "badge-success"}`}><Tr>{l.Open ? "Abierta" : "Entregada"}</Tr></span></td>
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
