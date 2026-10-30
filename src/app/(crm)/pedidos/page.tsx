import type { Metadata } from "next";
import { ObjectListPage } from "@/components/records/ObjectListPage";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Pedidos" };

export default async function OrdersPage({ searchParams }: PageProps<"/pedidos">) {
  const user = await requireUser();
  return (
    <ObjectListPage object="orders" user={user} searchParams={await searchParams} newHref="/pedidos/nuevo"
      newLabel="Nuevo pedido" defaultViewName="Todos los pedidos" />
  );
}
