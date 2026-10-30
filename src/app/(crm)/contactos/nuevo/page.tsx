import type { Metadata } from "next";
import { RecordFormPage } from "@/components/records/RecordFormPage";
import { requireUser } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Nuevo contacto" };

export default async function NewContactPage({ searchParams }: PageProps<"/contactos/nuevo">) {
  const [user, sp] = await Promise.all([requireUser(), searchParams]);
  const accountId = typeof sp.account === "string" ? sp.account : null;
  const defaults: Record<string, unknown> = { mailing_country: "Colombia" };
  if (accountId) {
    const supabase = await createClient();
    const { data } = await supabase.from("accounts").select("id, name, billing_city, billing_state").eq("id", accountId).maybeSingle();
    if (data) Object.assign(defaults, { account_id: data.id, account: data, mailing_city: data.billing_city, mailing_state: data.billing_state });
  }
  return (
    <RecordFormPage object="contacts" user={user} defaults={defaults}
      returnTo={accountId ? `/cuentas/${accountId}` : undefined} />
  );
}
