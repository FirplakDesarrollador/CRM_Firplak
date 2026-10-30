import type { Metadata } from "next";
import { ObjectListPage } from "@/components/records/ObjectListPage";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Casos" };

export default async function CasesPage({ searchParams }: PageProps<"/casos">) {
  const user = await requireUser();
  return (
    <ObjectListPage object="cases" user={user} searchParams={await searchParams} newHref="/casos/nuevo"
      newLabel="Nuevo caso" defaultViewName="Todos los casos" />
  );
}
