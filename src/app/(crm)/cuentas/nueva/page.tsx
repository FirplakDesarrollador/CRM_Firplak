import type { Metadata } from "next";
import { RecordFormPage } from "@/components/records/RecordFormPage";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Nueva cuenta" };

export default async function NewAccountPage() {
  const user = await requireUser();
  return <RecordFormPage object="accounts" user={user} defaults={{ account_type: "Prospecto", billing_country: "Colombia" }} />;
}
