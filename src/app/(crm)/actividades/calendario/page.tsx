import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { ObjectIcon } from "@/components/ui/icons";
import { ActivityViewSwitcher } from "@/components/activities/ViewSwitcher";
import { createClient } from "@/lib/supabase/server";
import { getUsers } from "@/lib/records/data";
import { ACTIVITY_TYPES } from "@/lib/objects/picklists";
import { can } from "@/lib/permissions";
import { addDaysISO, formatTime, todayISO } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { OwnerSelect } from "./OwnerSelect";

import { Tr } from "@/components/ui/Tr";
export const metadata: Metadata = { title: "Calendario" };

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const TONE: Record<string, string> = {
  meeting: "bg-[var(--navy-700)] text-[var(--cream-50)]",
  call: "bg-success-soft text-success",
  task: "bg-info-soft text-info",
  email: "bg-brand-soft text-brand",
  note: "bg-surface-3 text-ink-2",
};

type Item = {
  id: string; activity_type: string; subject: string; status: string; due_date: string | null;
  start_at: string | null; end_at: string | null; owner: { full_name: string } | null;
};

const weekdayIndex = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
const bogotaDay = (ts: string) => new Date(Date.parse(ts) - 5 * 3600000).toISOString().slice(0, 10);

export default async function CalendarPage({ searchParams }: PageProps<"/actividades/calendario">) {
  const [user, sp, users] = await Promise.all([requireUser(), searchParams, getUsers()]);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const view = one(sp.vista) === "semana" ? "semana" : "mes";
  const today = todayISO();
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(one(sp.fecha)) ? one(sp.fecha) : today;
  const owner = one(sp.propietario) || "me";

  // Rango visible: semanas completas de lunes a domingo.
  let start: string;
  let days: number;
  let title: string;
  let prev: string;
  let next: string;
  if (view === "mes") {
    const [y, m] = anchor.split("-").map(Number);
    const first = `${y}-${String(m).padStart(2, "0")}-01`;
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    start = addDaysISO(first, -weekdayIndex(first));
    const last = `${y}-${String(m).padStart(2, "0")}-${lastDay}`;
    days = Math.round((Date.parse(addDaysISO(last, 6 - weekdayIndex(last))) - Date.parse(start)) / 86400000) + 1;
    title = `${MONTHS[m - 1]} ${y}`;
    prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
    next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  } else {
    start = addDaysISO(anchor, -weekdayIndex(anchor));
    days = 7;
    const end = addDaysISO(start, 6);
    const [, sm, sd] = start.split("-").map(Number);
    const [ey, em, ed] = end.split("-").map(Number);
    title = `${sd} ${MONTHS[sm - 1].slice(0, 3)} – ${ed} ${MONTHS[em - 1].slice(0, 3)} ${ey}`;
    prev = addDaysISO(start, -7);
    next = addDaysISO(start, 7);
  }
  const end = addDaysISO(start, days - 1);

  const supabase = await createClient();
  let query = supabase
    .from("activities")
    .select("id, activity_type, subject, status, due_date, start_at, end_at, owner:profiles!activities_owner_id_fkey(full_name)")
    .neq("status", "cancelled")
    .or(`and(start_at.gte.${start}T05:00:00Z,start_at.lt.${addDaysISO(end, 1)}T05:00:00Z),and(start_at.is.null,due_date.gte.${start},due_date.lte.${end})`)
    .limit(1000);
  if (owner === "me") query = query.eq("owner_id", user.id);
  else if (owner !== "all") query = query.eq("owner_id", owner);
  const { data } = await query;

  const byDay = new Map<string, Item[]>();
  for (const a of (data ?? []) as unknown as Item[]) {
    const day = a.start_at ? bogotaDay(a.start_at) : a.due_date!;
    byDay.set(day, [...(byDay.get(day) ?? []), a]);
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => (a.start_at ?? `${a.due_date}T99`).localeCompare(b.start_at ?? `${b.due_date}T99`));
  }
  const cells = Array.from({ length: days }, (_, i) => addDaysISO(start, i));
  const qs = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ vista: view, fecha: anchor, propietario: owner, ...patch });
    return `/actividades/calendario?${p}`;
  };
  const currentMonth = anchor.slice(0, 7);
  const canCreate = can(user.access, "activities", "create");
  const maxPerCell = view === "mes" ? 3 : 50;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ObjectIcon object="activities" />
          <div>
            <p className="eyebrow"><Tr>Calendario</Tr></p>
            <h1 className="text-xl font-medium first-letter:uppercase">{title}</h1>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActivityViewSwitcher active="calendario" />
          {canCreate && <Link href={`/actividades/nueva?tipo=meeting&fecha=${today}&volver=${encodeURIComponent(qs({}))}`} className="btn btn-primary"><Plus size={16} /> <Tr>Nueva reunión</Tr></Link>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1">
          <Link href={qs({ fecha: prev })} className="btn btn-icon" aria-label="Anterior"><ChevronLeft size={16} /></Link>
          <Link href={qs({ fecha: today })} className="btn"><Tr>Hoy</Tr></Link>
          <Link href={qs({ fecha: next })} className="btn btn-icon" aria-label="Siguiente"><ChevronRight size={16} /></Link>
        </div>
        <div className="inline-flex rounded-[10px] border border-line-strong p-0.5">
          {(["mes", "semana"] as const).map((v) => (
            <Link key={v} href={qs({ vista: v })} aria-current={view === v ? "page" : undefined}
              className={`btn btn-sm border-0 ${view === v ? "bg-brand text-[var(--brand-contrast)] hover:bg-brand" : "btn-ghost"}`}>
              {v === "mes" ? "Mes" : "Semana"}
            </Link>
          ))}
        </div>
        <OwnerSelect value={owner} users={users.filter((u) => u.is_active).map((u) => ({ id: u.id, name: u.full_name }))} />
        <div className="ml-auto hidden flex-wrap gap-2 text-xs md:flex">
          {Object.entries(ACTIVITY_TYPES).filter(([k]) => k !== "note").map(([k, label]) => (
            <span key={k} className={`rounded-full px-2 py-0.5 font-medium ${TONE[k]}`}>{label}</span>
          ))}
        </div>
      </div>

      <section className="card overflow-x-auto">
        <div className="grid min-w-[52rem] grid-cols-7 border-b border-line bg-surface-2">
          {WEEKDAYS.map((d) => <div key={d} className="px-2 py-2 text-[0.7rem] font-medium uppercase tracking-[0.12em] text-muted">{d}</div>)}
        </div>
        <div className="grid min-w-[52rem] grid-cols-7">
          {cells.map((day) => {
            const items = byDay.get(day) ?? [];
            const outside = view === "mes" && day.slice(0, 7) !== currentMonth;
            const isToday = day === today;
            return (
              <div key={day} className={`group relative border-b border-r border-line p-1.5 ${view === "mes" ? "min-h-28" : "min-h-[26rem]"} ${outside ? "bg-surface-2/60" : ""}`}>
                <div className="mb-1 flex items-center justify-between">
                  <Link href={qs({ vista: "semana", fecha: day })}
                    className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs no-underline ${isToday ? "bg-brand font-semibold text-[var(--brand-contrast)]" : outside ? "text-muted" : "text-ink-2 hover:bg-surface-3"}`}>
                    {Number(day.slice(8))}
                  </Link>
                  {canCreate && (
                    <Link href={`/actividades/nueva?tipo=meeting&fecha=${day}&volver=${encodeURIComponent(qs({}))}`} aria-label={`Nueva actividad el ${day}`}
                      className="rounded p-0.5 text-muted opacity-0 transition hover:bg-surface-3 hover:text-ink focus:opacity-100 group-hover:opacity-100">
                      <Plus size={14} />
                    </Link>
                  )}
                </div>
                <ul className="space-y-1">
                  {items.slice(0, maxPerCell).map((a) => (
                    <li key={a.id}>
                      <Link href={`/actividades/${a.id}`} title={`${ACTIVITY_TYPES[a.activity_type]} · ${a.subject}${a.owner ? ` · ${a.owner.full_name}` : ""}`}
                        className={`block truncate rounded-md px-1.5 py-0.5 text-[0.72rem] font-medium no-underline ${TONE[a.activity_type]} ${a.status === "completed" ? "line-through opacity-60" : ""}`}>
                        {a.start_at && <span className="mr-1 opacity-80">{formatTime(a.start_at)}</span>}
                        {a.subject}
                      </Link>
                    </li>
                  ))}
                  {items.length > maxPerCell && (
                    <li><Link href={qs({ vista: "semana", fecha: day })} className="text-[0.7rem] font-medium text-muted">+{items.length - maxPerCell} más</Link></li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
