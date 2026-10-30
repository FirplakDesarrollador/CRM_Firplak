import type { Metadata } from "next";
import { ObjectListPage } from "@/components/records/ObjectListPage";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Cotizaciones" };

export default async function QuotesPage({ searchParams }: PageProps<"/cotizaciones">) {
  const user = await requireUser();
  return (
    <ObjectListPage object="quotes" user={user} searchParams={await searchParams} newHref="/cotizaciones/nueva"
      newLabel="Nueva cotización" />
  );
}
