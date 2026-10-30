import type { Metadata } from "next";
import { RecordFormPage } from "@/components/records/RecordFormPage";
import { requireUser } from "@/lib/session";
import { todayISO } from "@/lib/format";

export const metadata: Metadata = { title: "Nueva actividad" };

export default async function NewActivityPage() {
  const user = await requireUser();
  return (
    <RecordFormPage object="activities" user={user}
      defaults={{ activity_type: "task", status: "pending", priority: "normal", due_date: todayISO(), owner_id: user.id }} />
  );
}
