import type { Metadata } from "next";
import { ObjectListPage } from "@/components/records/ObjectListPage";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Campañas" };

export default async function CampaignsPage({ searchParams }: PageProps<"/campanas">) {
  const user = await requireUser();
  return (
    <ObjectListPage object="campaigns" user={user} searchParams={await searchParams} newHref="/campanas/nueva"
      newLabel="Nueva campaña" />
  );
}
