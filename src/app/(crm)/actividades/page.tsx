import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { ActivityViewSwitcher } from "@/components/activities/ViewSwitcher";
import { ObjectListPage } from "@/components/records/ObjectListPage";
import { ObjectIcon } from "@/components/ui/icons";
import { ActivityItem } from "@/components/activities/ActivityItem";
import { activityDate, getMyOpenActivities, getUpcomingMeetings, type ActivityRow } from "@/components/activities/data";
import { addDaysISO, formatDate, todayISO } from "@/lib/format";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Actividades" };

const weekday = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

export default async function ActivitiesPage({ searchParams }: PageProps<"/actividades">) {
  const [user, sp] = await Promise.all([requireUser(), searchParams]);
  const list = sp.vista === "lista";
  const switcher = <ActivityViewSwitcher active={list ? "lista" : "agenda"} />;

  if (list) {
    return (
      <ObjectListPage object="activities" user={user} searchParams={sp} newHref="/actividades/nueva" newLabel="Nueva actividad"
        defaultViewName="Todas las actividades" extraActions={switcher} />
    );
  }

  const today = todayISO();
  const [open, meetings] = await Promise.all([
    getMyOpenActivities(user.id, { limit: 200 }),
    getUpcomingMeetings(user.id, `${today}T00:00:00-05:00`, `${addDaysISO(today, 14)}T23:59:59-05:00`),
  ]);
  const tasks = open.filter((a) => a.activity_type !== "meeting");
  const groups: { key: string; title: string; tone?: string; items: ActivityRow[] }[] = [
    { key: "overdue", title: "Vencidas", tone: "text-danger", items: tasks.filter((a) => a.due_date && a.due_date < today) },
    { key: "today", title: "Hoy", items: tasks.filter((a) => a.due_date === today) },
    { key: "week", title: "Próximos 7 días", items: tasks.filter((a) => a.due_date && a.due_date > today && a.due_date <= addDaysISO(today, 7)) },
    { key: "later", title: "Más adelante", items: tasks.filter((a) => a.due_date && a.due_date > addDaysISO(today, 7)) },
    { key: "nodate", title: "Sin fecha", items: tasks.filter((a) => !a.due_date) },
  ];
  const byDay = new Map<string, ActivityRow[]>();
  meetings.forEach((m) => {
    const d = activityDate(m);
    byDay.set(d, [...(byDay.get(d) ?? []), m]);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ObjectIcon object="activities" />
          <div>
            <p className="eyebrow">Actividades comerciales</p>
            <h1 className="text-xl font-medium">Mi agenda</h1>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {switcher}
          {can(user.access, "activities", "create") && <Link href="/actividades/nueva" className="btn btn-primary"><Plus size={16} /> Nueva actividad</Link>}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="card">
          <div className="card-header"><h2 className="card-title">Tareas y llamadas pendientes <span className="badge">{tasks.length}</span></h2></div>
          <div className="space-y-4 px-4 pb-4 pt-2">
            {tasks.length === 0 && <p className="py-8 text-center text-sm text-muted">No tienes pendientes. ¡Buen trabajo!</p>}
            {groups.filter((g) => g.items.length).map((g) => (
              <div key={g.key}>
                <h3 className={`text-[0.7rem] font-medium uppercase tracking-[0.18em] ${g.tone ?? "text-muted"}`}>{g.title} · {g.items.length}</h3>
                <ul className="divide-y divide-[var(--border)]">{g.items.map((a) => <ActivityItem key={a.id} activity={a} />)}</ul>
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <div className="card-header"><h2 className="card-title">Reuniones · próximos 14 días <span className="badge">{meetings.length}</span></h2></div>
          <div className="space-y-4 px-4 pb-4 pt-2">
            {meetings.length === 0 && <p className="py-8 text-center text-sm text-muted">Sin reuniones agendadas.</p>}
            {[...byDay.entries()].map(([day, items]) => (
              <div key={day}>
                <h3 className={`text-[0.7rem] font-medium uppercase tracking-[0.18em] ${day === today ? "text-brand" : "text-muted"}`}>
                  {day === today ? "Hoy · " : ""}{weekday.format(new Date(`${day}T00:00:00Z`))}
                </h3>
                <ul className="divide-y divide-[var(--border)]">{items.map((a) => <ActivityItem key={a.id} activity={a} />)}</ul>
              </div>
            ))}
            <p className="text-xs text-muted">Hasta el {formatDate(addDaysISO(today, 14))}.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
