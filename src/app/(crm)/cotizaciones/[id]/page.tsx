import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Printer } from "lucide-react";
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

import { Tr } from "@/components/ui/Tr";
export const metadata: Metadata = { title: "Cotización" };

export default async function QuoteDetailPage({ params, searchParams }: PageProps<"/cotizaciones/[id]">) {
  const [, { id }, sp] = await Promise.all([requireUser(), params, searchParams]);
  const def = await getObjectDef("quotes");
  const row = await getRecord(def, id);
  if (!row) notFound();
  const supabase = await createClient();
  const [access, { data: lines }] = await Promise.all([
    getRecordAccess("quotes", row.owner_id as string | null, row.id),
    supabase
      .from("quote_line_items")
      .select("id, description, quantity, unit_price, discount, line_total, product:products!quote_line_items_product_id_fkey(id, name, product_code, unit)")
      .eq("quote_id", id)
      .order("sort_order"),
  ]);

  return (
    <RecordLayout
      def={def}
      row={row}
      title={`${row.quote_number} · ${row.name}`}
      basePath={`/cotizaciones/${id}`}
      activeTab={typeof sp.tab === "string" ? sp.tab : undefined}
      badges={row.is_synced ? <span className="badge badge-success"><Tr>Sincronizada</Tr></span> : null}
      actions={
        <>
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
            <QuoteLines quoteId={id} lines={(lines ?? []) as unknown as QuoteLine[]} canEdit={access.canEdit} />
            <QuoteTotals q={row} />
          </div>
        ),
      }]}
      activity={null}
    />
  );
}
