import Link from "next/link";
import { Plus } from "lucide-react";
import { ObjectIcon } from "@/components/ui/icons";
import { Alert } from "@/components/ui/Alert";
import { can, canSystem } from "@/lib/permissions";
import type { CurrentUser } from "@/lib/session";
import type { ObjectKey } from "@/lib/objects";
import { getListViews, getObjectDef, getPipelines, getUsers, listRecords } from "@/lib/records/data";
import { parseListParams } from "@/lib/records/filters";
import { ListTable } from "./ListTable";
import { ListToolbar } from "./ListToolbar";

type SP = Record<string, string | string[] | undefined>;

export function flatParams(sp: SP): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    const value = Array.isArray(v) ? v[0] : v;
    if (value) out[k] = value;
  }
  return out;
}

export async function ObjectListPage({
  object,
  user,
  searchParams,
  newHref,
  newLabel,
  extraActions,
  defaultViewName,
}: {
  object: ObjectKey;
  user: CurrentUser;
  searchParams: SP;
  newHref: string;
  newLabel: string;
  extraActions?: React.ReactNode;
  defaultViewName?: string;
}) {
  const [def, views, users, pipelines] = await Promise.all([getObjectDef(object), getListViews(object), getUsers(), getPipelines()]);
  const current = flatParams(searchParams);
  const view = views.find((v) => v.id === current.view) ?? null;
  const params = parseListParams(def, searchParams, view?.definition ?? null, user.preferences.page_size);
  const { rows, count, error } = await listRecords(def, params, user.id);
  const exportQs = new URLSearchParams(current).toString();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ObjectIcon object={object} />
          <div>
            <p className="eyebrow">{def.plural}</p>
            <h1 className="text-xl font-medium">{view?.name ?? defaultViewName ?? `Todas las ${def.plural.toLowerCase()}`}</h1>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {extraActions}
          {can(user.access, def.permission, "create") && (
            <Link href={newHref} className="btn btn-primary"><Plus size={16} /> {newLabel}</Link>
          )}
        </div>
      </div>
      <ListToolbar
        object={object}
        fields={def.fields}
        views={views}
        currentViewId={view?.id ?? null}
        userId={user.id}
        canShare={canSystem(user.access, "customize")}
        canExport={canSystem(user.access, "export")}
        q={params.q}
        scope={params.scope}
        filters={params.filters}
        columns={params.columns}
        sort={params.sort}
        users={users}
        pipelines={pipelines}
        defaultViewName={defaultViewName ?? `Todas las ${def.plural.toLowerCase()}`}
        hasOwner={def.hasOwner}
        exportHref={`/api/export/${object}${exportQs ? `?${exportQs}` : ""}`}
      />
      {error && <Alert tone="error">No se pudo cargar la lista: {error}</Alert>}
      <ListTable def={def} rows={rows} count={count} params={params} current={current} basePath={def.path} />
    </div>
  );
}
