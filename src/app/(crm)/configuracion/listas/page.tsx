import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, RotateCcw, Trash2 } from "lucide-react";
import { ActionForm, ConfirmSubmit } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { getObjectDef, getPicklistRows } from "@/lib/records/data";
import { OBJECTS, getObject, type ObjectKey } from "@/lib/objects";
import { EDITABLE_PICKLISTS, EXTRA_PICKLISTS } from "@/lib/objects/picklist-config";
import { getT } from "@/lib/i18n/server";
import { canSystem } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { VALUES_EN } from "@/lib/i18n/values-en";
import { addPicklistValue, customizePicklist, deletePicklistValue, resetPicklist, updatePicklistValue } from "../actions";

import { Tr } from "@/components/ui/Tr";
export const metadata: Metadata = { title: "Listas de valores" };

export default async function PicklistsPage({ searchParams }: PageProps<"/configuracion/listas">) {
  const [me, sp] = await Promise.all([requireUser(), searchParams]);
  if (!canSystem(me.access, "customize")) redirect("/configuracion");
  const objects = Object.keys(EDITABLE_PICKLISTS) as ObjectKey[];
  const object = (objects.includes(sp.objeto as ObjectKey) ? sp.objeto : objects[0]) as ObjectKey;
  // Etiquetas de campo traducidas; las opciones estándar salen de la definición del código.
  const [def, rows, t] = await Promise.all([getObjectDef(object), getPicklistRows().then((all) => all.filter((r) => r.object === object)), getT()]);
  const standard = getObject(object);

  return (
    <>
      <div>
        <h1 className="text-xl font-medium"><Tr>Listas de valores</Tr></h1>
        <p className="text-sm text-muted">
          <Tr>Personaliza las opciones de las listas de selección. Desactivar un valor lo oculta en los formularios; los registros que ya lo usan lo conservan.</Tr>{" "}
          <Tr>La etiqueta en inglés es lo que ven quienes usan la aplicación en inglés; si se deja vacía, se usa la traducción estándar.</Tr>
        </p>
      </div>
      <div className="card">
        <div role="tablist" className="flex overflow-x-auto border-b border-line px-4">
          {objects.map((o) => (
            <Link key={o} role="tab" href={`/configuracion/listas?objeto=${o}`} aria-selected={o === object} className="tab"><Tr>{OBJECTS[o].plural}</Tr></Link>
          ))}
        </div>
      </div>
      {(EDITABLE_PICKLISTS[object] ?? []).map((fieldName) => {
        const extra = EXTRA_PICKLISTS[fieldName];
        const field = def.fields.find((f) => f.name === fieldName) ?? (extra ? { label: t(extra.label) } : null);
        if (!field) return null;
        const values = rows.filter((r) => r.field === fieldName).sort((a, b) => a.sort_order - b.sort_order);
        const customized = values.length > 0;
        const stdOptions = standard.fields.find((f) => f.name === fieldName)?.options ?? extra?.options ?? [];
        // La edición se abre por lista y vive en la URL; el enlace lleva de vuelta a la misma tarjeta.
        const editing = customized && sp.editar === fieldName;
        const summaryHref = `/configuracion/listas?objeto=${object}#lista-${fieldName}`;
        const editHref = `/configuracion/listas?objeto=${object}&editar=${fieldName}#lista-${fieldName}`;
        return (
          <section key={fieldName} id={`lista-${fieldName}`} className="card scroll-mt-28 overflow-hidden">
            <div className="card-header">
              <h2 className="card-title">{field.label} {customized ? <span className="badge badge-brand"><Tr>Personalizada</Tr></span> : <span className="badge"><Tr>Estándar</Tr></span>}</h2>
              {editing && (
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={summaryHref} className="btn btn-sm"><ArrowLeft size={14} /> <Tr>Volver al resumen</Tr></Link>
                  <ActionForm action={resetPicklist.bind(null, object, fieldName)}>
                    <ConfirmSubmit message={`¿Restablecer “${field.label}” a los valores estándar?`} className="btn btn-sm"><RotateCcw size={14} /> <Tr>Restablecer</Tr></ConfirmSubmit>
                  </ActionForm>
                </div>
              )}
            </div>
            {!customized ? (
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <p className="flex flex-wrap gap-1.5">
                  {stdOptions.map((o) => (
                    <span key={o} className="badge">{o}{VALUES_EN[o] && VALUES_EN[o] !== o ? <span className="text-muted"> · {VALUES_EN[o]}</span> : null}</span>
                  ))}
                </p>
                <ActionForm action={async () => {
                  "use server";
                  const result = await customizePicklist(object, fieldName, stdOptions);
                  if (result.ok) redirect(editHref);
                  return result;
                }}>
                  <SubmitButton className="btn btn-sm btn-primary" pendingText="…"><Tr>Personalizar</Tr></SubmitButton>
                </ActionForm>
              </div>
            ) : !editing ? (
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <p className="flex flex-wrap gap-1.5">
                  {values.map((v) => {
                    const english = v.label_en || VALUES_EN[v.value];
                    return (
                      <span key={v.id} className={`badge ${v.is_active ? "" : "text-muted line-through"}`}>
                        {v.value}{english && english !== v.value ? <span className="text-muted"> · {english}</span> : null}
                        {!v.is_active && <span className="sr-only"> (<Tr>inactivo</Tr>)</span>}
                      </span>
                    );
                  })}
                </p>
                <Link href={editHref} className="btn btn-sm btn-primary"><Tr>Editar</Tr></Link>
              </div>
            ) : (
              <>
                <ul className="divide-y divide-[var(--border)]">
                  {values.map((v) => (
                    <li key={v.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
                      <span className={`min-w-40 flex-1 font-medium ${v.is_active ? "" : "text-muted line-through"}`}>{v.value}</span>
                      <ActionForm action={updatePicklistValue.bind(null, v.id)} className="flex items-center gap-2">
                        <label className="sr-only" htmlFor={`en-${v.id}`}><Tr>Etiqueta en inglés</Tr></label>
                        <input id={`en-${v.id}`} name="label_en" className="input h-8 w-44" defaultValue={v.label_en ?? ""}
                          placeholder={VALUES_EN[v.value] ?? "English label"} />
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
                  <div className="min-w-40 flex-1">
                    <label className="label" htmlFor={`ne-${fieldName}`}><Tr>En inglés (opcional)</Tr></label>
                    <input id={`ne-${fieldName}`} name="label_en" className="input" />
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
