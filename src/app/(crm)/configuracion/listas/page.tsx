import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { ActionForm, ConfirmSubmit } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { getObjectDef, getPicklistDependencies, getPicklistRows } from "@/lib/records/data";
import { OBJECTS, getObject, type ObjectKey } from "@/lib/objects";
import { EDITABLE_PICKLISTS, EXTRA_PICKLISTS, SHARED_PICKLISTS } from "@/lib/objects/picklist-config";
import { getT } from "@/lib/i18n/server";
import { canSystem } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { VALUES_EN } from "@/lib/i18n/values-en";
import {
  addPicklistDependency, addPicklistValue, customizePicklist, deletePicklistValue, removePicklistDependency, resetPicklist,
  savePicklistDependencyMap, updatePicklistValue,
} from "../actions";

import { Tr } from "@/components/ui/Tr";
export const metadata: Metadata = { title: "Listas de valores" };

export default async function PicklistsPage({ searchParams }: PageProps<"/configuracion/listas">) {
  const [me, sp] = await Promise.all([requireUser(), searchParams]);
  if (!canSystem(me.access, "customize")) redirect("/configuracion");
  const objects = Object.keys(EDITABLE_PICKLISTS) as ObjectKey[];
  const object = (objects.includes(sp.objeto as ObjectKey) ? sp.objeto : objects[0]) as ObjectKey;
  // Etiquetas de campo traducidas; las opciones estándar salen de la definición del código.
  const [def, rows, dependencies, t] = await Promise.all([
    getObjectDef(object),
    getPicklistRows().then((all) => all.filter((r) => r.object === object)),
    getPicklistDependencies().then((all) => all.filter((d) => d.object === object)),
    getT(),
  ]);
  const standard = getObject(object);
  const labelOf = (name: string) => def.fields.find((f) => f.name === name)?.label ?? name;

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
      {SHARED_PICKLISTS[object] && (
        <p className="card px-4 py-3 text-sm text-muted">
          {t("Mercado, Canal y Segmento usan las mismas listas de Cuentas, con sus dependencias: se editan en la pestaña")}{" "}
          <Link href={`/configuracion/listas?objeto=${SHARED_PICKLISTS[object]!.from}`} className="link">{t(OBJECTS[SHARED_PICKLISTS[object]!.from].plural)}</Link>.
        </p>
      )}
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
        // Lista dependiente: de qué listas depende y cuáles pueden controlarla (del mismo objeto, sin ciclos).
        const orderOf = (name: string) => def.fields.findIndex((f) => f.name === name);
        const fieldDeps = dependencies.filter((d) => d.field === fieldName).sort((x, y) => orderOf(x.controlling_field) - orderOf(y.controlling_field));
        const controllerCandidates = extra ? [] : (EDITABLE_PICKLISTS[object] ?? []).filter((n) =>
          n !== fieldName && !EXTRA_PICKLISTS[n] && def.fields.some((f) => f.name === n && f.type === "select")
          && !dependencies.some((d) => d.field === n && d.controlling_field === fieldName));
        const addable = controllerCandidates.filter((n) => !fieldDeps.some((d) => d.controlling_field === n));
        return (
          <section key={fieldName} id={`lista-${fieldName}`} className="card scroll-mt-28 overflow-hidden">
            <div className="card-header">
              <h2 className="card-title">
                {field.label} {customized ? <span className="badge badge-brand"><Tr>Personalizada</Tr></span> : <span className="badge"><Tr>Estándar</Tr></span>}
                {customized && fieldDeps.length > 0 && (
                  <span className="badge">{fieldDeps.length > 1 ? <Tr>Depende de las listas</Tr> : <Tr>Depende de la lista</Tr>} {fieldDeps.map((d) => labelOf(d.controlling_field)).join(" + ")}</span>
                )}
              </h2>
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
                {controllerCandidates.length > 0 && (
                  <div className="space-y-4 border-t border-line p-4">
                    <div className="space-y-2">
                      <p className="label"><Tr>Depende de la lista</Tr></p>
                      {fieldDeps.length > 0 && (
                        <ul className="flex flex-wrap gap-2">
                          {fieldDeps.map((d) => (
                            <li key={d.controlling_field} className="flex items-center gap-1.5 rounded-full border border-line py-1 pl-3 pr-1 text-sm font-medium">
                              {labelOf(d.controlling_field)}
                              <ActionForm action={removePicklistDependency.bind(null, object, fieldName, d.controlling_field)}>
                                <ConfirmSubmit message={`¿Quitar la dependencia de “${labelOf(d.controlling_field)}”?`} className="btn btn-sm btn-icon">
                                  <X size={14} /><span className="sr-only"><Tr>Quitar</Tr> {labelOf(d.controlling_field)}</span>
                                </ConfirmSubmit>
                              </ActionForm>
                            </li>
                          ))}
                        </ul>
                      )}
                      {addable.length > 0 && (
                        <ActionForm key={fieldDeps.length} action={addPicklistDependency.bind(null, object, fieldName)} className="flex flex-wrap items-end gap-2">
                          <div className="min-w-48">
                            <label className="sr-only" htmlFor={`dep-${fieldName}`}><Tr>Lista que la controla</Tr></label>
                            <select id={`dep-${fieldName}`} name="controlling_field" className="select" defaultValue={addable[0]}>
                              {addable.map((n) => <option key={n} value={n}>{labelOf(n)}</option>)}
                            </select>
                          </div>
                          <SubmitButton className="btn" pendingText="…"><Plus size={14} /> <Tr>Agregar lista</Tr></SubmitButton>
                        </ActionForm>
                      )}
                      <p className="help">
                        <Tr>Si depende de varias listas, el formulario solo ofrece los valores que correspondan a lo elegido en todas.</Tr>
                      </p>
                    </div>
                    {fieldDeps.map((d) => {
                      const controllingField = def.fields.find((f) => f.name === d.controlling_field);
                      if (!controllingField) return null;
                      return (
                        <ActionForm key={d.controlling_field} action={savePicklistDependencyMap.bind(null, object, fieldName, d.controlling_field)} className="space-y-3">
                          <p className="text-sm text-muted">
                            <Tr>Marca con qué valores de</Tr> «{controllingField.label}» <Tr>se puede elegir cada valor. Un valor sin marcas no aparece en el formulario.</Tr>
                          </p>
                          <div className="overflow-x-auto rounded-lg border border-line">
                            <table className="table">
                              <thead>
                                <tr>
                                  <th scope="col" className="sticky left-0 z-[1] bg-surface">{field.label}</th>
                                  {(controllingField.options ?? []).map((c) => (
                                    <th key={c} scope="col" className="text-center">{controllingField.optionLabels?.[c] ?? c}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {values.map((v) => (
                                  <tr key={v.id}>
                                    <th scope="row" className={`sticky left-0 z-[1] bg-surface font-medium ${v.is_active ? "" : "text-muted line-through"}`}>{v.value}</th>
                                    {(controllingField.options ?? []).map((c) => (
                                      <td key={c} className="text-center">
                                        <input type="checkbox" name={`map:${v.id}`} value={c}
                                          defaultChecked={(v.controlling_map?.[d.controlling_field] ?? []).includes(c)}
                                          aria-label={`${v.value} · ${controllingField.optionLabels?.[c] ?? c}`} className="h-4 w-4 accent-[var(--brand)]" />
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <SubmitButton className="btn btn-primary" pendingText="…"><Tr>Guardar relaciones con</Tr> {controllingField.label}</SubmitButton>
                        </ActionForm>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>
        );
      })}
    </>
  );
}
