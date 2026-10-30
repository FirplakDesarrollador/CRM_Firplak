"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/session";
import { isObjectKey } from "@/lib/objects";
import { getObjectDef, getRecord } from "@/lib/records/data";
import type { FormState } from "@/lib/records/form";
import { findApplicableProcess } from "./server";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const safePath = (p: string) => (p.startsWith("/") && !p.startsWith("//") ? p : "/aprobaciones");

function refresh(path: string) {
  revalidatePath(path);
  revalidatePath("/aprobaciones");
}

export async function submitForApproval(object: string, id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isObjectKey(object)) return { message: "Objeto no válido" };
  const def = await getObjectDef(object);
  const row = await getRecord(def, id);
  if (!row) return { message: "Registro no encontrado" };
  const process = await findApplicableProcess(object, row, user.id);
  if (!process) return { message: "Ningún proceso de aprobación aplica a este registro" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_approval", { p_process: process.id, p_record: id, p_comment: str(fd, "comment") });
  if (error) return { message: error.message };
  refresh(`${def.path}/${id}`);
  return { ok: true, message: "Enviado a aprobación" };
}

export async function decideApproval(requestId: string, path: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const approve = str(fd, "decision") === "approve";
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_approval", { p_request: requestId, p_approve: approve, p_comment: str(fd, "comment") });
  if (error) return { message: error.message };
  refresh(safePath(path));
  return { ok: true, message: approve ? "Solicitud aprobada" : "Solicitud rechazada" };
}

export async function recallApproval(requestId: string, path: string, _prev?: FormState, _fd?: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const supabase = await createClient();
  const { error } = await supabase.rpc("recall_approval", { p_request: requestId });
  if (error) return { message: error.message };
  refresh(safePath(path));
  return { ok: true, message: "Solicitud retirada" };
}
