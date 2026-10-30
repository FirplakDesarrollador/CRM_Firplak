import "server-only";
import { createClient } from "@/lib/supabase/server";

export type ActivityRow = {
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
  email_to?: string | null;
  owner_id: string | null;
  owner: { id: string; full_name: string; email: string } | null;
  account: { id: string; name: string } | null;
  contact: { id: string; full_name: string } | null;
  opportunity: { id: string; name: string } | null;
  lead: { id: string; full_name: string } | null;
  case: { id: string; subject: string } | null;
};

const SELECT =
  "id, activity_type, subject, description, status, priority, due_date, start_at, end_at, location, call_result, duration_minutes, completed_at, created_at, email_to, owner_id, owner:profiles!activities_owner_id_fkey(id, full_name, email), account:accounts!activities_account_id_fkey(id, name), contact:contacts!activities_contact_id_fkey(id, full_name), opportunity:opportunities!activities_opportunity_id_fkey(id, name), lead:leads!activities_lead_id_fkey(id, full_name), case:cases!activities_case_id_fkey(id, subject)";

export async function getActivitiesFor(filter: { account_id?: string; contact_id?: string; opportunity_id?: string; lead_id?: string; case_id?: string }) {
  const supabase = await createClient();
  let q = supabase.from("activities").select(SELECT).order("created_at", { ascending: false }).limit(200);
  if (filter.account_id) q = q.eq("account_id", filter.account_id);
  if (filter.contact_id) q = q.eq("contact_id", filter.contact_id);
  if (filter.opportunity_id) q = q.eq("opportunity_id", filter.opportunity_id);
  if (filter.lead_id) q = q.eq("lead_id", filter.lead_id);
  if (filter.case_id) q = q.eq("case_id", filter.case_id);
  const { data } = await q;
  return (data ?? []) as unknown as ActivityRow[];
}

export async function getMyOpenActivities(userId: string, opts: { until?: string; limit?: number } = {}) {
  const supabase = await createClient();
  let q = supabase
    .from("activities")
    .select(SELECT)
    .eq("owner_id", userId)
    .in("status", ["pending", "in_progress"])
    .in("activity_type", ["task", "call", "meeting"])
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("start_at", { ascending: true, nullsFirst: false })
    .limit(opts.limit ?? 50);
  if (opts.until) q = q.or(`due_date.lte.${opts.until},start_at.lte.${opts.until}T23:59:59-05:00`);
  const { data } = await q;
  return (data ?? []) as unknown as ActivityRow[];
}

export async function getUpcomingMeetings(userId: string, fromIso: string, toIso: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activities")
    .select(SELECT)
    .eq("owner_id", userId)
    .eq("activity_type", "meeting")
    .neq("status", "cancelled")
    .gte("start_at", fromIso)
    .lte("start_at", toIso)
    .order("start_at")
    .limit(30);
  return (data ?? []) as unknown as ActivityRow[];
}

/** Fecha efectiva de la actividad para ordenar y agrupar (YYYY-MM-DD, hora de Colombia). */
export function activityDate(a: Pick<ActivityRow, "due_date" | "start_at" | "completed_at" | "created_at" | "status">) {
  if (a.start_at) return new Date(Date.parse(a.start_at) - 5 * 3600000).toISOString().slice(0, 10);
  if (a.due_date) return a.due_date;
  return new Date(Date.parse(a.completed_at ?? a.created_at) - 5 * 3600000).toISOString().slice(0, 10);
}
