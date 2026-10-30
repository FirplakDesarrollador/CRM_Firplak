import type { Metadata } from "next";
import { RecordFormPage } from "@/components/records/RecordFormPage";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Editar cotización" };

export default async function EditQuotePage({ params }: PageProps<"/cotizaciones/[id]/editar">) {
  const [user, { id }] = await Promise.all([requireUser(), params]);
  return <RecordFormPage object="quotes" user={user} id={id} />;
}
