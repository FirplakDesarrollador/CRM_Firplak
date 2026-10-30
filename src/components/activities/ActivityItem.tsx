"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { Clock, MapPin, Trash2 } from "lucide-react";
import { ACTIVITY_ICONS } from "@/components/ui/icons";
import { ACTIVITY_TYPES, PRIORITIES } from "@/lib/objects/picklists";
import { deleteActivity, setActivityStatus } from "@/lib/records/actions";
import { formatDate, formatDateTime, formatTime, relativeDays, todayISO } from "@/lib/format";

export type ActivityItemData = {
  id: string;
  activity_type: string;
  subject: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  start_at: string | null;
  end_at: string | null;
  location: string | null;
  call_result: string | null;
  duration_minutes: number | null;
  completed_at: string | null;
  created_at: string;
  owner: { full_name: string; email: string } | null;
  account: { id: string; name: string } | null;
  contact: { id: string; full_name: string } | null;
  opportunity: { id: string; name: string } | null;
  lead?: { id: string; full_name: string } | null;
  case?: { id: string; subject: string } | null;
};

const TYPE_TONE: Record<string, string> = {
  task: "bg-info-soft text-info",
  call: "bg-success-soft text-success",
  meeting: "bg-accent-soft text-accent",
  email: "bg-brand-soft text-brand",
  note: "bg-surface-3 text-ink-2",
};

export function ActivityItem({ activity, showRelated = true, canEdit = true }: { activity: ActivityItemData; showRelated?: boolean; canEdit?: boolean }) {
  const [pending, start] = useTransition();
  const [status, setStatus] = useOptimistic(activity.status);
  const Icon = ACTIVITY_ICONS[activity.activity_type];
  const done = status === "completed";
  const checkable = ["task", "call", "meeting"].includes(activity.activity_type);
  const overdue = !done && activity.due_date && activity.due_date < todayISO();

  const when = activity.start_at
    ? `${formatDateTime(activity.start_at)}${activity.end_at ? ` – ${formatTime(activity.end_at)}` : ""}`
    : activity.due_date
      ? `${formatDate(activity.due_date)} · ${relativeDays(activity.due_date)}`
      : done
        ? `Completada ${formatDateTime(activity.completed_at ?? activity.created_at)}`
        : formatDateTime(activity.created_at);

  return (
    <li className={`group flex gap-3 py-3 ${pending ? "opacity-60" : ""}`}>
      <span className={`mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full ${TYPE_TONE[activity.activity_type]}`}>
        {Icon && <Icon size={15} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          {checkable && canEdit && (
            <input
              type="checkbox"
              aria-label={done ? "Marcar como pendiente" : "Marcar como completada"}
              className="mt-1 h-4 w-4 flex-none accent-[var(--success)]"
              checked={done}
              onChange={(e) => {
                const next = e.target.checked ? "completed" : "pending";
                start(async () => {
                  setStatus(next);
                  await setActivityStatus(activity.id, next);
                });
              }}
            />
          )}
          <p className={`min-w-0 flex-1 font-semibold ${done && checkable ? "text-muted line-through" : ""}`}>{activity.subject}</p>
          {activity.priority === "high" && !done && <span className="badge badge-danger">{PRIORITIES.high}</span>}
          {canEdit && (
            <button
              type="button"
              className="text-muted opacity-0 transition hover:text-danger focus:opacity-100 group-hover:opacity-100"
              aria-label="Eliminar actividad"
              onClick={() => confirm("¿Eliminar esta actividad?") && start(async () => { await deleteActivity(activity.id); })}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
        <p className={`mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs ${overdue ? "font-semibold text-danger" : "text-muted"}`}>
          <span className="inline-flex items-center gap-1"><Clock size={12} /> {ACTIVITY_TYPES[activity.activity_type]} · {when}</span>
          {activity.location && <span className="inline-flex items-center gap-1"><MapPin size={12} /> {activity.location}</span>}
          {activity.owner && <span>{activity.owner.full_name || activity.owner.email}</span>}
        </p>
        {activity.call_result && <p className="mt-1 text-xs"><span className="badge">{activity.call_result}</span></p>}
        {activity.description && <p className="mt-1 whitespace-pre-line text-sm text-ink-2">{activity.description}</p>}
        {showRelated && (activity.opportunity || activity.account || activity.contact || activity.lead || activity.case) && (
          <p className="mt-1 flex flex-wrap gap-x-3 text-xs">
            {activity.lead && <Link className="link" href={`/prospectos/${activity.lead.id}`}>{activity.lead.full_name}</Link>}
            {activity.case && <Link className="link" href={`/casos/${activity.case.id}`}>{activity.case.subject}</Link>}
            {activity.opportunity && <Link className="link" href={`/oportunidades/${activity.opportunity.id}`}>{activity.opportunity.name}</Link>}
            {activity.account && <Link className="link" href={`/cuentas/${activity.account.id}`}>{activity.account.name}</Link>}
            {activity.contact && <Link className="link" href={`/contactos/${activity.contact.id}`}>{activity.contact.full_name}</Link>}
          </p>
        )}
      </div>
    </li>
  );
}
