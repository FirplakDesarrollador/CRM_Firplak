"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/session";
import { isObjectKey } from "@/lib/objects";
import type { FormState } from "@/lib/records/form";
import { parseDefinition } from "./types";

export async function saveReport(id: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const name = String(fd.get("name") ?? "").trim();
  if (!name) return { errors: { name: "Ponle un nombre al informe" } };
  const object = String(fd.get("object") ?? "");
  if (!isObjectKey(object)) return { message: "Objeto no válido" };
  const definition = parseDefinition(String(fd.get("definition") ?? "{}"));
  const payload = {
    name,
    object,
    definition: definition as never,
    description: String(fd.get("description") ?? "").trim() || null,
    folder: String(fd.get("folder") ?? "").trim() || "Mis informes",
    is_shared: fd.get("is_shared") === "on",
  };
  const asNew = !id || fd.get("save_as") === "new";
  const supabase = await createClient();
  const result = asNew
    ? await supabase.from("reports").insert({ ...payload, owner_id: user.id }).select("id").single()
    : await supabase.from("reports").update(payload).eq("id", id!).select("id").single();
  if (result.error) {
    return { message: result.error.message.includes("row-level security") ? "No tienes permiso para guardar o compartir este informe." : result.error.message };
  }
  revalidatePath("/informes", "layout");
  redirect(`/informes/${result.data.id}`);
}

export async function deleteReport(id: string, _prev?: FormState, _fd?: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("reports").delete().eq("id", id).select("id");
  if (error) return { message: error.message };
  if (!data?.length) return { message: "No puedes eliminar este informe." };
  revalidatePath("/informes", "layout");
  redirect("/informes");
}
