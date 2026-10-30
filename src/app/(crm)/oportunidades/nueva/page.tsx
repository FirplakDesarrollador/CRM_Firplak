import type { Metadata } from "next";
import { RecordFormPage } from "@/components/records/RecordFormPage";
import { requireUser } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getPipelines } from "@/lib/records/data";
import { addDaysISO, todayISO } from "@/lib/format";

export const metadata: Metadata = { title: "Nueva oportunidad" };

export default async function NewOpportunityPage({ searchParams }: PageProps<"/oportunidades/nueva">) {
  const [user, sp, pipelines] = await Promise.all([requireUser(), searchParams, getPipelines()]);
  const accountId = typeof sp.account === "string" ? sp.account : null;
  const contactId = typeof sp.contact === "string" ? sp.contact : null;
  const requestedPipeline = typeof sp.pipeline === "string" ? sp.pipeline : null;
  const pipeline = pipelines.find((p) => p.id === requestedPipeline) ?? pipelines.find((p) => p.is_default) ?? pipelines[0];
  const firstStage = pipeline?.stages.find((s) => s.category === "open");

  const defaults: Record<string, unknown> = {
    stage_id: firstStage?.id,
    close_date: addDaysISO(todayISO(), 30),
    opportunity_type: "Nuevo negocio",
  };
  const supabase = await createClient();
  if (accountId) {
    const { data } = await supabase.from("accounts").select("id, name").eq("id", accountId).maybeSingle();
    if (data) Object.assign(defaults, { account_id: data.id, account: data, name: `${data.name} · Nueva oportunidad` });
  }
  if (contactId) {
    const { data } = await supabase.from("contacts").select("id, full_name").eq("id", contactId).maybeSingle();
    if (data) Object.assign(defaults, { contact_id: data.id, contact: data });
  }
  return (
    <RecordFormPage object="opportunities" user={user} defaults={defaults} />
  );
}
