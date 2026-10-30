"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/session";
import type { FormState } from "@/lib/records/form";
import { ms365Configured } from "@/lib/ms365/config";
import { getConnection } from "@/lib/ms365/graph";
import { sendViaOutlook } from "@/lib/ms365/sync";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const list = (raw: string) => raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
const uuidOrNull = (v: FormDataEntryValue | null) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);

export type SendState = FormState & { mailto?: string; returnTo?: string };

/**
 * Envía el correo con Resend (si RESEND_API_KEY y EMAIL_FROM están configurados) o
 * prepara un enlace mailto para el cliente de correo del usuario. En ambos casos lo
 * registra como actividad completada en el registro relacionado.
 */
export async function sendEmail(_prev: SendState, fd: FormData): Promise<SendState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const to = list(String(fd.get("to") ?? ""));
  const cc = list(String(fd.get("cc") ?? ""));
  const subject = String(fd.get("subject") ?? "").trim();
  const body = String(fd.get("body") ?? "").trim();
  const errors: Record<string, string> = {};
  if (!to.length || to.some((e) => !EMAIL_RE.test(e))) errors.to = "Escribe uno o más correos válidos";
  if (cc.some((e) => !EMAIL_RE.test(e))) errors.cc = "Hay un correo no válido en copia";
  if (!subject) errors.subject = "Escribe el asunto";
  if (!body) errors.body = "Escribe el mensaje";
  if (Object.keys(errors).length) return { errors };

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  let delivery: "provider" | "client" | "outlook" = "client";
  let providerId: string | null = null;
  // Con la cuenta de Microsoft conectada, sale del buzón de Outlook de la persona.
  const outlook = ms365Configured() ? await getConnection(user.id) : null;

  if (outlook?.settings.send_via_outlook) {
    try {
      await sendViaOutlook(outlook, { to, cc, subject, body });
      delivery = "outlook";
    } catch (e) {
      return { message: `Outlook no pudo enviar el correo: ${(e as Error).message}` };
    }
  } else if (apiKey && from) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, cc: cc.length ? cc : undefined, reply_to: user.email, subject, text: body }),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) return { message: `El proveedor de correo rechazó el envío: ${json.message ?? res.statusText}` };
    delivery = "provider";
    providerId = json.id ?? null;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("activities").insert({
    activity_type: "email",
    subject,
    description: body,
    status: "completed",
    email_to: to.join(", "),
    email_cc: cc.join(", ") || null,
    email_delivery: delivery,
    email_provider_id: providerId,
    account_id: uuidOrNull(fd.get("account_id")),
    contact_id: uuidOrNull(fd.get("contact_id")),
    opportunity_id: uuidOrNull(fd.get("opportunity_id")),
    lead_id: uuidOrNull(fd.get("lead_id")),
    case_id: uuidOrNull(fd.get("case_id")),
    owner_id: user.id,
  });
  if (error) return { message: `No se pudo registrar el correo: ${error.message}` };
  revalidatePath("/", "layout");

  const returnTo = String(fd.get("return_to") ?? "");
  const safeReturn = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/actividades";
  if (delivery !== "client") redirect(safeReturn);

  const params = new URLSearchParams();
  if (cc.length) params.set("cc", cc.join(","));
  params.set("subject", subject);
  params.set("body", body);
  return {
    ok: true,
    message: "Correo registrado en el CRM. Se abrirá tu cliente de correo para enviarlo.",
    mailto: `mailto:${to.join(",")}?${params.toString().replace(/\+/g, "%20")}`,
    returnTo: safeReturn,
  };
}

export async function saveTemplate(id: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const name = String(fd.get("name") ?? "").trim();
  if (!name) return { message: "Ponle un nombre a la plantilla" };
  const payload = {
    name,
    category: String(fd.get("category") ?? "").trim() || "General",
    subject: String(fd.get("subject") ?? ""),
    body: String(fd.get("body") ?? ""),
    is_active: id ? fd.get("is_active") === "on" : true,
    is_shared: fd.get("is_shared") === "on",
  };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("email_templates").update(payload).eq("id", id)
    : await supabase.from("email_templates").insert({ ...payload, owner_id: user.id });
  if (error) return { message: error.message.includes("row-level security") ? "No tienes permiso para guardar o compartir esta plantilla." : error.message };
  revalidatePath("/correo", "layout");
  return { ok: true, message: id ? "Plantilla actualizada" : "Plantilla creada" };
}

export async function deleteTemplate(id: string, _prev?: FormState, _fd?: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("email_templates").delete().eq("id", id).select("id");
  if (error) return { message: error.message };
  if (!data?.length) return { message: "No puedes eliminar esta plantilla." };
  revalidatePath("/correo", "layout");
  return { ok: true };
}
