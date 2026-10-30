"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/session";
import { canSystem, OBJECT_ACTIONS, PERMISSION_OBJECTS, SYSTEM_PERMISSIONS, type PermissionMap } from "@/lib/permissions";
import { siteUrl } from "@/lib/env";
import type { FormState } from "@/lib/records/form";

type Perm = "manage_users" | "customize";

async function guard(perm: Perm) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canSystem(user.access, perm)) return { denied: { message: "No tienes permiso para esta configuración." } as FormState };
  return { user, supabase: await createClient() };
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const nullable = (fd: FormData, k: string) => str(fd, k) || null;

function done(message = "Guardado", path = "/configuracion"): FormState {
  revalidatePath(path, "layout");
  return { ok: true, message };
}

function fail(error: { message: string } | null, fallback = "No se pudo guardar"): FormState {
  const m = error?.message ?? fallback;
  if (m.includes("violates foreign key") || m.includes("still referenced")) return { message: "Está en uso por otros registros; no se puede eliminar." };
  if (m.includes("duplicate key")) return { message: "Ya existe un registro con ese nombre." };
  if (m.includes("row-level security")) return { message: "No tienes permiso para esta acción." };
  return { message: m };
}

// ---------------------------------------------------------------- Usuarios
export async function updateUser(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guard("manage_users");
  if ("denied" in g) return g.denied!;
  const { user, supabase } = g;
  const isActive = fd.get("is_active") === "on";
  if (id === user.id && !isActive) return { message: "No puedes desactivar tu propio usuario." };
  const { error } = await supabase
    .from("profiles")
    .update({
      role_id: nullable(fd, "role_id"),
      permission_profile_id: nullable(fd, "permission_profile_id"),
      manager_id: nullable(fd, "manager_id"),
      title: nullable(fd, "title"),
      is_active: isActive,
    })
    .eq("id", id);
  return error ? fail(error) : done("Usuario actualizado");
}

export async function inviteUser(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guard("manage_users");
  if ("denied" in g) return g.denied!;
  const admin = createAdminClient();
  if (!admin) return { message: "Configura SUPABASE_SERVICE_ROLE_KEY en .env.local para invitar usuarios." };
  const email = str(fd, "email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { message: "Correo no válido" };
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: str(fd, "full_name") },
    redirectTo: `${siteUrl}/auth/callback?next=/auth/restablecer`,
  });
  if (error) return fail(error);
  const profileId = nullable(fd, "permission_profile_id");
  const roleId = nullable(fd, "role_id");
  if (data.user && (profileId || roleId)) {
    await admin.from("profiles").update({ permission_profile_id: profileId ?? undefined, role_id: roleId }).eq("id", data.user.id);
  }
  return done(`Invitación enviada a ${email}`);
}

// ---------------------------------------------------------------- Roles
export async function saveRole(id: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guard("manage_users");
  if ("denied" in g) return g.denied!;
  const { supabase } = g;
  const name = str(fd, "name");
  if (!name) return { message: "Escribe el nombre del rol" };
  const parent = nullable(fd, "parent_id");
  if (id && parent === id) return { message: "Un rol no puede depender de sí mismo." };
  const payload = { name, parent_id: parent, description: nullable(fd, "description") };
  const { error } = id
    ? await supabase.from("roles").update(payload).eq("id", id)
    : await supabase.from("roles").insert(payload);
  return error ? fail(error) : done(id ? "Rol actualizado" : "Rol creado");
}

export async function deleteRole(id: string, _prev?: FormState, _fd?: FormData): Promise<FormState> {
  const g = await guard("manage_users");
  if ("denied" in g) return g.denied!;
  const { supabase } = g;
  const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role_id", id);
  if (count) return { message: `Hay ${count} usuario(s) con este rol. Reasígnalos antes de eliminarlo.` };
  const { error } = await supabase.from("roles").delete().eq("id", id);
  return error ? fail(error) : done("Rol eliminado");
}

// ---------------------------------------------------------------- Perfiles de permisos
export async function savePermissionProfile(id: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guard("manage_users");
  if ("denied" in g) return g.denied!;
  const { supabase } = g;
  const name = str(fd, "name");
  if (!name) return { message: "Escribe el nombre del perfil" };
  const permissions: PermissionMap = { system: {} };
  for (const o of PERMISSION_OBJECTS) {
    permissions[o] = {};
    for (const a of OBJECT_ACTIONS) permissions[o]![a] = fd.get(`p:${o}:${a}`) === "on";
    // Consistencia: quien edita también lee; "modificar todo" implica "ver todo".
    const p = permissions[o]!;
    if (p.modify_all) p.view_all = true;
    if (p.create || p.edit || p.delete || p.view_all) p.read = true;
  }
  for (const s of SYSTEM_PERMISSIONS) permissions.system![s] = fd.get(`s:${s}`) === "on";

  const payload = { name, description: nullable(fd, "description"), permissions: permissions as never };
  const result = id
    ? await supabase.from("permission_profiles").update(payload).eq("id", id).eq("is_admin", false).select("id").single()
    : await supabase.from("permission_profiles").insert(payload).select("id").single();
  if (result.error) return fail(result.error);
  if (fd.get("is_default") === "on") {
    await supabase.from("permission_profiles").update({ is_default: false }).neq("id", result.data.id).eq("is_default", true);
    await supabase.from("permission_profiles").update({ is_default: true }).eq("id", result.data.id);
  }
  revalidatePath("/configuracion", "layout");
  if (!id) redirect(`/configuracion/perfiles?id=${result.data.id}`);
  return { ok: true, message: "Perfil guardado" };
}

export async function deletePermissionProfile(id: string, _prev?: FormState, _fd?: FormData): Promise<FormState> {
  const g = await guard("manage_users");
  if ("denied" in g) return g.denied!;
  const { supabase } = g;
  const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("permission_profile_id", id);
  if (count) return { message: `Hay ${count} usuario(s) con este perfil. Reasígnalos antes de eliminarlo.` };
  const { error } = await supabase.from("permission_profiles").delete().eq("id", id).eq("is_admin", false);
  if (error) return fail(error);
  revalidatePath("/configuracion", "layout");
  redirect("/configuracion/perfiles");
}

// ---------------------------------------------------------------- Pipelines y etapas
export async function savePipeline(id: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guard("customize");
  if ("denied" in g) return g.denied!;
  const { supabase } = g;
  const name = str(fd, "name");
  if (!name) return { message: "Escribe el nombre del pipeline" };
  const payload = { name, description: nullable(fd, "description"), is_active: id ? fd.get("is_active") === "on" : true };
  const result = id
    ? await supabase.from("pipelines").update(payload).eq("id", id).select("id").single()
    : await supabase.from("pipelines").insert({ ...payload, sort_order: 99 }).select("id").single();
  if (result.error) return fail(result.error);
  if (!id) {
    // Todo pipeline nuevo nace con una etapa inicial y las de cierre.
    await supabase.from("pipeline_stages").insert([
      { pipeline_id: result.data.id, name: "Prospección", sort_order: 1, probability: 10, category: "open", forecast_category: "pipeline", color: "#749094" },
      { pipeline_id: result.data.id, name: "Ganada", sort_order: 90, probability: 100, category: "won", forecast_category: "closed", color: "#4f7a52" },
      { pipeline_id: result.data.id, name: "Perdida", sort_order: 91, probability: 0, category: "lost", forecast_category: "omitted", color: "#a04a3d" },
    ]);
  }
  if (fd.get("is_default") === "on") {
    await supabase.from("pipelines").update({ is_default: false }).neq("id", result.data.id).eq("is_default", true);
    await supabase.from("pipelines").update({ is_default: true, is_active: true }).eq("id", result.data.id);
  }
  return done(id ? "Pipeline actualizado" : "Pipeline creado");
}

export async function deletePipeline(id: string, _prev?: FormState, _fd?: FormData): Promise<FormState> {
  const g = await guard("customize");
  if ("denied" in g) return g.denied!;
  const { supabase } = g;
  const { count } = await supabase.from("opportunities").select("id", { count: "exact", head: true }).eq("pipeline_id", id);
  if (count) return { message: `Tiene ${count} oportunidad(es). Desactívalo en lugar de eliminarlo.` };
  const { error } = await supabase.from("pipelines").delete().eq("id", id).eq("is_default", false);
  return error ? fail(error) : done("Pipeline eliminado");
}

export async function saveStage(pipelineId: string, id: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guard("customize");
  if ("denied" in g) return g.denied!;
  const { supabase } = g;
  const name = str(fd, "name");
  if (!name) return { message: "Escribe el nombre de la etapa" };
  const probability = Math.min(100, Math.max(0, Number(str(fd, "probability")) || 0));
  const category = ["open", "won", "lost"].includes(str(fd, "category")) ? str(fd, "category") : "open";
  const forecast = ["pipeline", "best_case", "commit", "closed", "omitted"].includes(str(fd, "forecast_category"))
    ? str(fd, "forecast_category") : "pipeline";
  const payload = {
    pipeline_id: pipelineId,
    name,
    probability,
    category,
    forecast_category: forecast,
    color: /^#[0-9a-f]{6}$/i.test(str(fd, "color")) ? str(fd, "color") : "#4a7693",
    sort_order: Number(str(fd, "sort_order")) || 0,
  };
  const { error } = id
    ? await supabase.from("pipeline_stages").update(payload).eq("id", id)
    : await supabase.from("pipeline_stages").insert(payload);
  return error ? fail(error) : done(id ? "Etapa actualizada" : "Etapa creada");
}

export async function deleteStage(id: string, _prev?: FormState, _fd?: FormData): Promise<FormState> {
  const g = await guard("customize");
  if ("denied" in g) return g.denied!;
  const { supabase } = g;
  const { count } = await supabase.from("opportunities").select("id", { count: "exact", head: true }).eq("stage_id", id);
  if (count) return { message: `Hay ${count} oportunidad(es) en esta etapa. Muévelas antes de eliminarla.` };
  const { error } = await supabase.from("pipeline_stages").delete().eq("id", id);
  return error ? fail(error) : done("Etapa eliminada");
}

// ---------------------------------------------------------------- Campos personalizados
function slug(label: string) {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "c_$1")
    .slice(0, 40);
}

export async function saveCustomField(object: string, id: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guard("customize");
  if ("denied" in g) return g.denied!;
  const { supabase } = g;
  const label = str(fd, "label");
  if (!label) return { message: "Escribe la etiqueta del campo" };
  const options = str(fd, "options").split(/\n|,/).map((o) => o.trim()).filter(Boolean);
  const type = str(fd, "field_type");
  if (["select", "multiselect"].includes(type) && options.length === 0) return { message: "Agrega al menos una opción" };
  const base = {
    label,
    options,
    is_required: fd.get("is_required") === "on",
    show_in_list: fd.get("show_in_list") === "on",
    help_text: nullable(fd, "help_text"),
    sort_order: Number(str(fd, "sort_order")) || 0,
  };
  if (id) {
    const { error } = await supabase.from("custom_field_definitions").update({ ...base, is_active: fd.get("is_active") === "on" }).eq("id", id);
    return error ? fail(error) : done("Campo actualizado");
  }
  const apiName = slug(str(fd, "api_name") || label);
  if (apiName.length < 2) return { message: "Nombre interno no válido" };
  const { error } = await supabase.from("custom_field_definitions").insert({ ...base, object, api_name: apiName, field_type: type });
  return error ? fail(error) : done(`Campo “${label}” creado (${apiName})`);
}

export async function deleteCustomField(id: string, _prev?: FormState, _fd?: FormData): Promise<FormState> {
  const g = await guard("customize");
  if ("denied" in g) return g.denied!;
  const { supabase } = g;
  const { error } = await supabase.from("custom_field_definitions").delete().eq("id", id);
  return error ? fail(error) : done("Campo eliminado. Los valores guardados se conservan en los registros.");
}

// ---------------------------------------------------------------- Compartir
export async function saveSharing(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guard("customize");
  if ("denied" in g) return g.denied!;
  const { supabase } = g;
  const rows = PERMISSION_OBJECTS.map((object) => ({
    object,
    access: ["private", "read", "read_write"].includes(str(fd, object)) ? str(fd, object) : "private",
  }));
  const { error } = await supabase.from("sharing_settings").upsert(rows);
  return error ? fail(error) : done("Reglas de compartir actualizadas");
}

// ---------------------------------------------------------------- Listas de valores
export async function customizePicklist(object: string, field: string, defaults: string[]): Promise<FormState> {
  const g = await guard("customize");
  if ("denied" in g) return g.denied!;
  const rows = defaults.map((value, i) => ({ object, field, value, sort_order: (i + 1) * 10 }));
  const { error } = await g.supabase.from("picklist_values").upsert(rows, { onConflict: "object,field,value", ignoreDuplicates: true });
  return error ? fail(error) : done("Ya puedes personalizar esta lista");
}

export async function addPicklistValue(object: string, field: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guard("customize");
  if ("denied" in g) return g.denied!;
  const value = str(fd, "value");
  if (!value) return { message: "Escribe el valor" };
  const { data: last } = await g.supabase.from("picklist_values").select("sort_order")
    .eq("object", object).eq("field", field).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { error } = await g.supabase.from("picklist_values").insert({ object, field, value, sort_order: (last?.sort_order ?? 0) + 10 });
  return error ? fail(error) : done(`“${value}” agregado`);
}

export async function updatePicklistValue(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guard("customize");
  if ("denied" in g) return g.denied!;
  const { error } = await g.supabase.from("picklist_values")
    .update({ sort_order: Number(str(fd, "sort_order")) || 0, is_active: fd.get("is_active") === "on" }).eq("id", id);
  return error ? fail(error) : done("Valor actualizado");
}

export async function deletePicklistValue(id: string, _prev?: FormState, _fd?: FormData): Promise<FormState> {
  const g = await guard("customize");
  if ("denied" in g) return g.denied!;
  const { error } = await g.supabase.from("picklist_values").delete().eq("id", id);
  return error ? fail(error) : done("Valor eliminado; los registros que lo usan lo conservan.");
}

export async function resetPicklist(object: string, field: string, _prev?: FormState, _fd?: FormData): Promise<FormState> {
  const g = await guard("customize");
  if ("denied" in g) return g.denied!;
  const { error } = await g.supabase.from("picklist_values").delete().eq("object", object).eq("field", field);
  return error ? fail(error) : done("Lista restablecida a los valores estándar");
}

// ---------------------------------------------------------------- Reglas de validación
function parseJsonArray(raw: string) {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export async function saveValidationRule(object: string, id: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guard("customize");
  if ("denied" in g) return g.denied!;
  const name = str(fd, "name");
  const message = str(fd, "error_message");
  const conditions = parseJsonArray(str(fd, "conditions"));
  if (!name) return { message: "Ponle un nombre a la regla" };
  if (!message) return { message: "Escribe el mensaje de error que verá el usuario" };
  if (!conditions.length) return { message: "Agrega al menos una condición" };
  const payload = {
    object, name, conditions, error_message: message,
    description: nullable(fd, "description"),
    error_field: nullable(fd, "error_field"),
    is_active: id ? fd.get("is_active") === "on" : true,
  };
  const { error } = id
    ? await g.supabase.from("validation_rules").update(payload).eq("id", id)
    : await g.supabase.from("validation_rules").insert(payload);
  return error ? fail(error) : done(id ? "Regla actualizada" : "Regla creada");
}

export async function deleteValidationRule(id: string, _prev?: FormState, _fd?: FormData): Promise<FormState> {
  const g = await guard("customize");
  if ("denied" in g) return g.denied!;
  const { error } = await g.supabase.from("validation_rules").delete().eq("id", id);
  return error ? fail(error) : done("Regla eliminada");
}

// ---------------------------------------------------------------- Automatizaciones
export async function saveAutomationRule(object: string, id: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guard("customize");
  if ("denied" in g) return g.denied!;
  const name = str(fd, "name");
  const actions = parseJsonArray(str(fd, "actions"));
  if (!name) return { message: "Ponle un nombre a la automatización" };
  if (!actions.length) return { message: "Agrega al menos una acción" };
  const trigger = ["create", "update", "create_or_update"].includes(str(fd, "trigger_on")) ? str(fd, "trigger_on") : "create";
  const payload = {
    object, name, actions, trigger_on: trigger,
    description: nullable(fd, "description"),
    conditions: parseJsonArray(str(fd, "conditions")),
    watch_field: trigger === "create" ? null : nullable(fd, "watch_field"),
    sort_order: Number(str(fd, "sort_order")) || 0,
    is_active: id ? fd.get("is_active") === "on" : true,
  };
  const { error } = id
    ? await g.supabase.from("automation_rules").update(payload).eq("id", id)
    : await g.supabase.from("automation_rules").insert(payload);
  return error ? fail(error) : done(id ? "Automatización actualizada" : "Automatización creada");
}

export async function deleteAutomationRule(id: string, _prev?: FormState, _fd?: FormData): Promise<FormState> {
  const g = await guard("customize");
  if ("denied" in g) return g.denied!;
  const { error } = await g.supabase.from("automation_rules").delete().eq("id", id);
  return error ? fail(error) : done("Automatización eliminada");
}
