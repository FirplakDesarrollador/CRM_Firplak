import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, ConfirmSubmit } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { canSystem } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { deleteRole, saveRole } from "../actions";

import { Tr } from "@/components/ui/Tr";
import { Opt } from "@/components/ui/Opt";
export const metadata: Metadata = { title: "Jerarquía de roles" };

type Role = { id: string; name: string; description: string | null; parent_id: string | null; sort_order: number; share_within: boolean; share_business: boolean };

function flatten(roles: Role[], parent: string | null = null, depth = 0): (Role & { depth: number })[] {
  return roles
    .filter((r) => r.parent_id === parent)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .flatMap((r) => [{ ...r, depth }, ...flatten(roles, r.id, depth + 1)]);
}

export default async function RolesPage() {
  const me = await requireUser();
  if (!canSystem(me.access, "manage_users")) redirect("/configuracion");
  const supabase = await createClient();
  const [{ data }, { data: members }] = await Promise.all([
    supabase.from("roles").select("id, name, description, parent_id, sort_order, share_within, share_business"),
    supabase.from("profiles").select("role_id"),
  ]);
  const roles = (data ?? []) as Role[];
  const tree = flatten(roles);
  const orphans = roles.filter((r) => !tree.some((t) => t.id === r.id)).map((r) => ({ ...r, depth: 0 }));
  const count = (id: string) => (members ?? []).filter((m) => m.role_id === id).length;

  return (
    <>
      <div>
        <h1 className="text-xl font-medium"><Tr>Jerarquía de roles</Tr></h1>
        <p className="max-w-[80ch] text-sm text-muted">
          <Tr>Un usuario ve y edita los registros de los usuarios cuyos roles dependen del suyo.</Tr>{" "}
          <Tr>Con «Comparten clientes», quienes tienen ese rol o uno que depende de él ven entre sí los clientes, contactos y prospectos, sin poder modificarlos.</Tr>{" "}
          <Tr>Con «y negocios» ven además las oportunidades, cotizaciones, pedidos y actividades: es lo que necesita un promotor para apoyar a su ejecutivo.</Tr>
        </p>
      </div>
      <section className="card">
        <div className="card-header"><h2 className="card-title"><Tr>Nuevo rol</Tr></h2></div>
        <ActionForm action={saveRole.bind(null, null)} resetOnSuccess className="grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div><label className="label" htmlFor="role-name"><Tr>Nombre</Tr></label><input id="role-name" name="name" className="input" required /></div>
          <div>
            <label className="label" htmlFor="role-parent"><Tr>Depende de</Tr></label>
            <select id="role-parent" name="parent_id" className="select">
              <Opt value="">— Raíz —</Opt>
              {tree.map((r) => <option key={r.id} value={r.id}>{"· ".repeat(r.depth)}{r.name}</option>)}
            </select>
          </div>
          <SubmitButton pendingText="Creando…"><Tr>Crear rol</Tr></SubmitButton>
        </ActionForm>
      </section>
      <section className="card">
        <ul className="divide-y divide-[var(--border)]">
          {[...tree, ...orphans].map((r) => (
            <li key={r.id} className="flex flex-wrap items-start gap-2 px-4 py-3" style={{ paddingLeft: `${1 + r.depth * 1.5}rem` }}>
              <ActionForm action={saveRole.bind(null, r.id)} className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
                <div className="min-w-48 flex-1">
                  <label className="sr-only" htmlFor={`rn-${r.id}`}><Tr>Nombre</Tr></label>
                  <input id={`rn-${r.id}`} name="name" className="input font-semibold" defaultValue={r.name} />
                </div>
                <div className="min-w-48">
                  <label className="sr-only" htmlFor={`rp-${r.id}`}><Tr>Depende de</Tr></label>
                  <select id={`rp-${r.id}`} name="parent_id" className="select" defaultValue={r.parent_id ?? ""}>
                    <Opt value="">— Raíz —</Opt>
                    {tree.filter((x) => x.id !== r.id).map((x) => <option key={x.id} value={x.id}>{"· ".repeat(x.depth)}{x.name}</option>)}
                  </select>
                </div>
                <label className="flex items-center gap-1.5 self-center text-xs font-medium">
                  <input type="checkbox" name="share_within" defaultChecked={r.share_within} className="accent-[var(--brand)]" /> <Tr>Comparten clientes</Tr>
                </label>
                <label className="flex items-center gap-1.5 self-center text-xs font-medium">
                  <input type="checkbox" name="share_business" defaultChecked={r.share_business} className="accent-[var(--brand)]" /> <Tr>y negocios</Tr>
                </label>
                <span className="badge self-center">{count(r.id)} usuario(s)</span>
                <SubmitButton className="btn btn-sm" pendingText="…"><Tr>Guardar</Tr></SubmitButton>
              </ActionForm>
              <ActionForm action={deleteRole.bind(null, r.id)} className="flex flex-col items-end">
                <ConfirmSubmit message={`¿Eliminar el rol “${r.name}”? Los roles que dependen de él quedarán en la raíz.`}>
                  <Trash2 size={14} /><span className="sr-only"><Tr>Eliminar</Tr></span>
                </ConfirmSubmit>
              </ActionForm>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
