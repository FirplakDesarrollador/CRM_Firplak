import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardList, Pencil, Printer } from "lucide-react";
import { ActionForm } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { createOrderFromQuote } from "@/lib/orders/actions";
import { can } from "@/lib/permissions";
import { RecordLayout } from "@/components/records/RecordLayout";
import { StatusPath } from "@/components/records/StatusPath";
import { DeleteButton } from "@/components/records/DeleteButton";
import { QuoteLines, type QuoteLine } from "@/components/quotes/QuoteLines";
import { QuoteTotals } from "@/components/quotes/QuoteTotals";
import { SyncButton } from "@/components/quotes/SyncButton";
import { getObjectDef, getRecord, getRecordAccess } from "@/lib/records/data";
import { createClient } from "@/lib/supabase/server";
import { QUOTE_STATUSES } from "@/lib/objects/picklists";
import { requireUser } from "@/lib/session";
import { getT } from "@/lib/i18n/server";
import { Alert } from "@/components/ui/Alert";

import { Tr } from "@/components/ui/Tr";
export const metadata: Metadata = { title: "Cotización" };

export default async function QuoteDetailPage({ params, searchParams }: PageProps<"/cotizaciones/[id]">) {
  const [user, { id }, sp] = await Promise.all([requireUser(), params, searchParams]);
  const def = await getObjectDef("quotes");
  const row = await getRecord(def, id);
  if (!row) notFound();
  const supabase = await createClient();
  const [access, { data: lines }, { data: order }, { data: account }, t] = await Promise.all([
    getRecordAccess("quotes", row.owner_id as string | null, row.id),
    supabase
      .from("quote_line_items")
      .select("id, description, quantity, unit_price, discount, line_total, not_listed, product:products!quote_line_items_product_id_fkey(id, name, product_code, unit)")
      .eq("quote_id", id)
      .order("sort_order"),
    supabase.from("orders").select("id, order_number").eq("quote_id", id).maybeSingle(),
    supabase.from("accounts").select("name, market").eq("id", String(row.account_id ?? "")).maybeSingle(),
    getT(),
  ]);
  // La cuenta cambió de mercado y este borrador quedó en la moneda y la lista anteriores (tiene productos).
  const market = account?.market === "Internacional" ? "Internacional" : "Nacional";
  const marketCurrency = market === "Internacional" ? "USD" : "COP";
  const stale = row.status === "Borrador" && account && row.currency !== marketCurrency;
  const staleText = t("La cuenta «{cuenta}» ahora es del mercado {mercado} ({moneda}) y esta cotización sigue en {moneda_cotizacion} con la lista «{lista}». Quita sus productos para pasarla a la lista nueva, o crea otra cotización.")
    .replace("{cuenta}", String(account?.name ?? "")).replace("{mercado}", t(market)).replace("{moneda}", marketCurrency)
    .replace("{moneda_cotizacion}", String(row.currency)).replace("{lista}", String((row.price_book as { name?: string } | null)?.name ?? "—"));
  const canOrder = !order && row.status === "Aceptada" && can(user.access, "orders", "create");

  return (
    <RecordLayout
      def={def}
      row={row}
      title={`${row.quote_number} · ${row.name}`}
      basePath={`/cotizaciones/${id}`}
      activeTab={typeof sp.tab === "string" ? sp.tab : undefined}
      badges={
        <>
          {row.is_synced ? <span className="badge badge-success"><Tr>Sincronizada</Tr></span> : null}
          {order && <Link href={`/pedidos/${order.id}`} className="badge badge-info no-underline"><Tr>Pedido</Tr> {order.order_number}</Link>}
        </>
      }
      actions={
        <>
          {canOrder && (
            <ActionForm action={createOrderFromQuote.bind(null, id)} className="flex flex-col items-end gap-1">
              <SubmitButton className="btn btn-primary" pendingText="Creando…"><ClipboardList size={15} /> <Tr>Crear pedido</Tr></SubmitButton>
            </ActionForm>
          )}
          <Link href={`/imprimir/cotizacion/${id}`} target="_blank" className="btn"><Printer size={15} /> <Tr>Imprimir / PDF</Tr></Link>
          {access.canEdit && <SyncButton quoteId={id} synced={Boolean(row.is_synced)} />}
          {access.canEdit && <Link href={`/cotizaciones/${id}/editar`} className="btn btn-primary"><Pencil size={15} /> <Tr>Editar</Tr></Link>}
          {access.canDelete && <DeleteButton object="quotes" id={id} label={`la cotización ${row.quote_number}`} />}
        </>
      }
      headerExtra={
        <StatusPath object="quotes" id={id} options={QUOTE_STATUSES} current={String(row.status)} canEdit={access.canEdit} negative={["Rechazada"]} />
      }
      tabs={[{
        key: "lineas",
        label: "Productos",
        count: lines?.length ?? 0,
        content: (
          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_20rem]">
            {stale && <div className="2xl:col-span-2"><Alert tone="warning">{staleText}</Alert></div>}
            <QuoteLines quoteId={id} lines={(lines ?? []) as unknown as QuoteLine[]} canEdit={access.canEdit} currency={String(row.currency ?? "COP")} />
            <QuoteTotals q={row} />
          </div>
        ),
      }]}
      activity={null}
    />
  );
}
