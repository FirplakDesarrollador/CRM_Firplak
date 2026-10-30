import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Combine } from "lucide-react";
import { ActionForm } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { createClient } from "@/lib/supabase/server";
import { OBJECTS, type ObjectKey } from "@/lib/objects";
import { canSystem } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { mergeDuplicates } from "../actions";

import { Tr } from "@/components/ui/Tr";
export const metadata: Metadata = { title: "Duplicados" };

const MERGEABLE: ObjectKey[] = ["accounts", "contacts", "leads"];

export default async function DuplicatesPage({ searchParams }: PageProps<"/configuracion/duplicados">) {
  const [me, sp] = await Promise.all([requireUser(), searchParams]);
  if (!canSystem(me.access, "customize")) redirect("/configuracion");
  const object = (MERGEABLE.includes(sp.objeto as ObjectKey) ? sp.objeto : "accounts") as ObjectKey;
  const supabase = await createClient();
  const { data: pairs, error } = await supabase.rpc("find_duplicates", { p_object: object });
  const def = OBJECTS[object];

  return (
    <>
      <div>
        <h1 className="text-xl font-medium"><Tr>Duplicados</Tr></h1>
        <p className="text-sm text-muted">
          Parejas con el mismo NIT, correo o nombre normalizado (sin tildes, mayúsculas ni “S.A.S.”). Al fusionar, el registro principal
          completa sus campos vacíos con los del duplicado, recibe todos sus registros relacionados y el duplicado se elimina.
        </p>
      </div>
      <div className="card">
        <div role="tablist" className="flex overflow-x-auto border-b border-line px-4">
          {MERGEABLE.map((o) => (
            <Link key={o} role="tab" href={`/configuracion/duplicados?objeto=${o}`} aria-selected={o === object} className="tab">{OBJECTS[o].plural}</Link>
          ))}
        </div>
      </div>
      {error && <p className="error-text">{error.message}</p>}
      {(pairs ?? []).length === 0 && <section className="card px-4 py-8 text-center text-sm text-muted">No se encontraron posibles duplicados de {def.plural.toLowerCase()}.</section>}
      {(pairs ?? []).map((p) => (
        <section key={`${p.id_a}-${p.id_b}`} className="card">
          <ActionForm action={mergeDuplicates.bind(null, object, p.id_a, p.id_b)} className="flex flex-wrap items-center gap-4 p-4">
            <span className="badge badge-warning">{p.reason}</span>
            <fieldset className="flex min-w-0 flex-1 flex-wrap gap-4">
              <legend className="sr-only"><Tr>Registro principal</Tr></legend>
              {[[p.id_a, p.name_a], [p.id_b, p.name_b]].map(([id, name], i) => (
                <label key={id} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="master" value={id} defaultChecked={i === 0} className="accent-[var(--brand)]" />
                  <span><Tr>Conservar</Tr> <Link href={`${def.path}/${id}`} target="_blank" className="link">{name}</Link></span>
                </label>
              ))}
            </fieldset>
            <SubmitButton className="btn btn-sm btn-primary" pendingText="Fusionando…"><Combine size={14} /> <Tr>Fusionar</Tr></SubmitButton>
          </ActionForm>
        </section>
      ))}
    </>
  );
}
