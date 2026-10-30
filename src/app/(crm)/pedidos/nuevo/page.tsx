import type { Metadata } from "next";
import { RecordFormPage } from "@/components/records/RecordFormPage";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/format";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Nuevo pedido" };

export default async function NewOrderPage({ searchParams }: PageProps<"/pedidos/nuevo">) {
  const [user, sp] = await Promise.all([requireUser(), searchParams]);
  const defaults: Record<string, unknown> = { order_date: todayISO(), tax_rate: 19, shipping: 0 };
  const supabase = await createClient();
  if (typeof sp.opportunity === "string") {
    const { data } = await supabase
      .from("opportunities")
      .select("id, name, account:accounts!opportunities_account_id_fkey(id, name), contact:contacts!opportunities_contact_id_fkey(id, full_name)")
      .eq("id", sp.opportunity)
      .maybeSingle();
    if (data) {
      Object.assign(defaults, { opportunity_id: data.id, opportunity: data, name: `${data.name} · Pedido` });
      if (data.account) Object.assign(defaults, { account_id: data.account.id, account: data.account });
      if (data.contact) Object.assign(defaults, { contact_id: data.contact.id, contact: data.contact });
    }
  } else if (typeof sp.account === "string") {
    const { data } = await supabase.from("accounts").select("id, name").eq("id", sp.account).maybeSingle();
    if (data) Object.assign(defaults, { account_id: data.id, account: data, name: `${data.name} · Pedido` });
  }
  return <RecordFormPage object="orders" user={user} defaults={defaults} />;
}
