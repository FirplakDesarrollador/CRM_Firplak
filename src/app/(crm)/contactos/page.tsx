import type { Metadata } from "next";
import { ObjectListPage } from "@/components/records/ObjectListPage";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Contactos" };

export default async function ContactsPage({ searchParams }: PageProps<"/contactos">) {
  const user = await requireUser();
  return (
    <ObjectListPage object="contacts" user={user} searchParams={await searchParams} newHref="/contactos/nuevo"
      newLabel="Nuevo contacto" defaultViewName="Todos los contactos" />
  );
}
