import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getObjectDef, type Row } from "@/lib/records/data";
import type { Filter, ObjectKey } from "@/lib/objects";
import { matchesAll } from "@/lib/rules/evaluate";

export const APPROVAL_OBJECTS: ObjectKey[] = ["accounts", "contacts", "opportunities", "leads", "quotes", "cases", "campaigns", "products", "orders"];

type Person = { id: string; full_name: string | null } | null;
export type ApprovalRequest = {
  id: string; process_id: string | null; process_name: string; object: ObjectKey; record_id: string; record_name: string | null;
  status: "pending" | "approved" | "rejected" | "recalled"; lock_record: boolean;
  submitted_by: string | null; submitted_at: string; submit_comment: string | null;
  approver_id: string | null; decided_by: string | null; decided_at: string | null; decision_comment: string | null;
  submitter: Person; approver: Person; decider: Person;
};

export const REQUEST_SELECT = [
  "*",
  "submitter:profiles!approval_requests_submitted_by_fkey(id, full_name)",
  "approver:profiles!approval_requests_approver_id_fkey(id, full_name)",
  "decider:profiles!approval_requests_decided_by_fkey(id, full_name)",
].join(", ");

/** Solicitudes de aprobación de un registro, de la más reciente a la más antigua. */
export async function getRecordApprovals(object: ObjectKey, id: string): Promise<ApprovalRequest[]> {
  if (!APPROVAL_OBJECTS.includes(object)) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("approval_requests").select(REQUEST_SELECT)
    .eq("object", object).eq("record_id", id).order("submitted_at", { ascending: false });
  return (data ?? []) as unknown as ApprovalRequest[];
}

/** Primer proceso activo (por orden) cuyas condiciones cumple el registro. */
export async function findApplicableProcess(object: ObjectKey, row: Row, userId: string) {
  if (!APPROVAL_OBJECTS.includes(object)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("approval_processes").select("id, name, conditions")
    .eq("object", object).eq("is_active", true).order("sort_order");
  if (!data?.length) return null;
  const def = await getObjectDef(object);
  return data.find((p) => matchesAll(def, row, (Array.isArray(p.conditions) ? p.conditions : []) as Filter[], userId)) ?? null;
}
