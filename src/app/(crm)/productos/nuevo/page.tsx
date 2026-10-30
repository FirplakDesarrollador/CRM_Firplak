import type { Metadata } from "next";
import { RecordFormPage } from "@/components/records/RecordFormPage";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Nuevo producto" };

export default async function NewProductPage() {
  const user = await requireUser();
  return <RecordFormPage object="products" user={user} defaults={{ unit: "Unidad", is_active: true }} />;
}
