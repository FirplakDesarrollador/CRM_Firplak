import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardList, Pencil, Printer, RefreshCw } from "lucide-react";
import { ActionForm } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { createOrderFromQuote } from "@/lib/orders/actions";
import { renewQuote } from "@/lib/records/phase2-actions";
import { formatDate, todayISO } from "@/lib/format";
import { can } from "@/lib/permissions";
import { RecordLayout } from "@/components/records/RecordLayout";
import { StatusPath } from "@/components/records/StatusPath";
import { DeleteButton } from "@/components/records/DeleteButton";
import { QuoteLines, type QuoteLine } from "@/components/quotes/QuoteLines";
import { QuoteTotals } from "@/components/quotes/QuoteTotals";
import { DeliveryMonths } from "@/components/quotes/DeliveryMonths";
import { PartialDeliveries } from "@/components/quotes/PartialDeliveries";
import { getObjectDef, getRecord, getRecordAccess } from "@/lib/records/data";
import { createClient } from "@/lib/supabase/server";
import { QUOTE_STATUSES } from "@/lib/objects/picklists";
import { requireUser } from "@/lib/session";
import { getT } from "@/lib/i18n/server";
import { Alert } from "@/components/ui/Alert";
import { CartCleared } from "@/components/products/Cart";

import { Tr } from "@/components/ui/Tr";
export const metadata: Metadata = { title: "Cotización" };

export default async function QuoteDetailPage({ params, searchParams }: PageProps<"/cotizaciones/[id]">) {
  const [user, { id }, sp] = await Promise.all([requireUser(), params, searchParams]);
  const def = await getObjectDef("quotes");
  const row = await getRecord(def, id);
  if (!row) notFound();
  const supabase = await createClient();
  const [access, { data: lines }, { data: order }, { data: account }, { data: offline }, { data: renewal }, t] = await Promise.all([
    getRecordAccess("quotes", row.owner_id as string | null, row.id),
    supabase
      .from("quote_line_items")
      .select("id, description, quantity, unit_price, discount, line_total, not_listed, delivery_date, product:products!quote_line_items_product_id_fkey(id, name, product_code, unit)")
      .eq("quote_id", id)
      .order("sort_order"),
    supabase.from("orders").select("id, order_number").eq("quote_id", id).maybeSingle(),
    supabase.from("accounts").select("name, market, billing_cutoff_day").eq("id", String(row.account_id ?? "")).maybeSingle(),
    // Las líneas cotizadas sin señal a otro precio. Va aparte: si la columna aún no existe en la base, la
    // cotización se sigue viendo completa, solo sin la marca.
    supabase.from("quote_line_items").select("id, offline_list_price").eq("quote_id", id).not("offline_list_price", "is", null),
    // La cotización que renovó a esta (esta quedó Reemplazada).
    supabase.from("quotes").select("id, quote_number").eq("renewed_from_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    getT(),
  ]);
  const offlinePrices = new Map((offline ?? []).map((line) => [line.id, Number(line.offline_list_price)]));
  const quoteLines = ((lines ?? []) as unknown as QuoteLine[]).map((line) => (offlinePrices.has(line.id) ? { ...line, offline_list_price: offlinePrices.get(line.id) } : line));
  // La cuenta cambió de mercado y este borrador quedó en la moneda y la lista anteriores (tiene productos).
  const market = account?.market === "Internacional" ? "Internacional" : "Nacional";
  const marketCurrency = market === "Internacional" ? "USD" : "COP";
  const stale = row.status === "Borrador" && account && row.currency !== marketCurrency;
  const staleText = t("La cuenta «{cuenta}» ahora es del mercado {mercado} ({moneda}) y esta cotización sigue en {moneda_cotizacion} con la lista «{lista}». Quita sus productos para pasarla a la lista nueva, o crea otra cotización.")
    .replace("{cuenta}", String(account?.name ?? "")).replace("{mercado}", t(market)).replace("{moneda}", marketCurrency)
    .replace("{moneda_cotizacion}", String(row.currency)).replace("{lista}", String((row.price_book as { name?: string } | null)?.name ?? "—"));
  const canOrder = !order && row.status === "Aceptada" && can(user.access, "orders", "create");
  // Vencida: sigue abierta y ya pasó su «Válida hasta». No se puede aceptar; se renueva (con los precios de hoy).
  const expired = ["Borrador", "En revisión", "Aprobada", "Presentada"].includes(String(row.status)) && String(row.expiration_date ?? "9999") < todayISO();
  const canRenew = expired && access.canEdit && row.status !== "En revisión";
  const expiredText = t("Esta cotización venció el {fecha} y ya no se puede aceptar. Al renovarla se crea otra con fecha de hoy y los precios de la lista vigente (las tipologías conservan su valor), y esta queda como Reemplazada.")
    .replace("{fecha}", formatDate(String(row.expiration_date)));

  return (
    <RecordLayout
      def={def}
      row={row}
      title={`${row.quote_number} · ${row.name}`}
      basePath={`/cotizaciones/${id}`}
      activeTab={typeof sp.tab === "string" ? sp.tab : undefined}
      badges={
        <>
          {expired && <span className="badge badge-danger"><Tr>Vencida</Tr></span>}
          {row.split_from ? (
            <Link href={`/cotizaciones/${(row.split_from as { id: string }).id}`} className="badge badge-info no-underline">
              <Tr>Entrega separada de</Tr> {(row.split_from as { quote_number: string }).quote_number}
            </Link>
          ) : null}
          {renewal && <Link href={`/cotizaciones/${renewal.id}`} className="badge badge-info no-underline"><Tr>Renovada en</Tr> {renewal.quote_number}</Link>}
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
          {canRenew && (
            <ActionForm action={renewQuote.bind(null, id)} className="flex flex-col items-end gap-1">
              <SubmitButton className="btn btn-primary" pendingText="Renovando…"><RefreshCw size={15} /> <Tr>Renovar</Tr></SubmitButton>
            </ActionForm>
          )}
          <Link href={`/imprimir/cotizacion/${id}`} target="_blank" className="btn"><Printer size={15} /> <Tr>Imprimir / PDF</Tr></Link>
          {access.canEdit && <Link href={`/cotizaciones/${id}/editar`} className="btn btn-primary"><Pencil size={15} /> <Tr>Editar</Tr></Link>}
          {access.canDelete && <DeleteButton object="quotes" id={id} label={`la cotización ${row.quote_number}`} />}
        </>
      }
      headerExtra={
        <StatusPath object="quotes" id={id} options={QUOTE_STATUSES} current={String(row.status)} canEdit={access.canEdit} negative={["Rechazada", "Reemplazada"]} />
      }
      tabs={[{
        key: "lineas",
        label: "Productos",
        count: lines?.length ?? 0,
        content: (
          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_20rem]">
            {typeof sp.seleccion === "string" && (
              <div className="space-y-2 2xl:col-span-2">
                <CartCleared />
                <Alert tone="success">{t("Se agregaron {n} productos de tu selección, con el precio de la lista de esta cotización.").replace("{n}", String(Number(sp.seleccion) || 0))}</Alert>
                {typeof sp.sin_precio === "string" && sp.sin_precio && (
                  <Alert tone="warning">{t("No se agregaron por no tener precio en la lista de esta cotización:")} {sp.sin_precio}</Alert>
                )}
              </div>
            )}
            {typeof sp.separada === "string" && (
              <div className="2xl:col-span-2">
                <Alert tone="success">
                  {t(sp.separada === "aceptada"
                    ? "Esta es la entrega que aceptó el cliente, ya separada y Aceptada: desde aquí puedes crear el pedido. La cotización original sigue abierta con las demás entregas."
                    : "Esta es la entrega separada. La cotización original sigue con las demás entregas.")}
                </Alert>
              </div>
            )}
            {expired && <div className="2xl:col-span-2"><Alert tone="warning">{expiredText}</Alert></div>}
            {stale && <div className="2xl:col-span-2"><Alert tone="warning">{staleText}</Alert></div>}
            <div className="min-w-0 space-y-4">
              <PartialDeliveries quoteId={id} lines={quoteLines} quoteDate={(row.delivery_date as string | null) ?? null}
                canEdit={access.canEdit} currency={String(row.currency ?? "COP")} status={String(row.status)} />
              <QuoteLines quoteId={id} lines={quoteLines} canEdit={access.canEdit} currency={String(row.currency ?? "COP")}
                allowFree={row.sale_type === "Carpintería de Obra"} />
            </div>
            <div className="space-y-4">
              <QuoteTotals q={row} />
              <DeliveryMonths lines={quoteLines} quoteDate={(row.delivery_date as string | null) ?? null}
                cutoffDay={account?.billing_cutoff_day ?? null} currency={String(row.currency ?? "COP")} />
            </div>
          </div>
        ),
      }]}
      activity={null}
    />
  );
}
