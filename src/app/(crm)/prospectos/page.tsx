import type { Metadata } from "next";
import { ObjectListPage } from "@/components/records/ObjectListPage";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Prospectos" };

export default async function LeadsPage({ searchParams }: PageProps<"/prospectos">) {
  const user = await requireUser();
  return (
    <ObjectListPage object="leads" user={user} searchParams={await searchParams} newHref="/prospectos/nuevo"
      newLabel="Nuevo prospecto" defaultViewName="Todos los prospectos" />
  );
}
