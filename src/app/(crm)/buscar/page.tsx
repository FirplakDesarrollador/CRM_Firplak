import type { Metadata } from "next";
import Link from "next/link";
import { ObjectIcon } from "@/components/ui/icons";
import { createClient } from "@/lib/supabase/server";
import { OBJECTS, isObjectKey } from "@/lib/objects";
import { requireUser } from "@/lib/session";

import { Tr } from "@/components/ui/Tr";
export const metadata: Metadata = { title: "Búsqueda" };

export default async function SearchPage({ searchParams }: PageProps<"/buscar">) {
  const [, sp] = await Promise.all([requireUser(), searchParams]);
  const q = (typeof sp.q === "string" ? sp.q : "").trim();
  const supabase = await createClient();
  const { data } = q.length >= 2 ? await supabase.rpc("global_search", { p_query: q, p_limit: 15 }) : { data: [] };
  const groups = ["leads", "accounts", "contacts", "opportunities", "quotes", "orders", "cases", "products"].map((key) => ({
    key,
    def: OBJECTS[key as "accounts"],
    items: (data ?? []).filter((r) => r.object === key),
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-xl font-medium">{q ? <>Resultados para “{q}”</> : "Búsqueda"}</h1>
      {q.length < 2 && <p className="text-muted"><Tr>Escribe al menos 2 caracteres en la barra de búsqueda.</Tr></p>}
      {q.length >= 2 && (data ?? []).length === 0 && <p className="text-muted"><Tr>No encontramos registros que coincidan.</Tr></p>}
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
                {r.subtitle && <p className="text-xs text-muted">{r.subtitle}</p>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
