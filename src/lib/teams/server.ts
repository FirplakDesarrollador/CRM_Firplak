import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getPicklistRows } from "@/lib/records/data";
import { TEAM_ROLES, type TeamMember, type TeamObject } from "./config";

const USER = "user:profiles!{fk}(full_name, email, title, is_active)";

/** Miembros del equipo de una cuenta u oportunidad (los que el usuario puede ver). */
export async function getTeam(object: TeamObject, recordId: string): Promise<TeamMember[]> {
  const supabase = await createClient();
  if (object === "accounts") {
    const { data } = await supabase
      .from("account_team_members")
      .select(`id, user_id, team_role, access:account_access, opportunity_access, case_access, contact_access, ${USER.replace("{fk}", "account_team_members_user_id_fkey")}`)
      .eq("account_id", recordId)
      .order("created_at");
    return (data ?? []) as unknown as TeamMember[];
  }
  const { data } = await supabase
    .from("opportunity_team_members")
    .select(`id, user_id, team_role, access, ${USER.replace("{fk}", "opportunity_team_members_user_id_fkey")}`)
    .eq("opportunity_id", recordId)
    .order("created_at");
  return (data ?? []) as unknown as TeamMember[];
}

export async function canManageTeam(object: TeamObject, recordId: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("can_manage_team", { p_object: object, p_id: recordId });
  return Boolean(data);
}

/** Roles activos: lista personalizada o la estándar. */
export const getTeamRoles = cache(async (): Promise<string[]> => {
  const rows = (await getPicklistRows()).filter((r) => r.object === "opportunities" && r.field === "team_role");
  return rows.length ? rows.filter((r) => r.is_active).sort((a, b) => a.sort_order - b.sort_order).map((r) => r.value) : TEAM_ROLES;
});

/** Equipo predeterminado propio para un objeto. */
export async function getDefaultTeam(object: TeamObject): Promise<TeamMember[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("default_team_members")
    .select(`id, user_id, team_role, access, opportunity_access, case_access, contact_access, ${USER.replace("{fk}", "default_team_members_user_id_fkey")}`)
    .eq("object", object)
    .order("created_at");
  return (data ?? []) as unknown as TeamMember[];
}

/** Ids de los registros donde el usuario está en el equipo (alcance «Mi equipo» de las listas). */
export async function getTeamRecordIds(object: TeamObject, userId: string): Promise<string[]> {
  const supabase = await createClient();
  if (object === "accounts") {
    const { data } = await supabase.from("account_team_members").select("account_id").eq("user_id", userId);
    return (data ?? []).map((r) => r.account_id);
  }
  const { data } = await supabase.from("opportunity_team_members").select("opportunity_id").eq("user_id", userId);
  return (data ?? []).map((r) => r.opportunity_id);
}
