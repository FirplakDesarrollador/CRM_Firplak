import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { ObjectIcon } from "@/components/ui/icons";
import { getObjectDef } from "@/lib/records/data";
import { editableFields } from "@/lib/records/form";
import { isObjectKey } from "@/lib/objects";
import { IMPORTABLE, MATCH_FIELDS } from "@/lib/import/config";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { ImportWizard } from "./ImportWizard";

import { Tr } from "@/components/ui/Tr";
export const metadata: Metadata = { title: "Importar datos" };

export default async function ImportObjectPage({ params }: PageProps<"/importar/[objeto]">) {
  const [user, { objeto }] = await Promise.all([requireUser(), params]);
  if (!isObjectKey(objeto) || !IMPORTABLE.includes(objeto)) notFound();
  const def = await getObjectDef(objeto);
  if (!can(user.access, def.permission, "create")) redirect("/importar");
  const fields = editableFields(def).map((f) => ({ name: f.name, label: f.label, type: f.type, required: Boolean(f.required) }));
  const matchFields = (MATCH_FIELDS[objeto] ?? [])
    .map((name) => def.fields.find((f) => f.name === name))
    .filter((f): f is NonNullable<typeof f> => Boolean(f))
    .map((f) => ({ name: f.name, label: f.label }));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link href="/importar" className="inline-flex items-center gap-1 text-sm font-medium text-muted no-underline hover:text-ink"><ChevronLeft size={16} /> <Tr>Importar datos</Tr></Link>
      <div className="flex items-center gap-3">
        <ObjectIcon object={objeto} />
        <div>
          <h1 className="text-xl font-medium"><Tr>Importar</Tr> · {def.plural}</h1>
        </div>
      </div>
      <ImportWizard object={objeto} label={def.label} plural={def.plural} path={def.path} fields={fields}
        matchFields={matchFields.filter((m) => fields.some((f) => f.name === m.name) || ["full_name"].includes(m.name))}
        canUpdate={can(user.access, def.permission, "edit")} />
    </div>
  );
}
