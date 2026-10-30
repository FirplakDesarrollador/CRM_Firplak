import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ReportPage } from "@/components/reports/ReportPage";
import { ActionForm, ConfirmSubmit } from "@/components/ui/ActionForm";
import { createClient } from "@/lib/supabase/server";
import { isObjectKey } from "@/lib/objects";
import { canSystem } from "@/lib/permissions";
import { deleteReport } from "@/lib/reports/actions";
import { parseDefinition } from "@/lib/reports/types";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Informe" };

export default async function ReportDetailPage({ params, searchParams }: PageProps<"/informes/[id]">) {
  const [user, { id }, sp] = await Promise.all([requireUser(), params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: report } = await supabase.from("reports").select("*").eq("id", id).maybeSingle();
  if (!report || !isObjectKey(report.object)) notFound();
  const definition = typeof sp.def === "string" ? parseDefinition(sp.def) : parseDefinition(report.definition);
  const canEdit = report.owner_id === user.id || (report.is_shared && canSystem(user.access, "customize"));

  return (
    <ReportPage
      object={report.object}
      user={user}
      definition={definition}
      reportId={id}
      meta={{ name: report.name, folder: report.folder, description: report.description ?? "", isShared: report.is_shared }}
      canSaveExisting={canEdit}
      actions={canEdit ? (
        <ActionForm action={deleteReport.bind(null, id)} className="flex flex-col items-end">
          <ConfirmSubmit message={`¿Eliminar el informe “${report.name}”?`} className="btn btn-danger"><Trash2 size={15} /> Eliminar</ConfirmSubmit>
        </ActionForm>
      ) : null}
    />
  );
}
