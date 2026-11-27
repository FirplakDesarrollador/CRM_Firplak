import type { Metadata } from "next";
import { RecordFormPage } from "@/components/records/RecordFormPage";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/session";
import { CartField } from "@/components/products/Cart";

export const metadata: Metadata = { title: "Nueva cotización" };

export default async function NewQuotePage({ searchParams }: PageProps<"/cotizaciones/nueva">) {
  const [user, sp] = await Promise.all([requireUser(), searchParams]);
  const defaults: Record<string, unknown> = { status: "Borrador", tax_rate: 19, shipping: 0, validity_days: 30, sale_type: "Estándar" };
  if (typeof sp.opportunity === "string") {
    const supabase = await createClient();
    const { data } = await supabase
      .from("opportunities")
      .select("id, name, project_segment, sale_type, account:accounts!opportunities_account_id_fkey(id, name, industry, market), contact:contacts!opportunities_contact_id_fkey(id, full_name)")
      .eq("id", sp.opportunity)
      .maybeSingle();
    if (data) {
      Object.assign(defaults, { opportunity_id: data.id, opportunity: data, name: `${data.name} · Cotización` });
      if (data.contact) Object.assign(defaults, { contact_id: data.contact.id, contact: data.contact });
      // La cuenta es la de la oportunidad; el segmento de obra y el tipo, los que ya tenga.
      if (data.account) Object.assign(defaults, { account_id: data.account.id, account: data.account });
      Object.assign(defaults, { project_segment: data.project_segment, sale_type: data.sale_type });
    }
  }
  // Desde la selección de productos: el formulario avisa qué productos entran al guardar.
  return <RecordFormPage object="quotes" user={user} defaults={defaults} extra={sp.seleccion === "1" ? <CartField /> : undefined} />;
}
