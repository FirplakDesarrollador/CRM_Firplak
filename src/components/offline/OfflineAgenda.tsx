"use client";

import { Clock, MapPin, Plus } from "lucide-react";
import { ACTIVITY_ICONS } from "@/components/ui/icons";
import { ACTIVITY_STATUSES, ACTIVITY_TYPES, PRIORITIES } from "@/lib/objects/picklists";
import { addDaysISO, dayISO, formatDate, formatDateTime, formatTime, relativeDays, todayISO, type DateLocale } from "@/lib/format";
import { useLocale, useT } from "@/lib/i18n/client";
import type { OfflineActivity, OutboxItem } from "@/lib/offline/types";
import { LocalActivityList } from "./OfflineOutbox";
import { ClientLink, EmptyRow, Section, TYPE_TONE } from "./parts";
import { go } from "./route";

const WEEKDAYS: Record<DateLocale, string[]> = {
  es: ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};

/** Día (en Colombia) en que cae la actividad: el de su hora de inicio o, si no tiene, el de vencimiento. */
const dayOf = (a: OfflineActivity) => (a.start_at ? dayISO(a.start_at) : a.due_date);

export type AgendaGroup = { key: string; day: string | null; overdue: boolean; items: OfflineActivity[] };

/**
 * La agenda por días, calculada con la fecha de hoy y no con la del día de la descarga: lo que quedó pendiente de
 * ayer aparece como vencido aunque no se haya vuelto a descargar.
 */
export function agendaGroups(activities: OfflineActivity[], today = todayISO()): AgendaGroup[] {
  const overdue: OfflineActivity[] = [];
  const undated: OfflineActivity[] = [];
  const byDay = new Map<string, OfflineActivity[]>();
  for (const a of activities) {
    const day = dayOf(a);
    const open = a.status === "pending" || a.status === "in_progress";
    if (!day) {
      if (open) undated.push(a);
    } else if (day < today) {
      if (open) overdue.push(a); // una reunión pasada y ya cumplida no es agenda
    } else {
      byDay.set(day, [...(byDay.get(day) ?? []), a]);
    }
  }
  const groups: AgendaGroup[] = [];
  if (overdue.length > 0) groups.push({ key: "vencidas", day: null, overdue: true, items: overdue });
  for (const day of [...byDay.keys()].sort()) groups.push({ key: day, day, overdue: false, items: byDay.get(day)! });
  if (undated.length > 0) groups.push({ key: "sin-fecha", day: null, overdue: false, items: undated });
  return groups;
}

function ActivityRow({ activity, overdue, known, showClient }: { activity: OfflineActivity; overdue: boolean; known: Set<string>; showClient: boolean }) {
  const t = useT();
  const locale = useLocale();
  const Icon = ACTIVITY_ICONS[activity.activity_type];
  const done = activity.status === "completed";
  let when = "";
  if (activity.start_at) {
    when = `${overdue ? formatDateTime(activity.start_at, locale) : formatTime(activity.start_at, locale)}${activity.end_at ? ` – ${formatTime(activity.end_at, locale)}` : ""}`;
  } else if (overdue && activity.due_date) {
    when = `${formatDate(activity.due_date, locale)} · ${relativeDays(activity.due_date, locale)}`;
  }
  const related = [activity.contact_name, activity.opportunity_name, activity.lead_name].filter(Boolean).join(" · ");
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span className={`mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full ${TYPE_TONE[activity.activity_type] ?? TYPE_TONE.note}`}>
        {Icon && <Icon size={15} aria-hidden="true" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`font-semibold ${done ? "text-muted line-through" : ""}`}>{activity.subject}</p>
        <p className={`mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs ${overdue ? "font-semibold text-danger" : "text-muted"}`}>
          <span className="inline-flex items-center gap-1">
            <Clock size={12} aria-hidden="true" /> {t(ACTIVITY_TYPES[activity.activity_type] ?? activity.activity_type)}{when ? ` · ${when}` : ""}
          </span>
          {activity.location && <span className="inline-flex items-center gap-1 font-normal text-muted"><MapPin size={12} aria-hidden="true" /> {activity.location}</span>}
        </p>
        {activity.description && <p className="mt-1 line-clamp-2 text-sm text-ink-2">{activity.description}</p>}
        {((showClient && activity.account_name) || related) && (
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
            {showClient && <ClientLink id={activity.account_id} name={activity.account_name} known={activity.account_id !== null && known.has(activity.account_id)} />}
            {related && <span>{related}</span>}
          </p>
        )}
      </div>
      <div className="flex flex-none flex-col items-end gap-1">
        {activity.priority === "high" && !done && <span className="badge badge-danger">{t(PRIORITIES.high)}</span>}
        {done && <span className="badge badge-success">{t(ACTIVITY_STATUSES.completed)}</span>}
      </div>
    </li>
  );
}

/** Lista de actividades de un grupo (se usa también en la ficha del cliente). */
export function ActivityList({ groups, known, showClient = true }: { groups: AgendaGroup[]; known: Set<string>; showClient?: boolean }) {
  return (
    <ul className="divide-y divide-[var(--border)]">
      {groups.flatMap((group) => group.items.map((a) => <ActivityRow key={a.id} activity={a} overdue={group.overdue} known={known} showClient={showClient} />))}
    </ul>
  );
}

export function groupTitle(group: AgendaGroup, today: string, locale: DateLocale, t: (es: string) => string) {
  if (group.overdue) return t("Vencidas");
  if (!group.day) return t("Sin fecha");
  if (group.day === today) return t("Hoy");
  if (group.day === addDaysISO(today, 1)) return t("Mañana");
  const weekday = WEEKDAYS[locale][new Date(`${group.day}T12:00:00Z`).getUTCDay()];
  return `${weekday}, ${formatDate(group.day, locale)}`;
}

export function OfflineAgenda({ activities, known, local, names, canCreate }: {
  activities: OfflineActivity[];
  known: Set<string>;
  /** Actividades registradas sin señal en este dispositivo. */
  local: OutboxItem[];
  names: Map<string, string>;
  canCreate: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const today = todayISO();
  const groups = agendaGroups(activities, today);
  return (
    <>
      {canCreate && (
        <button type="button" className="btn btn-primary self-start" onClick={() => go({ f: "actividad", e: null }, true)}>
          <Plus size={15} aria-hidden="true" /> {t("Registrar actividad")}
        </button>
      )}
      {local.length > 0 && (
        <Section title={t("Registradas sin señal")} count={local.length}>
          <LocalActivityList items={local} names={names} />
        </Section>
      )}
      {groups.length === 0 && (
        <section className="card">
          <ul><EmptyRow>{t("No tienes actividades pendientes ni reuniones en los próximos 7 días.")}</EmptyRow></ul>
        </section>
      )}
      {groups.map((group) => (
        <Section key={group.key} title={groupTitle(group, today, locale, t)} count={group.items.length}>
          <ActivityList groups={[group]} known={known} />
        </Section>
      ))}
    </>
  );
}
