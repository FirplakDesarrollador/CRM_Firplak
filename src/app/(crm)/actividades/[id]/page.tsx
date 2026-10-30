import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { RecordHeader } from "@/components/records/RecordHeader";
import { DetailSections } from "@/components/records/DetailSections";
import { DeleteButton } from "@/components/records/DeleteButton";
import { getObjectDef, getRecord, getRecordAccess } from "@/lib/records/data";
import { ACTIVITY_STATUSES } from "@/lib/objects/picklists";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Actividad" };

export default async function ActivityDetailPage({ params }: PageProps<"/actividades/[id]">) {
  const [, { id }] = await Promise.all([requireUser(), params]);
  const def = await getObjectDef("activities");
  const row = await getRecord(def, id);
  if (!row) notFound();
  const access = await getRecordAccess("activities", row.owner_id as string | null);
  const status = String(row.status);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <RecordHeader
        def={def}
        row={row}
        title={String(row.subject)}
        badges={<span className={`badge ${status === "completed" ? "badge-success" : status === "cancelled" ? "" : "badge-warning"}`}>{ACTIVITY_STATUSES[status]}</span>}
        actions={
          <>
            {access.canEdit && <Link href={`/actividades/${id}/editar`} className="btn btn-primary"><Pencil size={15} /> Editar</Link>}
            {access.canDelete && <DeleteButton object="activities" id={id} label="esta actividad" />}
          </>
        }
      />
      <DetailSections def={def} row={row} />
    </div>
  );
}
