import Link from "next/link";
import { ChevronLeft, Download } from "lucide-react";
import { ObjectIcon } from "@/components/ui/icons";
import { getObjectDef, getPipelines, getUsers } from "@/lib/records/data";
import { runReport } from "@/lib/reports/engine";
import type { ReportDefinition } from "@/lib/reports/types";
import { canSystem } from "@/lib/permissions";
import type { ObjectKey } from "@/lib/objects";
import type { CurrentUser } from "@/lib/session";
import { ReportBuilder } from "./ReportBuilder";
import { ReportResults } from "./ReportResults";

import { Tr } from "@/components/ui/Tr";
export async function ReportPage({
  object, user, definition, reportId, meta, canSaveExisting, actions,
}: {
  object: ObjectKey;
  user: CurrentUser;
  definition: ReportDefinition;
  reportId: string | null;
  meta: { name: string; folder: string; description: string; isShared: boolean };
  canSaveExisting: boolean;
  actions?: React.ReactNode;
}) {
  const [def, users, pipelines] = await Promise.all([getObjectDef(object), getUsers(), getPipelines()]);
  const result = await runReport(def, definition, user.id);
  const exportQs = new URLSearchParams({ objeto: object, def: JSON.stringify(definition), nombre: meta.name || "informe" });

  return (
    <div className="space-y-4">
      <Link href="/informes" className="inline-flex items-center gap-1 text-sm font-medium text-muted no-underline hover:text-ink"><ChevronLeft size={16} /> <Tr>Informes</Tr></Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ObjectIcon object={object} />
          <div>
            <h1 className="text-xl font-medium">{meta.name || "Informe sin guardar"}</h1>
            <p className="text-sm text-muted">Informe de {def.plural.toLowerCase()}{meta.folder ? ` · ${meta.folder}` : ""}</p>
            {meta.description && <p className="text-sm text-muted">{meta.description}</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canSystem(user.access, "export") && (
            <a href={`/api/informes/export?${exportQs}`} className="btn"><Download size={15} /> <Tr>Exportar CSV</Tr></a>
          )}
          {actions}
        </div>
      </div>
      <ReportBuilder object={object} fields={def.fields} initial={definition} users={users} pipelines={pipelines}
        reportId={reportId} meta={meta} canShare={canSystem(user.access, "customize")} canSaveExisting={canSaveExisting} />
      <ReportResults def={def} report={definition} result={result} />
    </div>
  );
}
