import type { Metadata } from "next";
import Link from "next/link";
import { Tags } from "lucide-react";
import { ObjectListPage } from "@/components/records/ObjectListPage";
import { requireUser } from "@/lib/session";

import { Tr } from "@/components/ui/Tr";
export const metadata: Metadata = { title: "Productos" };

export default async function ProductsPage({ searchParams }: PageProps<"/productos">) {
  const user = await requireUser();
  return (
    <ObjectListPage object="products" user={user} searchParams={await searchParams} newHref="/productos/nuevo"
      newLabel="Nuevo producto" defaultViewName="Todos los productos"
      extraActions={<Link href="/productos/listas" className="btn"><Tags size={16} /> <Tr>Listas de precios</Tr></Link>} />
  );
}
