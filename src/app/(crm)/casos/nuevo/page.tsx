import type { Metadata } from "next";
import { RecordFormPage } from "@/components/records/RecordFormPage";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Nuevo caso" };

export default async function NewCasePage({ searchParams }: PageProps<"/casos/nuevo">) {
  const [user, sp] = await Promise.all([requireUser(), searchParams]);
  const defaults: Record<string, unknown> = { status: "Nuevo", priority: "Media" };
  const supabase = await createClient();
  if (typeof sp.account === "string") {
    const { data } = await supabase.from("accounts").select("id, name").eq("id", sp.account).maybeSingle();
    if (data) Object.assign(defaults, { account_id: data.id, account: data });
  }
  if (typeof sp.contact === "string") {
    const { data } = await supabase.from("contacts").select("id, full_name").eq("id", sp.contact).maybeSingle();
    if (data) Object.assign(defaults, { contact_id: data.id, contact: data });
  }
  return <RecordFormPage object="cases" user={user} defaults={defaults} />;
}
