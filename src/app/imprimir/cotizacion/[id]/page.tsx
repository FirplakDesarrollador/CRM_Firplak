import type { Metadata } from "next";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/session";
import { formatCurrency, formatDate, formatNumber, formatQuantityUnit } from "@/lib/format";
import wordmark from "../../../../../public/brand/firplak-wordmark-navy.png";
import { PrintButton } from "./PrintButton";

export const metadata: Metadata = { title: "Cotización" };

/** Vista imprimible de la cotización (usar "Guardar como PDF" del navegador). */
export default async function PrintQuotePage({ params }: PageProps<"/imprimir/cotizacion/[id]">) {
  const [{ id }, user] = await Promise.all([params, getCurrentUser()]);
  if (!user) redirect("/login");
  const supabase = await createClient();
  const [{ data: q }, { data: lines }] = await Promise.all([
    supabase
      .from("quotes")
      .select("*, account:accounts!quotes_account_id_fkey(name, tax_id, billing_street, billing_city, phone), contact:contacts!quotes_contact_id_fkey(full_name, email, mobile), opportunity:opportunities!quotes_opportunity_id_fkey(name), owner:profiles!quotes_owner_id_fkey(full_name, email, phone, title)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("quote_line_items")
      .select("id, description, quantity, unit_price, discount, line_total, product:products!quote_line_items_product_id_fkey(product_code, unit)")
      .eq("quote_id", id)
      .order("sort_order"),
  ]);
  if (!q) notFound();
  // La dirección de facturación viene de la cuenta; la de entrega, si no se escribió otra, es la misma.
  const billing = q.billing_address ?? ([q.account?.billing_street, q.account?.billing_city].filter(Boolean).join(", ") || null);
  const shipping = q.shipping_address ?? billing;
  const label = "text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--sage-700)]";

  return (
    <div className="min-h-dvh bg-[var(--cream-200)] py-8 print:bg-white print:py-0">
      <style>{`@page { size: letter; margin: 14mm; } @media print { body { background: #fff !important; } }
        /* Al imprimir, ningún bloque (filas, totales, condiciones, observaciones, firma) queda partido entre dos páginas. */
        .print-keep, .print-rows tr { break-inside: avoid; }`}</style>
      <div className="mx-auto mb-4 flex max-w-[52rem] justify-end print:hidden"><PrintButton /></div>
      <article className="mx-auto max-w-[52rem] rounded-[22px] bg-white p-10 text-[13px] text-[var(--ink-900)] shadow-[var(--shadow-lg)] print:max-w-none print:rounded-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b border-[rgba(29,29,27,0.14)] pb-6">
          <Image src={wordmark} alt="Firplak · inspirando hogares" width={190} height={52} priority />
          <div className="text-right">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--sage-700)]">Cotización</p>
            <p className="mt-1 text-2xl font-light tracking-tight text-[var(--navy-700)]">{q.quote_number}</p>
            <p className="mt-1 text-[var(--ink-500)]">Fecha: {formatDate(q.created_at)} · Válida hasta: {formatDate(q.expiration_date)}</p>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-x-8 gap-y-4 py-5">
          <div>
            <p className={label}>Cliente</p>
            <p className="mt-2 text-base font-medium text-[var(--navy-700)]">{q.bill_to_name ?? q.account?.name}</p>
            {q.account?.tax_id && <p>NIT {q.account.tax_id}</p>}
            {q.contact && <p className="mt-1">Atención: {q.contact.full_name}{q.contact.email ? ` · ${q.contact.email}` : ""}</p>}
          </div>
          <div>
            <p className={label}>Proyecto</p>
            <p className="mt-2 text-base font-medium text-[var(--navy-700)]">{q.name}</p>
            {q.opportunity && <p className="text-[var(--ink-500)]">{q.opportunity.name}</p>}
          </div>
          <div>
            <p className={label}>Dirección de facturación</p>
            <p className="mt-1">{billing ?? "—"}</p>
          </div>
          <div>
            <p className={label}>Dirección de entrega</p>
            <p className="mt-1">{shipping ?? "—"}</p>
          </div>
        </section>

        <table className="print-rows w-full border-collapse">
          <thead>
            <tr className="border-y border-[rgba(29,29,27,0.14)] text-left text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--ink-500)]">
              <th className="py-2 pr-2">Ref.</th><th className="py-2 pr-2">Descripción</th><th className="py-2 pr-2 text-right">Cant.</th>
              <th className="py-2 pr-2 text-right">Precio unit.</th><th className="py-2 pr-2 text-right">Desc.</th><th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {(lines ?? []).map((l) => (
              <tr key={l.id} className="border-b border-[rgba(29,29,27,0.08)] align-top">
                <td className="py-2 pr-2 text-[var(--ink-500)]">{l.product?.product_code}</td>
                <td className="py-2 pr-2">{l.description}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{formatQuantityUnit(l.quantity, l.product?.unit)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{formatCurrency(l.unit_price, q.currency)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{Number(l.discount) ? `${formatNumber(l.discount)}%` : "—"}</td>
                <td className="py-2 text-right tabular-nums">{formatCurrency(l.line_total, q.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="print-keep mt-6 flex justify-end">
          <dl className="w-72 space-y-1">
            {[
              ["Subtotal", q.subtotal],
              ["Descuentos", -Number(q.discount_total)],
              ["Total neto", q.net_total],
              [`IVA (${formatNumber(q.tax_rate)}%)`, q.tax],
              ["Flete", q.shipping],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex justify-between"><dt className="text-[var(--ink-700)]">{label}</dt><dd className="tabular-nums">{formatCurrency(Number(value), q.currency)}</dd></div>
            ))}
            <div className="mt-2 flex items-baseline justify-between border-t border-[rgba(29,29,27,0.14)] pt-2">
              <dt className="font-medium">Total</dt>
              <dd className="text-xl font-light tracking-tight text-[var(--navy-700)] tabular-nums">{formatCurrency(q.grand_total)} {q.currency ?? "COP"}</dd>
            </div>
          </dl>
        </section>

        {(q.payment_terms || q.delivery_terms || q.incoterm) && (
          <section className="print-keep mt-6 space-y-1 border-t border-[rgba(29,29,27,0.14)] pt-4">
            <p className={label}>Condiciones</p>
            {q.payment_terms && <p>Condiciones de pago: {q.payment_terms}</p>}
            {q.delivery_terms && <p>Condiciones de entrega: {q.delivery_terms}</p>}
            {q.incoterm && <p>Incoterm: {q.incoterm}</p>}
          </section>
        )}

        {q.description && (
          <section className="print-keep mt-6 space-y-1 border-t border-[rgba(29,29,27,0.14)] pt-4">
            <p className={label}>Observaciones</p>
            <p className="whitespace-pre-line">{q.description}</p>
          </section>
        )}

        <footer className="print-keep mt-8 flex items-end justify-between border-t border-[rgba(29,29,27,0.14)] pt-4 text-[var(--ink-500)]">
          <div>
            <p className="font-medium text-[var(--ink-900)]">{q.owner?.full_name}</p>
            <p>{[q.owner?.title, q.owner?.email, q.owner?.phone].filter(Boolean).join(" · ")}</p>
          </div>
          <p className="text-[11px] uppercase tracking-[0.18em]">inspirando hogares</p>
        </footer>
      </article>
    </div>
  );
}
