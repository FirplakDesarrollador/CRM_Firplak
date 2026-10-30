import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown, Plus } from "lucide-react";
import { ObjectIcon } from "@/components/ui/icons";
import { Dropdown, menuItemClass } from "@/components/ui/Dropdown";
import { createClient } from "@/lib/supabase/server";
import { OBJECTS, isObjectKey } from "@/lib/objects";
import { can } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Informes" };

export default async function ReportsPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("reports")
    .select("id, name, description, object, folder, is_shared, owner_id, updated_at, owner:profiles!reports_owner_id_fkey(full_name)")
    .order("folder")
    .order("name");
  const reports = data ?? [];
  const folders = [...new Set(reports.map((r) => (r.owner_id === user.id && !r.is_shared ? "Mis informes" : r.folder)))].sort((a, b) =>
    a === "Mis informes" ? -1 : b === "Mis informes" ? 1 : a.localeCompare(b, "es"));
  const objects = (Object.keys(OBJECTS) as (keyof typeof OBJECTS)[]).filter((o) => can(user.access, OBJECTS[o].permission, "read"));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ObjectIcon object="dashboard" />
          <div>
            <p className="eyebrow">Análisis</p>
            <h1 className="text-xl font-medium">Informes</h1>
          </div>
        </div>
        <Dropdown label="Nuevo informe" className="btn btn-primary" trigger={<><Plus size={16} /> Nuevo informe <ChevronDown size={14} /></>}>
          <p className="px-2.5 pb-1 pt-1.5 text-[0.68rem] font-medium uppercase tracking-[0.18em] text-muted">Informe de…</p>
          {objects.map((o) => (
            <Link key={o} href={`/informes/nuevo?objeto=${o}`} className={menuItemClass}>{OBJECTS[o].plural}</Link>
          ))}
        </Dropdown>
      </div>

      {reports.length === 0 && <p className="text-muted">Aún no hay informes. Crea el primero con «Nuevo informe».</p>}
      {folders.map((folder) => {
        const list = reports.filter((r) => (r.owner_id === user.id && !r.is_shared ? "Mis informes" : r.folder) === folder);
        return (
          <section key={folder} className="card overflow-hidden">
            <div className="card-header"><h2 className="card-title">{folder} <span className="badge">{list.length}</span></h2></div>
            <table className="table">
              <thead><tr><th>Informe</th><th>Objeto</th><th>Descripción</th><th>Autor</th><th>Modificado</th></tr></thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/informes/${r.id}`} className="link">{r.name}</Link>{r.is_shared && <span className="badge ml-2">Compartido</span>}</td>
                    <td>{isObjectKey(r.object) ? OBJECTS[r.object].plural : r.object}</td>
                    <td className="max-w-md truncate text-muted">{r.description ?? "—"}</td>
                    <td>{r.owner?.full_name ?? "Firplak CRM"}</td>
                    <td>{formatDate(r.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
