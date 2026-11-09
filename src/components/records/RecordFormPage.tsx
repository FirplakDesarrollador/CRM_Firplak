import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { ObjectIcon } from "@/components/ui/icons";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/lib/session";
import type { ObjectKey } from "@/lib/objects";
import { recordTitle } from "@/lib/objects";
import { getClientPriceBooks, getGeo, getObjectDef, getPipelines, getRecord, getRecordAccess, getUsers } from "@/lib/records/data";
import { editableFields } from "@/lib/records/form";
import { saveRecord } from "@/lib/records/actions";
import { makeT } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { RecordForm } from "./RecordForm";

export async function RecordFormPage({
  object,
  user,
  id,
  defaults,
  returnTo,
}: {
  object: ObjectKey;
  user: CurrentUser;
  id?: string;
  defaults?: Record<string, unknown>;
  returnTo?: string;
}) {
  const [def, users, pipelines, locale] = await Promise.all([getObjectDef(object), getUsers(), getPipelines(), getLocale()]);
  const t = makeT(locale);
  const geo = def.fields.some((f) => f.geoRole) ? await getGeo() : undefined;
  const choices = def.fields.some((f) => f.choices === "clientPriceBooks") ? { clientPriceBooks: await getClientPriceBooks() } : undefined;
  let record: Record<string, unknown> | null = null;

  if (id) {
    record = await getRecord(def, id);
    if (!record) notFound();
    const { canEdit } = await getRecordAccess(object, (record.owner_id as string) ?? null, id);
    if (!canEdit) redirect(`${def.path}/${id}`);
  } else {
    if (!can(user.access, def.permission, "create")) redirect(def.path);
    record = defaults ?? null;
  }

  const masculine = ["contacts", "leads", "products", "cases", "orders"].includes(object);
  const title = id
    ? `${t("Editar:")} ${recordTitle(def, record!)}`
    : locale === "en" ? `New ${def.label.toLowerCase()}` : `${masculine ? "Nuevo" : "Nueva"} ${def.label.toLowerCase()}`;
  const cancelHref = returnTo ?? (id ? `${def.path}/${id}` : def.path);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href={cancelHref} className="inline-flex items-center gap-1 text-sm font-semibold text-muted no-underline hover:text-ink">
        <ChevronLeft size={16} /> {t("Volver")}
      </Link>
      <div className="flex items-center gap-3">
        <ObjectIcon object={object} />
        <h1 className="text-xl font-medium">{title}</h1>
      </div>
      <RecordForm
        def={{ sections: def.sections, label: def.label }}
        fields={editableFields(def).filter((f) => id || !f.createHidden)}
        record={record}
        ctx={{ users, pipelines, geo, choices, isNew: !id }}
        action={saveRecord.bind(null, object, id ?? null)}
        cancelHref={cancelHref}
        returnTo={returnTo}
      />
    </div>
  );
}
