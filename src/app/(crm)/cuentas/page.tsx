import type { Metadata } from "next";
import { ObjectListPage } from "@/components/records/ObjectListPage";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Cuentas" };

export default async function AccountsPage({ searchParams }: PageProps<"/cuentas">) {
  const user = await requireUser();
  return (
    <ObjectListPage object="accounts" user={user} searchParams={await searchParams} newHref="/cuentas/nueva" newLabel="Nueva cuenta" />
  );
}
