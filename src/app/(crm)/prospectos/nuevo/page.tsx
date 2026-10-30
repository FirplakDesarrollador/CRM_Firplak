import type { Metadata } from "next";
import { RecordFormPage } from "@/components/records/RecordFormPage";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Nuevo prospecto" };

export default async function NewLeadPage({ searchParams }: PageProps<"/prospectos/nuevo">) {
  const [user, sp] = await Promise.all([requireUser(), searchParams]);
  const defaults: Record<string, unknown> = { status: "Nuevo", country: "Colombia" };
  if (typeof sp.campaign === "string") {
    const supabase = await createClient();
    const { data } = await supabase.from("campaigns").select("id, name").eq("id", sp.campaign).maybeSingle();
    if (data) Object.assign(defaults, { campaign_id: data.id, campaign: data });
  }
  return <RecordFormPage object="leads" user={user} defaults={defaults} />;
}
