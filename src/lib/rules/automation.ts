import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getObjectDef, untypedClient } from "@/lib/records/data";
import { recordTitle, type Filter, type ObjectKey } from "@/lib/objects";
import { addDaysISO, todayISO } from "@/lib/format";
import { matchesAll } from "./evaluate";

export type { AutomationAction } from "./automation-types";
import type { AutomationAction } from "./automation-types";

const ACTIVITY_LINK: Partial<Record<ObjectKey, string>> = {
  accounts: "account_id",
  contacts: "contact_id",
  opportunities: "opportunity_id",
  leads: "lead_id",
  cases: "case_id",
};
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

/**
 * Ejecuta las automatizaciones activas del objeto tras crear o actualizar un registro.
 * Corre con los permisos del usuario; una acción que falle no detiene las demás.
 */
export async function runAutomations(
  object: ObjectKey,
  trigger: "create" | "update",
  id: string,
  before: Record<string, unknown> | null,
  userId: string,
): Promise<number> {
  const supabase = await createClient();
  const { data: rules } = await supabase
    .from("automation_rules").select("*").eq("object", object).eq("is_active", true).order("sort_order");
  if (!rules?.length) return 0;

  const def = await getObjectDef(object);
  const db: SupabaseClient = await untypedClient();
  const load = async () => (await db.from(def.table).select("*").eq("id", id).maybeSingle()).data as Record<string, unknown> | null;
  let row = await load();
  if (!row) return 0;
  let executed = 0;

  for (const rule of rules) {
    if (rule.trigger_on !== "create_or_update" && rule.trigger_on !== trigger) continue;
    if (trigger === "update" && rule.watch_field && before) {
      const key = rule.watch_field;
      const changed = key.startsWith("cf.")
        ? JSON.stringify((before.custom_fields as Record<string, unknown> | null)?.[key.slice(3)]) !== JSON.stringify((row.custom_fields as Record<string, unknown> | null)?.[key.slice(3)])
        : JSON.stringify(before[key]) !== JSON.stringify(row[key]);
      if (!changed) continue;
    }
    const conditions = (Array.isArray(rule.conditions) ? rule.conditions : []) as Filter[];
    if (!matchesAll(def, row, conditions, userId)) continue;

    for (const action of (Array.isArray(rule.actions) ? rule.actions : []) as AutomationAction[]) {
      try {
        if (action.type === "assign_owner" && isUuid(action.user_id) && def.hasOwner !== false) {
          await db.from(def.table).update({ owner_id: action.user_id }).eq("id", id);
        } else if (action.type === "set_field" && def.fields.some((f) => f.name === action.field && !f.readOnly)) {
          const patch = action.field.startsWith("cf.")
            ? { custom_fields: { ...((row.custom_fields as object) ?? {}), [action.field.slice(3)]: action.value } }
            : { [action.field]: action.value === "" ? null : action.value };
          await db.from(def.table).update(patch).eq("id", id);
        } else if (action.type === "create_task" && action.subject) {
          const owner = action.assign_to && isUuid(action.assign_to) ? action.assign_to : (row.owner_id as string | null) ?? userId;
          const link = ACTIVITY_LINK[object];
          await supabase.from("activities").insert({
            activity_type: "task",
            subject: action.subject,
            description: `Creada automáticamente por la regla «${rule.name}».`,
            status: "pending",
            priority: action.priority ?? "normal",
            due_date: addDaysISO(todayISO(), Number(action.due_in_days ?? 1)),
            owner_id: owner,
            ...(link ? { [link]: id } : {}),
            ...(object === "opportunities" || object === "contacts" || object === "cases" ? { account_id: (row.account_id as string | null) ?? null } : {}),
          });
        } else if (action.type === "notify" && action.title) {
          let to: string | null = null;
          if (action.to === "owner") to = (row.owner_id as string | null) ?? null;
          else if (action.to === "manager" && isUuid(row.owner_id)) {
            const { data: p } = await supabase.from("profiles").select("manager_id").eq("id", row.owner_id).maybeSingle();
            to = p?.manager_id ?? null;
          } else if (isUuid(action.to)) to = action.to;
          if (to) {
            await supabase.rpc("notify_user", {
              p_user: to,
              p_title: action.title,
              p_body: `${recordTitle(def, row)}${action.body ? ` · ${action.body}` : ""}`,
              p_link: `${def.path}/${id}`,
            });
          }
        }
      } catch {
        // Una acción fallida no bloquea el guardado ni las demás acciones.
      }
    }
    await supabase.rpc("mark_automation_run", { p_rule: rule.id });
    executed += 1;
    row = (await load()) ?? row;
  }
  return executed;
}
