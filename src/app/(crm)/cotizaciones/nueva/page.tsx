import type { Metadata } from "next";
import { RecordFormPage } from "@/components/records/RecordFormPage";
import { createClient } from "@/lib/supabase/server";
import { addDaysISO, todayISO } from "@/lib/format";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Nueva cotización" };

export default async function NewQuotePage({ searchParams }: PageProps<"/cotizaciones/nueva">) {
  const [user, sp] = await Promise.all([requireUser(), searchParams]);
  const defaults: Record<string, unknown> = { status: "Borrador", tax_rate: 19, shipping: 0, expiration_date: addDaysISO(todayISO(), 30) };
  if (typeof sp.opportunity === "string") {
    const supabase = await createClient();
    const { data } = await supabase
      .from("opportunities")
      .select("id, name, contact:contacts!opportunities_contact_id_fkey(id, full_name)")
      .eq("id", sp.opportunity)
      .maybeSingle();
    if (data) {
      Object.assign(defaults, { opportunity_id: data.id, opportunity: data, name: `${data.name} · Cotización` });
      if (data.contact) Object.assign(defaults, { contact_id: data.contact.id, contact: data.contact });
    }
  }
  return <RecordFormPage object="quotes" user={user} defaults={defaults} />;
}
