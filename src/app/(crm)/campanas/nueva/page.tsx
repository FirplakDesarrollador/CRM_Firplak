import type { Metadata } from "next";
import { RecordFormPage } from "@/components/records/RecordFormPage";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Nueva campaña" };

export default async function NewCampaignPage() {
  const user = await requireUser();
  return <RecordFormPage object="campaigns" user={user} defaults={{ status: "Planeada", campaign_type: "Evento", is_active: true }} />;
}
