import type { Metadata } from "next";
import { RecordFormPage } from "@/components/records/RecordFormPage";
import { requireUser } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getPipelines } from "@/lib/records/data";
import { addDaysISO, todayISO } from "@/lib/format";
import { pipelineFor } from "@/lib/records/pipelines";

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
    const { data } = await supabase.from("accounts").select("id, name, market, industry").eq("id", accountId).maybeSingle();
    if (data) {
      // La etapa inicial es la primera del pipeline del mercado y el canal de la cuenta.
      const channelPipeline = pipelineFor(pipelines, data.market, data.industry);
      const channelStage = channelPipeline?.stages.find((s) => s.category === "open");
      Object.assign(defaults, {
        account_id: data.id, account: { id: data.id, name: data.name, industry: data.industry, market: data.market }, name: `${data.name} · Nueva oportunidad`,
        ...(channelStage ? { stage_id: channelStage.id } : {}),
        currency: data.market === "Internacional" ? "USD" : "COP",
      });
    }
  }
  if (contactId) {
    const { data } = await supabase.from("contacts").select("id, full_name").eq("id", contactId).maybeSingle();
    if (data) Object.assign(defaults, { contact_id: data.id, contact: data });
  }
  return (
    <RecordFormPage object="opportunities" user={user} defaults={defaults} />
  );
}
