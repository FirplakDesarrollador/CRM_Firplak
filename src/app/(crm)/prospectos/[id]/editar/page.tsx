import type { Metadata } from "next";
import { RecordFormPage } from "@/components/records/RecordFormPage";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Editar prospecto" };

export default async function EditLeadPage({ params }: PageProps<"/prospectos/[id]/editar">) {
  const [user, { id }] = await Promise.all([requireUser(), params]);
  return <RecordFormPage object="leads" user={user} id={id} />;
}
