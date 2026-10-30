import type { Metadata } from "next";
import { RecordFormPage } from "@/components/records/RecordFormPage";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Editar oportunidad" };

export default async function EditOpportunityPage({ params }: PageProps<"/oportunidades/[id]/editar">) {
  const [user, { id }] = await Promise.all([requireUser(), params]);
  return <RecordFormPage object="opportunities" user={user} id={id} />;
}
