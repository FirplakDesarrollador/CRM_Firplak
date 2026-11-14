import type { Metadata } from "next";
import Link from "next/link";
import { ObjectIcon } from "@/components/ui/icons";
import { createClient } from "@/lib/supabase/server";
import { OBJECTS, isObjectKey } from "@/lib/objects";
import { requireUser } from "@/lib/session";
import { readableDates } from "@/lib/format";
import { getLocale } from "@/lib/i18n/server";

import { Tr } from "@/components/ui/Tr";
export const metadata: Metadata = { title: "Búsqueda" };

export default async function SearchPage({ searchParams }: PageProps<"/buscar">) {
  const [, sp, locale] = await Promise.all([requireUser(), searchParams, getLocale()]);
  const q = (typeof sp.q === "string" ? sp.q : "").trim();
  const supabase = await createClient();
  const { data } = q.length >= 2 ? await supabase.rpc("global_search", { p_query: q, p_limit: 15 }) : { data: [] };
  // Clientes que existen y esta persona no puede abrir: se dice que existen y quién los atiende, nada más.
  const { data: others } = q.length >= 3 ? await supabase.rpc("account_directory", { p_query: q }) : { data: [] };
  const groups = ["leads", "accounts", "contacts", "opportunities", "quotes", "orders", "cases", "products"].map((key) => ({
    key,
    def: OBJECTS[key as "accounts"],
    items: (data ?? []).filter((r) => r.object === key),
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-xl font-medium">{q ? <>Resultados para “{q}”</> : "Búsqueda"}</h1>
      {q.length < 2 && <p className="text-muted"><Tr>Escribe al menos 2 caracteres en la barra de búsqueda.</Tr></p>}
      {q.length >= 2 && (data ?? []).length === 0 && (others ?? []).length === 0 && <p className="text-muted"><Tr>No encontramos registros que coincidan.</Tr></p>}
      {groups.filter((g) => g.items.length).map((g) => (
        <section key={g.key} className="card">
          <div className="card-header">
            <h2 className="card-title"><ObjectIcon object={g.key} size={14} /> {g.def.plural} <span className="badge">{g.items.length}</span></h2>
            <Link href={`${g.def.path}?q=${encodeURIComponent(q)}`} className="btn btn-sm btn-ghost"><Tr>Ver en la lista</Tr></Link>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {g.items.map((r) => (
              <li key={r.id} className="px-4 py-2.5">
                <Link href={`${isObjectKey(r.object) ? OBJECTS[r.object].path : "/"}/${r.id}`} className="link">{r.title}</Link>
                {r.subtitle && <p className="text-xs text-muted">{readableDates(r.subtitle, locale)}</p>}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {(others ?? []).length > 0 && (
        <section className="card" aria-labelledby="clientes-de-otros">
          <div className="card-header">
            <h2 id="clientes-de-otros" className="card-title"><ObjectIcon object="accounts" size={14} /> <Tr>Clientes a cargo de otras personas</Tr> <span className="badge">{others!.length}</span></h2>
          </div>
          <p className="px-4 pt-3 text-xs text-muted"><Tr>Ya existen en el CRM. No puedes abrirlos; si necesitas trabajar con uno, pide que te agreguen a su equipo.</Tr></p>
          <ul className="divide-y divide-[var(--border)]">
            {others!.map((r, i) => (
              <li key={`${r.name}-${i}`} className="px-4 py-2.5">
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-muted">
                  {[r.tax_id ? `NIT ${r.tax_id}` : null, r.city].filter(Boolean).join(" · ")}
                  {(r.tax_id || r.city) && " · "}<Tr>A cargo de</Tr> {r.owner_name ?? "—"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
