"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { allowedEmailDomains, hasSupabaseEnv, siteUrl } from "@/lib/env";
import { applyProfileAppearance } from "@/lib/appearance";
import type { FormState } from "@/lib/records/form";

function safeNext(next: FormDataEntryValue | null) {
  const value = String(next ?? "");
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return host ? `${proto}://${host}` : siteUrl;
}

function translateAuthError(message: string) {
  if (/invalid login credentials/i.test(message)) return "Correo o contraseña incorrectos.";
  if (/email not confirmed/i.test(message)) return "Confirma tu correo antes de ingresar (revisa tu bandeja de entrada).";
  if (/already registered|already exists/i.test(message)) return "Ya existe una cuenta con ese correo.";
  if (/password should be at least/i.test(message)) return "La contraseña debe tener al menos 8 caracteres.";
  if (/rate limit/i.test(message)) return "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.";
  if (/signups not allowed/i.test(message)) return "El registro público está deshabilitado. Pide una invitación al administrador.";
  return message;
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!hasSupabaseEnv()) return { message: "Configura Supabase en .env.local antes de ingresar." };
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { message: "Escribe tu correo y contraseña.", values: { email } };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { message: translateAuthError(error.message), values: { email } };
  await applyProfileAppearance(supabase, data.user.id);
  redirect(safeNext(formData.get("next")));
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!hasSupabaseEnv()) return { message: "Configura Supabase en .env.local antes de registrarte." };
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const values = { full_name: fullName, email };

  const errors: Record<string, string> = {};
  if (!fullName) errors.full_name = "Escribe tu nombre";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Correo no válido";
  if (password.length < 8) errors.password = "Mínimo 8 caracteres";
  const domains = allowedEmailDomains();
  if (domains.length && !domains.includes(email.split("@")[1] ?? "")) {
    errors.email = `Solo se permiten correos ${domains.map((d) => `@${d}`).join(", ")}`;
  }
  if (Object.keys(errors).length) return { errors, values };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName }, emailRedirectTo: `${await origin()}/auth/callback` },
  });
  if (error) return { message: translateAuthError(error.message), values };
  if (data.session) redirect("/");
  return { ok: true, message: "Te enviamos un correo para confirmar tu cuenta. Ábrelo para activar el acceso." };
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!hasSupabaseEnv()) return { message: "Configura Supabase en .env.local." };
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { errors: { email: "Escribe tu correo" } };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await origin()}/auth/callback?next=/auth/restablecer`,
  });
  if (error) return { message: translateAuthError(error.message), values: { email } };
  return { ok: true, message: "Si el correo está registrado, recibirás un enlace para crear una nueva contraseña." };
}

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { errors: { password: "Mínimo 8 caracteres" } };
  if (password !== confirm) return { errors: { confirm: "Las contraseñas no coinciden" } };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { message: translateAuthError(error.message) };
  return { ok: true, message: "Contraseña actualizada." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
