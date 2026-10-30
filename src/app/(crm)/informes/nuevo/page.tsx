import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ReportPage } from "@/components/reports/ReportPage";
import { isObjectKey } from "@/lib/objects";
import { parseDefinition } from "@/lib/reports/types";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Nuevo informe" };

export default async function NewReportPage({ searchParams }: PageProps<"/informes/nuevo">) {
  const [user, sp] = await Promise.all([requireUser(), searchParams]);
  const object = typeof sp.objeto === "string" ? sp.objeto : "";
  if (!isObjectKey(object)) redirect("/informes");
  const definition = parseDefinition(typeof sp.def === "string" ? sp.def : null);
  return (
    <ReportPage object={object} user={user} definition={{ chart: "bar", aggregate: { fn: "count" }, ...definition }} reportId={null}
      meta={{ name: "", folder: "Mis informes", description: "", isShared: false }} canSaveExisting={false} />
  );
}
