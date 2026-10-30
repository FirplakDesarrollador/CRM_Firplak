import type { ObjectDef } from "@/lib/objects";
import type { Row } from "@/lib/records/data";
import type { UserOption } from "@/lib/records/data";
import type { ActivityRow } from "@/components/activities/data";
import { ActivityPanel } from "@/components/activities/ActivityPanel";
import { ApprovalBar } from "@/components/approvals/ApprovalBar";
import { ApprovalHistory } from "@/components/approvals/ApprovalHistory";
import { APPROVAL_OBJECTS, findApplicableProcess, getRecordApprovals } from "@/lib/approvals/server";
import { getRecordAccess } from "@/lib/records/data";
import { canSystem } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { DetailSections } from "./DetailSections";
import { FieldHistory } from "./FieldHistory";
import { RecordHeader } from "./RecordHeader";
import { Tabs } from "./Tabs";

type Tab = { key: string; label: string; count?: number; content: React.ReactNode };

/** Ficha de registro estándar: cabecera, pestañas (Relacionado / Detalles / …) y panel de actividad. */
export async function RecordLayout({
  def,
  row,
  title,
  badges,
  actions,
  headerExtra,
  tabs = [],
  activeTab,
  basePath,
  activity,
}: {
  def: ObjectDef;
  row: Row;
  title: string;
  badges?: React.ReactNode;
  actions?: React.ReactNode;
  headerExtra?: React.ReactNode;
  tabs?: Tab[];
  activeTab?: string;
  basePath: string;
  activity?: {
    related: { account_id?: string | null; contact_id?: string | null; opportunity_id?: string | null; lead_id?: string | null; case_id?: string | null };
    items: ActivityRow[];
    users: UserOption[];
    userId: string;
    canCreate: boolean;
  } | null;
}) {
  const approvals = APPROVAL_OBJECTS.includes(def.key) ? await loadApprovals(def, row) : null;
  const allTabs: Tab[] = [
    ...tabs,
    ...(approvals?.requests.length
      ? [{ key: "aprobaciones", label: "Aprobaciones", count: approvals.requests.length, content: <ApprovalHistory requests={approvals.requests} /> }]
      : []),
    { key: "detalles", label: "Detalles", content: <DetailSections def={def} row={row} /> },
    { key: "historial", label: "Historial de cambios", content: <FieldHistory object={def.key} recordId={row.id} /> },
  ];
  const current = allTabs.find((t) => t.key === activeTab) ?? allTabs[0];

  return (
    <div className="space-y-4">
      <RecordHeader def={def} row={row} title={title} badges={badges} actions={actions}>
        {headerExtra}
        {approvals && <ApprovalBar object={def.key} recordId={row.id} path={basePath} {...approvals} />}
      </RecordHeader>
      <div className={`grid gap-4 ${activity ? "xl:grid-cols-[minmax(0,1fr)_26rem]" : ""}`}>
        <div className="min-w-0 space-y-4">
          {allTabs.length > 1 && (
            <div className="card">
              <Tabs basePath={basePath} active={current.key} tabs={allTabs.map(({ key, label, count }) => ({ key, label, count }))} />
            </div>
          )}
          {current.content}
        </div>
        {activity && (
          <ActivityPanel related={activity.related} activities={activity.items} users={activity.users}
            userId={activity.userId} canCreate={activity.canCreate} />
        )}
      </div>
    </div>
  );
}

async function loadApprovals(def: ObjectDef, row: Row) {
  const user = await getCurrentUser();
  if (!user) return null;
  const requests = await getRecordApprovals(def.key, row.id);
  const pending = requests.some((r) => r.status === "pending");
  const [process, access] = pending
    ? [null, null]
    : await Promise.all([findApplicableProcess(def.key, row, user.id), getRecordAccess(def.key, (row.owner_id as string | null) ?? null, row.id)]);
  return {
    requests,
    process,
    canSubmit: Boolean(process && access?.canEdit),
    userId: user.id,
    isAdmin: canSystem(user.access, "manage_users"),
  };
}
