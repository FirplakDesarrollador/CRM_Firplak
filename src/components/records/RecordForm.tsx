"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { FieldDef, ObjectDef } from "@/lib/objects";
import type { FormState } from "@/lib/records/form";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FieldInput, type FieldInputContext } from "./FieldInput";
import { useT } from "@/lib/i18n/client";

type Props = {
  def: Pick<ObjectDef, "sections" | "label">;
  fields: FieldDef[];
  record: Record<string, unknown> | null;
  ctx: FieldInputContext;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  cancelHref: string;
  returnTo?: string;
};

export function RecordForm({ def, fields, record, ctx, action, cancelHref, returnTo }: Props) {
  const [state, formAction] = useActionState(action, {});
  const t = useT();
  const custom = (record?.custom_fields ?? {}) as Record<string, unknown>;
  // Valor actual de un campo (el devuelto tras un error de validación manda sobre el guardado).
  const currentValue = (name: string) => {
    const v = state.values?.[name] ?? (name.startsWith("cf.") ? custom[name.slice(3)] : record?.[name]);
    return v === null || v === undefined ? "" : String(v);
  };
  const dependencyOf = (field: FieldDef) => {
    if (!field.dependsOn?.length) return undefined;
    // Solo cuentan las listas que están en el formulario.
    // En el orden del formulario, para que el aviso nombre las listas como aparecen en pantalla.
    const controllers = field.dependsOn.flatMap((d) => {
      const at = fields.findIndex((f) => f.name === d.field);
      return at >= 0 ? [{ at, name: d.field, label: fields[at].label, value: currentValue(d.field) }] : [];
    }).sort((a, b) => a.at - b.at).map(({ name, label, value }) => ({ name, label, value }));
    return controllers.length ? { controllers } : undefined;
  };

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {returnTo && <input type="hidden" name="_return" value={returnTo} />}
      {state.duplicates?.length ? (
        <Alert tone="warning">
          <p>{t(state.message ?? "")}</p>
          <ul className="mt-1 list-disc pl-5">
            {state.duplicates.map((d) => <li key={d.id}><Link href={d.href} target="_blank" className="link">{d.label}</Link></li>)}
          </ul>
          <button type="submit" name="_ignore_duplicates" value="1" className="btn btn-sm mt-2">{t("Guardar de todas formas")}</button>
        </Alert>
      ) : state.message && <Alert tone="error">{t(state.message)}</Alert>}
      {def.sections.map((section) => {
        const sectionFields = fields.filter((f) => (f.section ?? "info") === section.key);
        if (!sectionFields.length) return null;
        return (
          <section key={section.key} className="card">
            <div className="card-header"><h2 className="card-title">{section.label}</h2></div>
            <div className="grid gap-x-5 gap-y-4 p-4 sm:grid-cols-2">
              {sectionFields.map((field) => (
                <div key={field.name} className={field.wide ? "sm:col-span-2" : undefined}>
                  <FieldInput
                    field={field}
                    ctx={ctx}
                    value={field.custom ? custom[field.name.slice(3)] : record?.[field.name]}
                    relation={field.relation ? (record?.[field.relation] as never) : null}
                    error={state.errors?.[field.name]}
                    echo={state.values?.[field.name]}
                    dependency={dependencyOf(field)}
                  />
                </div>
              ))}
            </div>
          </section>
        );
      })}
      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
        <Link href={cancelHref} className="btn">{t("Cancelar")}</Link>
        <SubmitButton pendingText={t("Guardando…")}>{t("Guardar")} {def.label.toLowerCase()}</SubmitButton>
      </div>
    </form>
  );
}
