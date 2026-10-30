import type { Metadata } from "next";
import Link from "next/link";
import { ObjectIcon } from "@/components/ui/icons";
import { createClient } from "@/lib/supabase/server";
import { OBJECTS, isObjectKey } from "@/lib/objects";
import { IMPORTABLE } from "@/lib/import/config";
import { can } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Importar datos" };

const HINTS: Record<string, string> = {
  accounts: "Clientes, distribuidores y prospectos con NIT, ciudad y propietario.",
  contacts: "Personas, con la cuenta escrita por su nombre exacto.",
  leads: "Prospectos de ferias, web o bases compradas.",
  opportunities: "Negocios con cuenta, etapa, valor y fecha de cierre.",
  products: "Catálogo con referencia, familia y unidad.",
};

export default async function ImportPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: jobs } = await supabase
    .from("import_jobs")
    .select("id, object, file_name, mode, total, created, updated, skipped, created_at, by:profiles!import_jobs_created_by_fkey(full_name)")
    .order("created_at", { ascending: false })
    .limit(20);
  const objects = IMPORTABLE.filter((o) => can(user.access, OBJECTS[o].permission, "create"));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <p className="eyebrow">Datos</p>
        <h1 className="text-xl font-medium">Importar datos</h1>
        <p className="text-sm text-muted">Carga registros desde un archivo CSV exportado de Excel u otro sistema. Recomendado: cuentas → contactos → oportunidades, para que las relaciones se encuentren.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {objects.map((o) => (
          <Link key={o} href={`/importar/${o}`} className="glass lift flex items-start gap-3 p-5 no-underline">
            <ObjectIcon object={o} />
            <span>
              <span className="block font-medium text-brand">{OBJECTS[o].plural}</span>
              <span className="text-xs text-muted">{HINTS[o]}</span>
            </span>
          </Link>
        ))}
      </div>
      <section className="card overflow-hidden">
        <div className="card-header"><h2 className="card-title">Importaciones recientes</h2></div>
        {(jobs ?? []).length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted">Aún no hay importaciones.</p> : (
          <table className="table">
            <thead><tr><th>Fecha</th><th>Objeto</th><th>Archivo</th><th className="text-right">Filas</th><th className="text-right">Creados</th><th className="text-right">Actualizados</th><th className="text-right">Omitidos</th><th>Usuario</th></tr></thead>
            <tbody>
              {(jobs ?? []).map((j) => (
                <tr key={j.id}>
                  <td className="whitespace-nowrap">{formatDateTime(j.created_at)}</td>
                  <td>{isObjectKey(j.object) ? OBJECTS[j.object].plural : j.object}</td>
                  <td className="max-w-56 truncate">{j.file_name}</td>
                  <td className="num text-right">{j.total}</td>
                  <td className="num text-right">{j.created}</td>
                  <td className="num text-right">{j.updated}</td>
                  <td className={`num text-right ${j.skipped ? "text-warning" : ""}`}>{j.skipped}</td>
                  <td>{j.by?.full_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
