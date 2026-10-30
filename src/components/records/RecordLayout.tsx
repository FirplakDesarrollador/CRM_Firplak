import type { ObjectDef } from "@/lib/objects";
import type { Row } from "@/lib/records/data";
import type { UserOption } from "@/lib/records/data";
import type { ActivityRow } from "@/components/activities/data";
import { ActivityPanel } from "@/components/activities/ActivityPanel";
import { DetailSections } from "./DetailSections";
import { FieldHistory } from "./FieldHistory";
import { RecordHeader } from "./RecordHeader";
import { Tabs } from "./Tabs";

type Tab = { key: string; label: string; count?: number; content: React.ReactNode };

/** Ficha de registro estándar: cabecera, pestañas (Relacionado / Detalles / …) y panel de actividad. */
export function RecordLayout({
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
  const allTabs: Tab[] = [
    ...tabs,
    { key: "detalles", label: "Detalles", content: <DetailSections def={def} row={row} /> },
    { key: "historial", label: "Historial de cambios", content: <FieldHistory object={def.key} recordId={row.id} /> },
  ];
  const current = allTabs.find((t) => t.key === activeTab) ?? allTabs[0];

  return (
    <div className="space-y-4">
      <RecordHeader def={def} row={row} title={title} badges={badges} actions={actions}>
        {headerExtra}
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
