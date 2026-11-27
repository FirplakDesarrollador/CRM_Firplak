import Image from "next/image";
import { formatCurrency, formatNumber, formatQuantityUnit } from "@/lib/format";
import { COMPANY, type PrintDoc } from "@/lib/print/documento";
import wordmark from "../../../public/brand/firplak-wordmark-navy.png";
import { PrintButton } from "./PrintButton";

/**
 * Vista imprimible de una cotización o un pedido (usar «Guardar como PDF» del navegador). El mismo contenido sale
 * como archivo en `lib/print/DocumentoPdf.tsx`, para el iPhone con el CRM instalado: si cambias una, cambia la otra.
 */
export function PrintSheet({ doc, pdfUrl, fileName }: { doc: PrintDoc; pdfUrl: string; fileName: string }) {
  const label = "text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--sage-700)]";
  const rule = "border-[rgba(29,29,27,0.14)]";
  const payment = doc.payment.payment_lines.length > 0 || Boolean(doc.payment.payment_note);

  return (
    // En la app instalada en iPhone la página ocupa también la franja de la hora, y ahí los toques no llegan: el
    // botón de imprimir baja lo que mide esa franja. En el navegador env() vale 0 y no cambia nada.
    <div className="min-h-dvh bg-[var(--cream-200)] pb-8 pt-[calc(2rem+env(safe-area-inset-top,0px))] print:bg-white print:pb-0 print:pt-0">
      <style>{`@page { size: letter; margin: 14mm; } @media print { body { background: #fff !important; } }
        /* Al imprimir, ningún bloque (filas, totales, condiciones, observaciones, firma) queda partido entre dos páginas. */
        .print-keep, .print-rows tr { break-inside: avoid; }`}</style>
      <div className="mx-auto mb-4 flex max-w-[52rem] flex-wrap items-center justify-end gap-3 print:hidden">
        <PrintButton pdfUrl={pdfUrl} fileName={fileName} />
      </div>
      <article className="mx-auto max-w-[52rem] rounded-[22px] bg-white p-10 text-[13px] text-[var(--ink-900)] shadow-[var(--shadow-lg)] print:max-w-none print:rounded-none print:p-0 print:shadow-none">
        <header className={`flex items-start justify-between gap-6 border-b ${rule} pb-6`}>
          <div>
            <Image src={wordmark} alt="Firplak · inspirando hogares" width={190} height={52} priority />
            <p className="mt-2 text-[11px] text-[var(--ink-500)]">{COMPANY.taxId}</p>
          </div>
          <div className="text-right">
            <p className={label}>{doc.title}</p>
            <p className="mt-1 text-2xl font-light tracking-tight text-[var(--navy-700)]">{doc.number}</p>
            <p className="mt-1 text-[var(--ink-500)]">{doc.dateLine}</p>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-x-8 gap-y-4 py-5">
          <div>
            <p className={label}>Cliente</p>
            <p className="mt-2 text-base font-medium text-[var(--navy-700)]">{doc.customer.name}</p>
            {doc.customer.lines.map((line) => <p key={line}>{line}</p>)}
          </div>
          <div>
            <p className={label}>Proyecto</p>
            <p className="mt-2 text-base font-medium text-[var(--navy-700)]">{doc.project.name}</p>
            {doc.project.lines.map((line) => <p key={line} className="text-[var(--ink-500)]">{line}</p>)}
          </div>
          <div>
            <p className={label}>Dirección de facturación</p>
            {doc.billing.map((line) => <p key={line} className="mt-1">{line}</p>)}
          </div>
          <div>
            <p className={label}>Entrega</p>
            {doc.delivery.map((line) => <p key={line} className="mt-1">{line}</p>)}
          </div>
        </section>

        {(doc.contacts.length > 0 || doc.logistics.length > 0) && (
          <section className={`print-keep grid grid-cols-2 gap-x-8 gap-y-4 border-t ${rule} py-5`}>
            {doc.contacts.length > 0 && (
              <div>
                <p className={label}>Contactos del cliente</p>
                {doc.contacts.map((c) => (
                  <p key={`${c.role}-${c.name}`} className="mt-1">
                    <span className="text-[var(--ink-500)]">{c.role}:</span> <span className="font-medium">{c.name}</span>
                    {c.detail && <span className="text-[var(--ink-500)]"> · {c.detail}</span>}
                  </p>
                ))}
              </div>
            )}
            {doc.logistics.length > 0 && (
              <div>
                <p className={label}>Despacho</p>
                {doc.logistics.map(([name, value]) => (
                  <p key={name} className="mt-1"><span className="text-[var(--ink-500)]">{name}:</span> {value}</p>
                ))}
              </div>
            )}
          </section>
        )}

        <table className="print-rows w-full border-collapse">
          <thead>
            <tr className={`border-y ${rule} text-left text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--ink-500)]`}>
              <th className="py-2 pr-2">Ref.</th><th className="py-2 pr-2">Descripción</th><th className="py-2 pr-2 text-right">Cant.</th>
              <th className="py-2 pr-2 text-right">Precio unit.</th><th className="py-2 pr-2 text-right">Desc.</th><th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((l) => (
              <tr key={l.id} className="border-b border-[rgba(29,29,27,0.08)] align-top">
                <td className="py-2 pr-2 text-[var(--ink-500)]">{l.code}</td>
                <td className="py-2 pr-2">{l.description}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{l.unit ? formatQuantityUnit(l.quantity, l.unit) : formatNumber(l.quantity)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{formatCurrency(l.unitPrice, doc.currency)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{l.discount ? `${formatNumber(l.discount)}%` : "—"}</td>
                <td className="py-2 text-right tabular-nums">{formatCurrency(l.total, doc.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="print-keep mt-6 flex items-start justify-between gap-8">
          <div className="min-w-0 flex-1">
            {payment && (
              <>
                <p className={label}>Forma de pago y consignación</p>
                {doc.payment.payment_lines.map((line) => <p key={line} className="mt-1">{line}</p>)}
                {doc.payment.payment_note && <p className="mt-1 text-[var(--ink-500)]">{doc.payment.payment_note}</p>}
              </>
            )}
          </div>
          <dl className="w-72 shrink-0 space-y-1">
            {doc.totals.map(([name, value]) => (
              <div key={name} className="flex justify-between"><dt className="text-[var(--ink-700)]">{name}</dt><dd className="tabular-nums">{formatCurrency(value, doc.currency)}</dd></div>
            ))}
            <div className={`mt-2 flex items-baseline justify-between border-t ${rule} pt-2`}>
              <dt className="font-medium">Total</dt>
              <dd className="text-xl font-light tracking-tight text-[var(--navy-700)] tabular-nums">{formatCurrency(doc.grandTotal)} {doc.currency}</dd>
            </div>
          </dl>
        </section>

        {doc.terms.length > 0 && (
          <section className={`print-keep mt-6 space-y-1 border-t ${rule} pt-4`}>
            <p className={label}>Condiciones</p>
            {doc.terms.map((line) => <p key={line}>{line}</p>)}
          </section>
        )}

        {doc.notes && (
          <section className={`print-keep mt-6 space-y-1 border-t ${rule} pt-4`}>
            <p className={label}>Observaciones</p>
            <p className="whitespace-pre-line">{doc.notes}</p>
          </section>
        )}

        <section className={`print-keep mt-8 grid grid-cols-2 gap-x-8 border-t ${rule} pt-4`}>
          <div>
            <p className={label}>Aceptado por el cliente</p>
            <p className={`mt-9 border-t ${rule} pt-1 text-[var(--ink-500)]`}>Firma · C.C. o NIT · Fecha</p>
          </div>
          <div>
            <p className={label}>Asesor comercial</p>
            <p className="mt-2 font-medium">{doc.owner.name}</p>
            {doc.owner.detail && <p className="text-[var(--ink-500)]">{doc.owner.detail}</p>}
          </div>
        </section>

        <footer className={`print-keep mt-8 space-y-1 border-t ${rule} pt-3 text-center text-[10px] leading-snug text-[var(--ink-500)]`}>
          <p>{COMPANY.privacy}</p>
          <p className="font-medium uppercase tracking-[0.08em]">{COMPANY.withholding}</p>
          <p>{COMPANY.address}</p>
        </footer>
      </article>
    </div>
  );
}
