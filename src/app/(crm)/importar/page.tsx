import type { Metadata } from "next";
import Link from "next/link";
import { ObjectIcon } from "@/components/ui/icons";
import { createClient } from "@/lib/supabase/server";
import { OBJECTS, isObjectKey } from "@/lib/objects";
import { IMPORTABLE } from "@/lib/import/config";
import { can } from "@/lib/permissions";

import { requireUser } from "@/lib/session";

import { Tr } from "@/components/ui/Tr";
import { Fmt } from "@/components/ui/Fmt";
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
        <p className="eyebrow"><Tr>Datos</Tr></p>
        <h1 className="text-xl font-medium"><Tr>Importar datos</Tr></h1>
        <p className="text-sm text-muted"><Tr>Carga registros desde un archivo CSV exportado de Excel u otro sistema. Recomendado: cuentas → contactos → oportunidades, para que las relaciones se encuentren.</Tr></p>
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
        <div className="card-header"><h2 className="card-title"><Tr>Importaciones recientes</Tr></h2></div>
        {(jobs ?? []).length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted"><Tr>Aún no hay importaciones.</Tr></p> : (
          <table className="table">
            <thead><tr><th><Tr>Fecha</Tr></th><th><Tr>Objeto</Tr></th><th><Tr>Archivo</Tr></th><th className="text-right"><Tr>Filas</Tr></th><th className="text-right"><Tr>Creados</Tr></th><th className="text-right"><Tr>Actualizados</Tr></th><th className="text-right"><Tr>Omitidos</Tr></th><th><Tr>Usuario</Tr></th></tr></thead>
            <tbody>
              {(jobs ?? []).map((j) => (
                <tr key={j.id}>
                  <td className="whitespace-nowrap"><Fmt datetime={j.created_at} /></td>
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
