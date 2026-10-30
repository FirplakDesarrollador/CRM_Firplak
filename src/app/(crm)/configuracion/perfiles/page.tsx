import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, ConfirmSubmit } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import {
  ACTION_LABELS, canSystem, OBJECT_ACTIONS, PERMISSION_OBJECTS, SYSTEM_LABELS, SYSTEM_PERMISSIONS, type PermissionMap,
} from "@/lib/permissions";
import { OBJECTS } from "@/lib/objects";
import { requireUser } from "@/lib/session";
import { deletePermissionProfile, savePermissionProfile } from "../actions";

export const metadata: Metadata = { title: "Perfiles y permisos" };

export default async function ProfilesPage({ searchParams }: PageProps<"/configuracion/perfiles">) {
  const [me, sp] = await Promise.all([requireUser(), searchParams]);
  if (!canSystem(me.access, "manage_users")) redirect("/configuracion");
  const supabase = await createClient();
  const [{ data: profiles }, { data: members }] = await Promise.all([
    supabase.from("permission_profiles").select("*").order("is_admin", { ascending: false }).order("name"),
    supabase.from("profiles").select("permission_profile_id"),
  ]);
  const list = profiles ?? [];
  const isNew = sp.id === "nuevo";
  const cloneFrom = list.find((p) => p.id === sp.desde);
  const selected = isNew ? null : list.find((p) => p.id === sp.id) ?? list.find((p) => !p.is_admin) ?? list[0];
  const base = isNew ? cloneFrom : selected;
  const perms = (base?.permissions ?? {}) as PermissionMap;
  const locked = Boolean(selected?.is_admin) && !isNew;
  const count = (id: string) => (members ?? []).filter((m) => m.permission_profile_id === id).length;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium">Perfiles y permisos</h1>
          <p className="text-sm text-muted">Permisos por objeto y del sistema. La jerarquía de roles y las reglas de compartir deciden qué registros concretos se ven.</p>
        </div>
        <Link href={`/configuracion/perfiles?id=nuevo${selected ? `&desde=${selected.id}` : ""}`} className="btn btn-primary"><Plus size={15} /> Nuevo perfil</Link>
      </div>
      <div className="grid gap-4 xl:grid-cols-[16rem_minmax(0,1fr)]">
        <nav className="card p-2" aria-label="Perfiles">
          {list.map((p) => (
            <Link key={p.id} href={`/configuracion/perfiles?id=${p.id}`} aria-current={p.id === selected?.id ? "page" : undefined}
              className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-sm font-semibold no-underline ${p.id === selected?.id ? "bg-brand-soft text-brand-strong" : "hover:bg-surface-3"}`}>
              <span className="truncate">{p.name}</span>
              <span className="flex gap-1">
                {p.is_default && <span className="badge">Por defecto</span>}
                <span className="badge">{count(p.id)}</span>
              </span>
            </Link>
          ))}
        </nav>

        <ActionForm key={isNew ? "new" : selected?.id} action={savePermissionProfile.bind(null, isNew ? null : selected?.id ?? null)} className="card space-y-4 p-4">
          {locked && <Alert tone="info">El perfil de administrador tiene acceso total y no se puede modificar.</Alert>}
          {isNew && cloneFrom && <Alert tone="info">Nuevo perfil basado en «{cloneFrom.name}».</Alert>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="pp-name">Nombre</label>
              <input id="pp-name" name="name" className="input" defaultValue={isNew ? "" : selected?.name} disabled={locked} required />
            </div>
            <div>
              <label className="label" htmlFor="pp-desc">Descripción</label>
              <input id="pp-desc" name="description" className="input" defaultValue={isNew ? "" : selected?.description ?? ""} disabled={locked} />
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="table">
              <thead><tr><th>Objeto</th>{OBJECT_ACTIONS.map((a) => <th key={a} className="text-center">{ACTION_LABELS[a]}</th>)}</tr></thead>
              <tbody>
                {PERMISSION_OBJECTS.map((o) => (
                  <tr key={o}>
                    <td className="font-semibold">{OBJECTS[o].plural}</td>
                    {OBJECT_ACTIONS.map((a) => (
                      <td key={a} className="text-center">
                        <input type="checkbox" name={`p:${o}:${a}`} aria-label={`${OBJECTS[o].plural}: ${ACTION_LABELS[a]}`}
                          defaultChecked={locked || Boolean(perms[o]?.[a])} disabled={locked} className="h-4 w-4 accent-[var(--brand)]" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <fieldset>
            <legend className="label">Permisos del sistema</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {SYSTEM_PERMISSIONS.map((s) => (
                <label key={s} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name={`s:${s}`} defaultChecked={locked || Boolean(perms.system?.[s])} disabled={locked} className="h-4 w-4 accent-[var(--brand)]" />
                  {SYSTEM_LABELS[s]}
                </label>
              ))}
            </div>
          </fieldset>
          {!locked && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" name="is_default" defaultChecked={!isNew && selected?.is_default} className="accent-[var(--brand)]" />
                Perfil por defecto para usuarios nuevos
              </label>
              <SubmitButton pendingText="Guardando…">{isNew ? "Crear perfil" : "Guardar cambios"}</SubmitButton>
            </div>
          )}
        </ActionForm>
      </div>
      {!isNew && selected && !selected.is_admin && (
        <ActionForm action={deletePermissionProfile.bind(null, selected.id)} className="flex flex-col items-end gap-1">
          <ConfirmSubmit message={`¿Eliminar el perfil “${selected.name}”?`} className="btn btn-sm btn-danger">
            <Trash2 size={14} /> Eliminar perfil
          </ConfirmSubmit>
        </ActionForm>
      )}
    </>
  );
}
