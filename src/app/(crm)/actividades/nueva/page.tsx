import type { Metadata } from "next";
import { RecordFormPage } from "@/components/records/RecordFormPage";
import { requireUser } from "@/lib/session";
import { todayISO } from "@/lib/format";

export const metadata: Metadata = { title: "Nueva actividad" };

export default async function NewActivityPage({ searchParams }: PageProps<"/actividades/nueva">) {
  const [user, sp] = await Promise.all([requireUser(), searchParams]);
  const date = typeof sp.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.fecha) ? sp.fecha : todayISO();
  const meeting = sp.tipo === "meeting";
  return (
    <RecordFormPage object="activities" user={user} returnTo={typeof sp.volver === "string" && sp.volver.startsWith("/") ? sp.volver : undefined}
      defaults={{
        activity_type: meeting ? "meeting" : "task",
        status: "pending",
        priority: "normal",
        due_date: date,
        // 9:00 a. m. hora de Colombia
        start_at: meeting ? `${date}T14:00:00Z` : null,
        end_at: meeting ? `${date}T15:00:00Z` : null,
        owner_id: user.id,
      }} />
  );
}
