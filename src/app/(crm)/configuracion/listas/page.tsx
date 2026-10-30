import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RotateCcw, Trash2 } from "lucide-react";
import { ActionForm, ConfirmSubmit } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { getPicklistRows } from "@/lib/records/data";
import { OBJECTS, getObject, type ObjectKey } from "@/lib/objects";
import { EDITABLE_PICKLISTS } from "@/lib/objects/picklist-config";
import { canSystem } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { addPicklistValue, customizePicklist, deletePicklistValue, resetPicklist, updatePicklistValue } from "../actions";

import { Tr } from "@/components/ui/Tr";
export const metadata: Metadata = { title: "Listas de valores" };

export default async function PicklistsPage({ searchParams }: PageProps<"/configuracion/listas">) {
  const [me, sp] = await Promise.all([requireUser(), searchParams]);
  if (!canSystem(me.access, "customize")) redirect("/configuracion");
  const objects = Object.keys(EDITABLE_PICKLISTS) as ObjectKey[];
  const object = (objects.includes(sp.objeto as ObjectKey) ? sp.objeto : objects[0]) as ObjectKey;
  const def = getObject(object);
  const rows = (await getPicklistRows()).filter((r) => r.object === object);

  return (
    <>
      <div>
        <h1 className="text-xl font-medium"><Tr>Listas de valores</Tr></h1>
        <p className="text-sm text-muted">
          Personaliza las opciones de las listas de selección. Desactivar un valor lo oculta en los formularios; los registros que ya lo usan lo conservan.
        </p>
      </div>
      <div className="card">
        <div role="tablist" className="flex overflow-x-auto border-b border-line px-4">
          {objects.map((o) => (
            <Link key={o} role="tab" href={`/configuracion/listas?objeto=${o}`} aria-selected={o === object} className="tab">{OBJECTS[o].plural}</Link>
          ))}
        </div>
      </div>
      {(EDITABLE_PICKLISTS[object] ?? []).map((fieldName) => {
        const field = def.fields.find((f) => f.name === fieldName);
        if (!field) return null;
        const values = rows.filter((r) => r.field === fieldName).sort((a, b) => a.sort_order - b.sort_order);
        const customized = values.length > 0;
        return (
          <section key={fieldName} className="card overflow-hidden">
            <div className="card-header">
              <h2 className="card-title">{field.label} {customized ? <span className="badge badge-brand"><Tr>Personalizada</Tr></span> : <span className="badge"><Tr>Estándar</Tr></span>}</h2>
              {customized && (
                <ActionForm action={resetPicklist.bind(null, object, fieldName)}>
                  <ConfirmSubmit message={`¿Restablecer “${field.label}” a los valores estándar?`} className="btn btn-sm"><RotateCcw size={14} /> <Tr>Restablecer</Tr></ConfirmSubmit>
                </ActionForm>
              )}
            </div>
            {!customized ? (
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <p className="flex flex-wrap gap-1.5">{(field.options ?? []).map((o) => <span key={o} className="badge">{o}</span>)}</p>
                <ActionForm action={async () => { "use server"; return customizePicklist(object, fieldName, field.options ?? []); }}>
                  <SubmitButton className="btn btn-sm btn-primary" pendingText="…"><Tr>Personalizar</Tr></SubmitButton>
                </ActionForm>
              </div>
            ) : (
              <>
                <ul className="divide-y divide-[var(--border)]">
                  {values.map((v) => (
                    <li key={v.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
                      <span className={`min-w-40 flex-1 font-medium ${v.is_active ? "" : "text-muted line-through"}`}>{v.value}</span>
                      <ActionForm action={updatePicklistValue.bind(null, v.id)} className="flex items-center gap-2">
                        <label className="sr-only" htmlFor={`o-${v.id}`}><Tr>Orden</Tr></label>
                        <input id={`o-${v.id}`} name="sort_order" type="number" className="input h-8 w-20" defaultValue={v.sort_order} />
                        <label className="flex items-center gap-1 text-xs font-medium"><input type="checkbox" name="is_active" defaultChecked={v.is_active} className="accent-[var(--brand)]" /> <Tr>Activo</Tr></label>
                        <SubmitButton className="btn btn-sm" pendingText="…"><Tr>Guardar</Tr></SubmitButton>
                      </ActionForm>
                      <ActionForm action={deletePicklistValue.bind(null, v.id)}>
                        <ConfirmSubmit message={`¿Eliminar “${v.value}”? Los registros que lo usan lo conservan.`}><Trash2 size={14} /><span className="sr-only"><Tr>Eliminar</Tr></span></ConfirmSubmit>
                      </ActionForm>
                    </li>
                  ))}
                </ul>
                <ActionForm action={addPicklistValue.bind(null, object, fieldName)} resetOnSuccess className="flex flex-wrap items-end gap-2 border-t border-line bg-surface-2 p-4">
                  <div className="min-w-48 flex-1">
                    <label className="label" htmlFor={`nv-${fieldName}`}><Tr>Nuevo valor</Tr></label>
                    <input id={`nv-${fieldName}`} name="value" className="input" />
                  </div>
                  <SubmitButton className="btn btn-primary" pendingText="…"><Tr>Agregar</Tr></SubmitButton>
                </ActionForm>
              </>
            )}
          </section>
        );
      })}
    </>
  );
}
