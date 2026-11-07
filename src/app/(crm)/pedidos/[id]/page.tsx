import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { RecordLayout } from "@/components/records/RecordLayout";
import { StatusPath } from "@/components/records/StatusPath";
import { DeleteButton } from "@/components/records/DeleteButton";
import { QuoteLines, type QuoteLine } from "@/components/quotes/QuoteLines";
import { QuoteTotals } from "@/components/quotes/QuoteTotals";
import { Tr } from "@/components/ui/Tr";
import { getObjectDef, getRecord, getRecordAccess } from "@/lib/records/data";
import { createClient } from "@/lib/supabase/server";
import { ORDER_STATUSES } from "@/lib/objects/picklists";
import { requireUser } from "@/lib/session";
import { sapConfigured } from "@/lib/sap/client";
import { SapOrderCard } from "@/components/sap/SapOrderCard";

export const metadata: Metadata = { title: "Pedido" };

export default async function OrderDetailPage({ params, searchParams }: PageProps<"/pedidos/[id]">) {
  const [, { id }, sp] = await Promise.all([requireUser(), params, searchParams]);
  const def = await getObjectDef("orders");
  const row = await getRecord(def, id);
  if (!row) notFound();
  const supabase = await createClient();
  const [access, { data: lines }] = await Promise.all([
    getRecordAccess("orders", row.owner_id as string | null, row.id),
    supabase
      .from("order_items")
      .select("id, description, quantity, unit_price, discount, line_total, product:products!order_items_product_id_fkey(id, name, product_code, unit)")
      .eq("order_id", id)
      .order("sort_order"),
  ]);
  const status = String(row.status);
  const draft = status === "Borrador";
  // Un pedido activado no vuelve a borrador; uno en borrador puede cancelarse o activarse.
  const statuses = draft ? ORDER_STATUSES : ORDER_STATUSES.filter((s) => s !== "Borrador");

  return (
    <RecordLayout
      def={def}
      row={row}
      title={`${row.order_number} · ${row.name}`}
      basePath={`/pedidos/${id}`}
      activeTab={typeof sp.tab === "string" ? sp.tab : undefined}
      badges={draft ? <span className="badge badge-warning"><Tr>Productos editables</Tr></span> : null}
      actions={
        <>
          {access.canEdit && <Link href={`/pedidos/${id}/editar`} className="btn btn-primary"><Pencil size={15} /> <Tr>Editar</Tr></Link>}
          {access.canDelete && (draft || status === "Cancelado") && <DeleteButton object="orders" id={id} label={`el pedido ${row.order_number}`} />}
        </>
      }
      headerExtra={
        <StatusPath object="orders" id={id} options={statuses} current={status} canEdit={access.canEdit} negative={["Cancelado"]} />
      }
      tabs={[{
        key: "productos",
        label: "Productos",
        count: lines?.length ?? 0,
        content: (
          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_20rem]">
            <QuoteLines kind="order" quoteId={id} lines={(lines ?? []) as unknown as QuoteLine[]} canEdit={access.canEdit && draft} currency={String(row.currency ?? "COP")} />
            <QuoteTotals q={row} />
          </div>
        ),
      }, ...(sapConfigured() ? [{
        key: "sap",
        label: "SAP",
        content: <SapOrderCard canEdit={access.canEdit} order={{
          id, status, sap_quotation_entry: (row.sap_quotation_entry as number | null) ?? null, sap_quotation_num: (row.sap_quotation_num as number | null) ?? null,
          sap_sent_at: (row.sap_sent_at as string | null) ?? null, sap_error: (row.sap_error as string | null) ?? null,
        }} />,
      }] : [])]}
      activity={null}
    />
  );
}
