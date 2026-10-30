import type { ActivityRow } from "./data";
import { activityDate } from "./data";
import { ActivityItem } from "./ActivityItem";
import { todayISO } from "@/lib/format";

import { Tr } from "@/components/ui/Tr";
/** Línea de tiempo: primero lo pendiente (vencido, próximo) y luego el historial. */
export function Timeline({ activities, showRelated = false }: { activities: ActivityRow[]; showRelated?: boolean }) {
  const today = todayISO();
  const open = activities.filter((a) => ["pending", "in_progress"].includes(a.status) && ["task", "call", "meeting"].includes(a.activity_type));
  const past = activities.filter((a) => !open.includes(a));
  open.sort((a, b) => activityDate(a).localeCompare(activityDate(b)));
  past.sort((a, b) => activityDate(b).localeCompare(activityDate(a)));
  const overdue = open.filter((a) => activityDate(a) < today);
  const upcoming = open.filter((a) => activityDate(a) >= today);

  if (!activities.length) {
    return <p className="py-8 text-center text-sm text-muted"><Tr>Aún no hay actividades. Registra la primera llamada, reunión o tarea.</Tr></p>;
  }

  return (
    <div className="space-y-4">
      {overdue.length > 0 && <Group title="Vencidas" tone="text-danger" items={overdue} showRelated={showRelated} />}
      {upcoming.length > 0 && <Group title="Próximas" items={upcoming} showRelated={showRelated} />}
      {past.length > 0 && <Group title="Historial" items={past} showRelated={showRelated} />}
    </div>
  );
}

function Group({ title, items, tone = "text-muted", showRelated }: { title: string; items: ActivityRow[]; tone?: string; showRelated: boolean }) {
  return (
    <div>
      <h3 className={`text-[0.7rem] font-medium uppercase tracking-[0.18em] ${tone}`}>{title} · {items.length}</h3>
      <ul className="divide-y divide-[var(--border)]">
        {items.map((a) => <ActivityItem key={a.id} activity={a} showRelated={showRelated} />)}
      </ul>
    </div>
  );
}
