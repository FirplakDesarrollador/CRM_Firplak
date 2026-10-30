import type { Metadata } from "next";
import { RecordFormPage } from "@/components/records/RecordFormPage";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Editar caso" };

export default async function EditCasePage({ params }: PageProps<"/casos/[id]/editar">) {
  const [user, { id }] = await Promise.all([requireUser(), params]);
  return <RecordFormPage object="cases" user={user} id={id} />;
}
