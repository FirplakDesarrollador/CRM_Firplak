import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ActionForm, ConfirmSubmit } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { getCustomFieldRows } from "@/lib/records/data";
import { canSystem } from "@/lib/permissions";
import { OBJECTS, type ObjectKey } from "@/lib/objects";
import { requireUser } from "@/lib/session";
import { deleteCustomField, saveCustomField } from "../actions";

import { Tr } from "@/components/ui/Tr";
import { VALUES_EN } from "@/lib/i18n/values-en";
export const metadata: Metadata = { title: "Campos personalizados" };

const TYPES: Record<string, string> = {
  text: "Texto", textarea: "Texto largo", number: "Número", currency: "Moneda (COP)", percent: "Porcentaje",
  date: "Fecha", checkbox: "Casilla", select: "Lista de selección", multiselect: "Selección múltiple",
  email: "Correo", phone: "Teléfono", url: "Enlace",
};

export default async function CustomFieldsPage({ searchParams }: PageProps<"/configuracion/campos">) {
  const [me, sp] = await Promise.all([requireUser(), searchParams]);
  if (!canSystem(me.access, "customize")) redirect("/configuracion");
  const object = (Object.keys(OBJECTS).includes(String(sp.objeto)) ? sp.objeto : "accounts") as ObjectKey;
  const fields = (await getCustomFieldRows()).filter((f) => f.object === object);

  return (
    <>
      <div>
        <h1 className="text-xl font-medium"><Tr>Campos personalizados</Tr></h1>
        <p className="text-sm text-muted"><Tr>Se definen en JSON y sus valores viven en la columna</Tr> <code>custom_fields</code> (jsonb) de cada registro. Aparecen en formularios, fichas, filtros, vistas y exportación.</p>
      </div>
      <div className="card">
        <div role="tablist" className="flex overflow-x-auto border-b border-line px-4">
          {(Object.keys(OBJECTS) as ObjectKey[]).map((o) => (
            <Link key={o} role="tab" href={`/configuracion/campos?objeto=${o}`} aria-selected={o === object} className="tab">{OBJECTS[o].plural}</Link>
          ))}
        </div>
        <ActionForm action={saveCustomField.bind(null, object, null)} resetOnSuccess className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <div><label className="label" htmlFor="cf-label"><Tr>Etiqueta</Tr></label><input id="cf-label" name="label" className="input" required placeholder="Ej. Tipo de proyecto" /></div>
          <div><label className="label" htmlFor="cf-api"><Tr>Nombre interno (opcional)</Tr></label><input id="cf-api" name="api_name" className="input" placeholder="tipo_proyecto" /></div>
          <div>
            <label className="label" htmlFor="cf-type"><Tr>Tipo</Tr></label>
            <select id="cf-type" name="field_type" className="select">{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </div>
          <div><label className="label" htmlFor="cf-order"><Tr>Orden</Tr></label><input id="cf-order" name="sort_order" type="number" className="input" defaultValue={fields.length + 1} /></div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="cf-options"><Tr>Opciones (una por línea; solo listas)</Tr></label>
            <textarea id="cf-options" name="options" className="textarea" rows={2} />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="cf-options-en"><Tr>Opciones en inglés (mismo orden; opcional)</Tr></label>
            <textarea id="cf-options-en" name="options_en" className="textarea" rows={2} />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="cf-help"><Tr>Texto de ayuda</Tr></label>
            <input id="cf-help" name="help_text" className="input" />
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-1.5 text-sm font-semibold"><input type="checkbox" name="is_required" className="accent-[var(--brand)]" /> <Tr>Obligatorio</Tr></label>
              <label className="flex items-center gap-1.5 text-sm font-semibold"><input type="checkbox" name="show_in_list" className="accent-[var(--brand)]" /> <Tr>Columna en listas</Tr></label>
              <SubmitButton className="btn btn-primary ml-auto" pendingText="Creando…"><Tr>Crear campo</Tr></SubmitButton>
            </div>
          </div>
        </ActionForm>
      </div>

      <section className="card">
        <div className="card-header"><h2 className="card-title">Campos de {OBJECTS[object].plural.toLowerCase()} <span className="badge">{fields.length}</span></h2></div>
        {fields.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted"><Tr>Aún no hay campos personalizados para este objeto.</Tr></p>}
        <ul className="divide-y divide-[var(--border)]">
          {fields.map((f) => (
            <li key={f.id} className="flex flex-wrap items-start gap-2 p-4">
              <ActionForm action={saveCustomField.bind(null, object, f.id)} className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_9rem_1.4fr_5rem_auto] xl:items-end">
                <div>
                  <label className="label" htmlFor={`l-${f.id}`}><Tr>Etiqueta ·</Tr> <code className="text-[0.7rem]">{f.api_name}</code></label>
                  <input id={`l-${f.id}`} name="label" className="input font-semibold" defaultValue={f.label} />
                </div>
                <div>
                  <span className="label"><Tr>Tipo</Tr></span>
                  <span className="badge badge-brand mt-2">{TYPES[f.field_type] ?? f.field_type}</span>
                  <input type="hidden" name="field_type" value={f.field_type} />
                </div>
                <div>
                  <label className="label" htmlFor={`o-${f.id}`}><Tr>Opciones</Tr></label>
                  <input id={`o-${f.id}`} name="options" className="input" disabled={!["select", "multiselect"].includes(f.field_type)}
                    defaultValue={Array.isArray(f.options) ? (f.options as string[]).join(", ") : ""} />
                  {["select", "multiselect"].includes(f.field_type) && (
                    <>
                      <label className="label mt-2" htmlFor={`oe-${f.id}`}><Tr>En inglés (mismo orden)</Tr></label>
                      <input id={`oe-${f.id}`} name="options_en" className="input"
                        defaultValue={Array.isArray(f.options)
                          ? (f.options as string[]).map((o) => ((f.option_labels_en ?? {}) as Record<string, string>)[o] ?? "").join(", ")
                          : ""}
                        placeholder={Array.isArray(f.options) ? (f.options as string[]).map((o) => VALUES_EN[o] ?? o).join(", ") : ""} />
                    </>
                  )}
                </div>
                <div>
                  <label className="label" htmlFor={`s-${f.id}`}><Tr>Orden</Tr></label>
                  <input id={`s-${f.id}`} name="sort_order" type="number" className="input" defaultValue={f.sort_order} />
                </div>
                <div className="flex flex-wrap items-center gap-3 pb-1">
                  <input type="hidden" name="help_text" value={f.help_text ?? ""} />
                  <label className="flex items-center gap-1 text-xs font-semibold"><input type="checkbox" name="is_required" defaultChecked={f.is_required} className="accent-[var(--brand)]" /> <Tr>Oblig.</Tr></label>
                  <label className="flex items-center gap-1 text-xs font-semibold"><input type="checkbox" name="show_in_list" defaultChecked={f.show_in_list} className="accent-[var(--brand)]" /> <Tr>Lista</Tr></label>
                  <label className="flex items-center gap-1 text-xs font-semibold"><input type="checkbox" name="is_active" defaultChecked={f.is_active} className="accent-[var(--brand)]" /> <Tr>Activo</Tr></label>
                  <SubmitButton className="btn btn-sm" pendingText="…"><Tr>Guardar</Tr></SubmitButton>
                </div>
              </ActionForm>
              <ActionForm action={deleteCustomField.bind(null, f.id)} className="flex flex-col items-end xl:pt-6">
                <ConfirmSubmit message={`¿Eliminar el campo “${f.label}”? Los valores ya guardados se conservan en el JSON del registro.`}>
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
