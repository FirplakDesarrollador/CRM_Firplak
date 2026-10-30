import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ObjectIcon } from "@/components/ui/icons";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate, todayISO } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { EmailComposer } from "./EmailComposer";

import { Tr } from "@/components/ui/Tr";
export const metadata: Metadata = { title: "Enviar correo" };

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export default async function NewEmailPage({ searchParams }: PageProps<"/correo/nuevo">) {
  const [user, sp] = await Promise.all([requireUser(), searchParams]);
  const supabase = await createClient();

  const related: { account_id?: string; contact_id?: string; opportunity_id?: string; lead_id?: string; case_id?: string } = {};
  const merge: Record<string, string> = {
    "usuario.nombre": user.fullName,
    "usuario.cargo": user.title ?? "",
    "usuario.telefono": user.phone ?? "",
    "usuario.correo": user.email,
    fecha: formatDate(todayISO()),
  };
  let to = "";
  let recipient = "";
  let returnTo = "/actividades";

  const setContact = (c: { id?: string; first_name: string | null; full_name: string | null; title: string | null; email: string | null } | null) => {
    if (!c) return;
    if (c.id) related.contact_id = c.id;
    merge["contacto.nombre"] = c.first_name || c.full_name || "";
    merge["contacto.nombre_completo"] = c.full_name ?? "";
    merge["contacto.cargo"] = c.title ?? "";
    to = c.email ?? to;
    recipient = c.full_name ?? recipient;
  };

  if (isUuid(sp.contacto)) {
    const { data } = await supabase.from("contacts")
      .select("id, first_name, full_name, title, email, account:accounts!contacts_account_id_fkey(id, name)").eq("id", sp.contacto).maybeSingle();
    setContact(data);
    if (data?.account) { related.account_id = data.account.id; merge["cuenta.nombre"] = data.account.name; }
    returnTo = `/contactos/${sp.contacto}`;
  } else if (isUuid(sp.prospecto)) {
    const { data } = await supabase.from("leads").select("id, first_name, full_name, title, email, company").eq("id", sp.prospecto).maybeSingle();
    if (data) {
      related.lead_id = data.id;
      setContact({ ...data, id: undefined });
      merge["cuenta.nombre"] = data.company;
    }
    returnTo = `/prospectos/${sp.prospecto}`;
  } else if (isUuid(sp.oportunidad)) {
    const { data } = await supabase.from("opportunities")
      .select("id, name, amount, close_date, account:accounts!opportunities_account_id_fkey(id, name), contact:contacts!opportunities_contact_id_fkey(id, first_name, full_name, title, email)")
      .eq("id", sp.oportunidad).maybeSingle();
    if (data) {
      related.opportunity_id = data.id;
      merge["oportunidad.nombre"] = data.name;
      merge["oportunidad.valor"] = `${formatCurrency(data.amount)} COP`;
      merge["oportunidad.fecha_cierre"] = formatDate(data.close_date);
      if (data.account) { related.account_id = data.account.id; merge["cuenta.nombre"] = data.account.name; }
      setContact(data.contact);
    }
    returnTo = `/oportunidades/${sp.oportunidad}`;
  } else if (isUuid(sp.caso)) {
    const { data } = await supabase.from("cases")
      .select("id, case_number, subject, account:accounts!cases_account_id_fkey(id, name), contact:contacts!cases_contact_id_fkey(id, first_name, full_name, title, email)")
      .eq("id", sp.caso).maybeSingle();
    if (data) {
      related.case_id = data.id;
      merge["caso.numero"] = data.case_number;
      merge["caso.asunto"] = data.subject;
      if (data.account) { related.account_id = data.account.id; merge["cuenta.nombre"] = data.account.name; }
      setContact(data.contact);
    }
    returnTo = `/casos/${sp.caso}`;
  }

  const { data: templates } = await supabase
    .from("email_templates").select("id, name, category, subject, body").eq("is_active", true).order("category").order("name");
  const providerReady = Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href={returnTo} className="inline-flex items-center gap-1 text-sm font-medium text-muted no-underline hover:text-ink"><ChevronLeft size={16} /> <Tr>Volver</Tr></Link>
      <div className="flex items-center gap-3">
        <ObjectIcon object="activities" />
        <div>
          <p className="eyebrow"><Tr>Correo</Tr></p>
          <h1 className="text-xl font-medium">{recipient ? `Escribir a ${recipient}` : "Nuevo correo"}</h1>
        </div>
      </div>
      <EmailComposer to={to} related={related} merge={merge} templates={templates ?? []} returnTo={returnTo} providerReady={providerReady} />
    </div>
  );
}
