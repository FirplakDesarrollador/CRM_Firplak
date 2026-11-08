"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import type { FieldDef, ObjectDef } from "@/lib/objects";
import type { FormState } from "@/lib/records/form";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FieldInput, type FieldInputContext, type FieldLinks } from "./FieldInput";
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
  const formRef = useRef<HTMLFormElement>(null);
  // Moneda del registro según el Mercado de la cuenta elegida: decide si se pide el valor en pesos o en USD.
  const [currency, setCurrency] = useState(String(record?.currency ?? "COP"));
  useEffect(() => {
    const form = formRef.current;
    if (!form || !fields.some((f) => f.formCurrency)) return;
    const onSelect = (e: Event) => {
      const { name, item } = (e as CustomEvent<{ name: string; item: { market?: string | null } | null }>).detail;
      if (name === "account_id") setCurrency(item?.market === "Internacional" ? "USD" : "COP");
    };
    form.addEventListener("lookup:select", onSelect);
    return () => form.removeEventListener("lookup:select", onSelect);
  }, [fields]);
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

  // Valores de otros campos que un campo necesita: la cuenta elegida, su casilla manual, el canal de la cuenta.
  const linksOf = (field: FieldDef): FieldLinks | undefined => {
    if (field.derived) {
      return { source: currentValue(field.derived.from), manual: field.manualFlag ? ["true", "on"].includes(currentValue(field.manualFlag)) : false };
    }
    if (field.lookupFilter) return { source: currentValue(field.lookupFilter) };
    if (field.type === "stage") {
      const account = record?.account as { industry?: string | null; market?: string | null } | null | undefined;
      return { channel: account?.industry ?? null, market: account?.market ?? null };
    }
    return undefined;
  };

  return (
    <form ref={formRef} action={formAction} className="space-y-5" noValidate>
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
        const sectionFields = fields.filter((f) => (f.section ?? "info") === section.key && (!f.formCurrency || f.formCurrency === currency));
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
                    links={linksOf(field)}
                    place={field.geo ? {
                      country: currentValue(field.geo.country) || (ctx.isNew && !state.values ? "Colombia" : ""),
                      state: currentValue(field.geo.state),
                    } : undefined}
                  />
                </div>
              ))}
            </div>
          </section>
        );
      })}
      {/* En el celular la barra inferior de navegación (fija, 4 rem sobre el área segura) taparía este botón: la barra de
          guardar flota justo encima. Desde md no hay barra inferior y vuelve al borde. */}
      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] flex justify-end gap-2 rounded-lg border border-line bg-bg/95 px-4 py-3 backdrop-blur md:bottom-0">
        <Link href={cancelHref} className="btn">{t("Cancelar")}</Link>
        <SubmitButton pendingText={t("Guardando…")}>{t("Guardar")} {def.label.toLowerCase()}</SubmitButton>
      </div>
    </form>
  );
}
