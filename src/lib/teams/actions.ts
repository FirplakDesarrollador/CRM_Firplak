"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/session";
import type { FormState } from "@/lib/records/form";
import { TEAM_OBJECTS, type Access, type TeamObject } from "./config";

const PATHS: Record<TeamObject, string> = { accounts: "/cuentas", opportunities: "/oportunidades" };
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const level = (fd: FormData, k: string, allowNone = true): Access => {
  const v = str(fd, k);
  return v === "edit" || v === "read" ? v : allowNone ? "none" : "read";
};

function fail(message: string): FormState {
  if (message.includes("duplicate key")) return { message: "Esa persona ya está en el equipo." };
  if (message.includes("row-level security")) return { message: "No puedes gestionar el equipo de este registro." };
  return { message };
}

/** Niveles del equipo de cuenta además del acceso a la cuenta. */
const extraAccess = (fd: FormData) => ({
  opportunity_access: level(fd, "opportunity_access"),
  case_access: level(fd, "case_access"),
  contact_access: level(fd, "contact_access"),
});

export async function addTeamMember(object: TeamObject, recordId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  if (!TEAM_OBJECTS.includes(object)) return { message: "Objeto no válido" };
  const userId = str(fd, "user_id");
  if (!userId) return { message: "Elige a la persona" };
  const supabase = await createClient();
  const base = { user_id: userId, team_role: str(fd, "team_role") || "Otro" };
  const access = level(fd, "access", false);
  const { error } = object === "accounts"
    ? await supabase.from("account_team_members").insert({ ...base, account_id: recordId, account_access: access, ...extraAccess(fd) })
    : await supabase.from("opportunity_team_members").insert({ ...base, opportunity_id: recordId, access });
  if (error) return fail(error.message);
  revalidatePath(`${PATHS[object]}/${recordId}`);
  return { ok: true, message: "Miembro agregado al equipo" };
}

export async function updateTeamMember(object: TeamObject, recordId: string, memberId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const supabase = await createClient();
  const team_role = str(fd, "team_role") || "Otro";
  const access = level(fd, "access", false);
  const { data, error } = object === "accounts"
    ? await supabase.from("account_team_members").update({ team_role, account_access: access, ...extraAccess(fd) }).eq("id", memberId).select("id")
    : await supabase.from("opportunity_team_members").update({ team_role, access }).eq("id", memberId).select("id");
  if (error) return fail(error.message);
  if (!data?.length) return { message: "No puedes gestionar el equipo de este registro." };
  revalidatePath(`${PATHS[object]}/${recordId}`);
  return { ok: true, message: "Miembro actualizado" };
}

export async function removeTeamMember(object: TeamObject, recordId: string, memberId: string): Promise<FormState> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(object === "accounts" ? "account_team_members" : "opportunity_team_members")
    .delete()
    .eq("id", memberId)
    .select("id");
  if (error) return fail(error.message);
  if (!data?.length) return { message: "No puedes gestionar el equipo de este registro." };
  revalidatePath(`${PATHS[object]}/${recordId}`);
  return { ok: true, message: "Miembro retirado del equipo" };
}

export async function addDefaultTeam(object: TeamObject, recordId: string): Promise<FormState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_default_team", { p_object: object, p_id: recordId });
  if (error) return fail(error.message);
  revalidatePath(`${PATHS[object]}/${recordId}`);
  return data ? { ok: true, message: "Equipo predeterminado agregado" } : { ok: true, message: "El equipo predeterminado del propietario ya está completo o está vacío." };
}

// ---------------------------------------------------------------- Equipo predeterminado propio
export async function saveDefaultTeamMember(object: TeamObject, _prev: FormState, fd: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { message: "Sesión expirada" };
  const userId = str(fd, "user_id");
  if (!userId) return { message: "Elige a la persona" };
  if (userId === user.id) return { message: "Ya tienes acceso completo a tus registros." };
  const supabase = await createClient();
  const { error } = await supabase.from("default_team_members").upsert(
    {
      owner_id: user.id, object, user_id: userId, team_role: str(fd, "team_role") || "Otro", access: level(fd, "access", false),
      ...(object === "accounts" ? extraAccess(fd) : {}),
    },
    { onConflict: "owner_id,object,user_id" },
  );
  if (error) return fail(error.message);
  revalidatePath("/preferencias");
  return { ok: true, message: "Equipo predeterminado actualizado" };
}

export async function removeDefaultTeamMember(id: string): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.from("default_team_members").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/preferencias");
  return { ok: true, message: "Miembro retirado" };
}

export async function setTeamAutoAdd(object: TeamObject, _prev: FormState, fd: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { message: "Sesión expirada" };
  const supabase = await createClient();
  const preferences = { ...user.preferences, [`team_auto_add_${object}`]: fd.get("auto_add") === "on" };
  const { error } = await supabase.from("profiles").update({ preferences }).eq("id", user.id);
  if (error) return fail(error.message);
  revalidatePath("/preferencias");
  return { ok: true, message: "Preferencias guardadas" };
}
