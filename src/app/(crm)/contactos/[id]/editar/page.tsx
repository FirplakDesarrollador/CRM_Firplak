import type { Metadata } from "next";
import { RecordFormPage } from "@/components/records/RecordFormPage";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Editar contacto" };

export default async function EditContactPage({ params }: PageProps<"/contactos/[id]/editar">) {
  const [user, { id }] = await Promise.all([requireUser(), params]);
  return <RecordFormPage object="contacts" user={user} id={id} />;
}
