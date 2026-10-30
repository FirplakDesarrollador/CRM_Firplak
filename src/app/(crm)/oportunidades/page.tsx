import type { Metadata } from "next";
import Link from "next/link";
import { KanbanSquare } from "lucide-react";
import { ObjectListPage } from "@/components/records/ObjectListPage";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Oportunidades" };

export default async function OpportunitiesPage({ searchParams }: PageProps<"/oportunidades">) {
  const user = await requireUser();
  return (
    <ObjectListPage
      object="opportunities"
      user={user}
      searchParams={await searchParams}
      newHref="/oportunidades/nueva"
      newLabel="Nueva oportunidad"
      extraActions={<Link href="/oportunidades/pipeline" className="btn"><KanbanSquare size={16} /> Ver pipeline</Link>}
    />
  );
}
