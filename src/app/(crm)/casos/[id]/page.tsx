import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { RecordLayout } from "@/components/records/RecordLayout";
import { StatusPath } from "@/components/records/StatusPath";
import { DeleteButton } from "@/components/records/DeleteButton";
import { getActivitiesFor } from "@/components/activities/data";
import { getObjectDef, getRecord, getRecordAccess, getUsers } from "@/lib/records/data";
import { CASE_STATUSES } from "@/lib/objects/picklists";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Caso" };

const PRIORITY_TONE: Record<string, string> = { Alta: "badge-danger", Media: "badge-warning", Baja: "badge-info" };

export default async function CaseDetailPage({ params, searchParams }: PageProps<"/casos/[id]">) {
  const [user, { id }, sp] = await Promise.all([requireUser(), params, searchParams]);
  const def = await getObjectDef("cases");
  const row = await getRecord(def, id);
  if (!row) notFound();
  const [access, users, activities] = await Promise.all([
    getRecordAccess("cases", row.owner_id as string | null),
    getUsers(),
    getActivitiesFor({ case_id: id }),
  ]);
  const priority = String(row.priority);

  return (
    <RecordLayout
      def={def}
      row={row}
      title={`${row.case_number} · ${row.subject}`}
      basePath={`/casos/${id}`}
      activeTab={typeof sp.tab === "string" ? sp.tab : undefined}
      badges={<span className={`badge ${PRIORITY_TONE[priority] ?? ""}`}>Prioridad {priority.toLowerCase()}</span>}
      actions={
        <>
          {access.canEdit && <Link href={`/casos/${id}/editar`} className="btn btn-primary"><Pencil size={15} /> Editar</Link>}
          {access.canDelete && <DeleteButton object="cases" id={id} label={`el caso ${row.case_number}`} />}
        </>
      }
      headerExtra={<StatusPath object="cases" id={id} options={CASE_STATUSES} current={String(row.status)} canEdit={access.canEdit} />}
      activity={{
        related: { case_id: id, account_id: (row.account_id as string | null) ?? null, contact_id: (row.contact_id as string | null) ?? null },
        items: activities,
        users,
        userId: user.id,
        canCreate: can(user.access, "activities", "create"),
      }}
    />
  );
}
