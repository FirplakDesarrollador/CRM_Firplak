"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import type { FieldDef, ObjectDef } from "@/lib/objects";
import type { FormState } from "@/lib/records/form";
import { Alert } from "@/components/ui/Alert";
import { Fmt } from "@/components/ui/Fmt";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FieldInput, type FieldInputContext, type FieldLinks } from "./FieldInput";
import { useFormDraft } from "./useFormDraft";
import { useT } from "@/lib/i18n/client";

type Props = {
  def: Pick<ObjectDef, "sections" | "label">;
  fields: FieldDef[];
  record: Record<string, unknown> | null;
  ctx: FieldInputContext;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  cancelHref: string;
  returnTo?: string;
  /** Usuario que llena el formulario: dueño del borrador que se guarda en el dispositivo. */
  owner: string;
  /** Versión del registro que se edita (`updated_at`); sin ella, registro nuevo. */
  version?: string;
};

type Relation = { id?: string; name?: string; full_name?: string };

const currencyOf = (market: string | null | undefined) => (market === "Internacional" ? "USD" : "COP");

export function RecordForm({ def, fields, record, ctx, action, cancelHref, returnTo, owner, version }: Props) {
  const t = useT();
  const formRef = useRef<HTMLFormElement>(null);
  // Lo escrito se guarda como borrador en el dispositivo; los campos que se toman de la cuenta se guardan vacíos
  // para que al recuperarlo se vuelvan a leer de la cuenta.
  const { state, formAction, values, draft, offer, restore, discard, close, version: mount } = useFormDraft({
    formRef,
    owner,
    names: fields.map((f) => f.name),
    always: fields.filter((f) => f.derived).map((f) => f.name),
    base: version,
    action,
  });
  // El resultado de guardar sale arriba y el botón está abajo: se lleva a la vista para que no pase inadvertido.
  const noticeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!state.message) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    noticeRef.current?.scrollIntoView({ block: "center", behavior: calm ? "auto" : "smooth" });
  }, [state]);
  // Cuenta elegida en el borrador (`undefined`: el borrador no la cambió).
  const draftAccount = draft?.lookups?.account_id;
  // Moneda del registro según el Mercado de la cuenta elegida: decide si se pide el valor en pesos o en USD.
  const [pickedCurrency, setPickedCurrency] = useState<string | null>(null);
  const currency = pickedCurrency ?? (draftAccount !== undefined ? currencyOf(draftAccount?.market) : String(record?.currency ?? "COP"));
  useEffect(() => {
    const form = formRef.current;
    if (!form || !fields.some((f) => f.formCurrency)) return;
    const onSelect = (e: Event) => {
      const { name, item } = (e as CustomEvent<{ name: string; item: { market?: string | null } | null }>).detail;
      if (name === "account_id") setPickedCurrency(currencyOf(item?.market));
    };
    form.addEventListener("lookup:select", onSelect);
    return () => form.removeEventListener("lookup:select", onSelect);
  }, [fields]);
  const custom = (record?.custom_fields ?? {}) as Record<string, unknown>;
  // Valor actual de un campo (el devuelto tras un error de validación, o el del borrador, manda sobre el guardado).
  const currentValue = (name: string) => {
    const v = values?.[name] ?? (name.startsWith("cf.") ? custom[name.slice(3)] : record?.[name]);
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
      if (draftAccount !== undefined) return { channel: draftAccount?.channel ?? null, market: draftAccount?.market ?? null };
      const account = record?.account as { industry?: string | null; market?: string | null } | null | undefined;
      return { channel: account?.industry ?? null, market: account?.market ?? null };
    }
    return undefined;
  };

  // Registro relacionado que muestra un campo: el del borrador, si el borrador lo cambió.
  const relationOf = (field: FieldDef): Relation | null => {
    const saved = field.relation ? ((record?.[field.relation] as Relation | null | undefined) ?? null) : null;
    const id = draft?.values[field.name];
    if (id === undefined) return saved;
    if (!id) return null;
    const picked = draft?.lookups?.[field.name];
    if (picked?.id === id) return { id, name: picked.label };
    return saved?.id === id ? saved : null;
  };

  const drop = () => {
    setPickedCurrency(null);
    discard();
  };
  const recover = () => {
    setPickedCurrency(null);
    restore();
  };

  return (
    <form ref={formRef} action={formAction} className="space-y-5" noValidate>
      {returnTo && <input type="hidden" name="_return" value={returnTo} />}
      {offer && (
        <Alert tone="info">
          <p>{t("Hay un borrador de este registro guardado en este dispositivo, pero el registro cambió después.")} (<Fmt datetime={new Date(offer.at).toISOString()} />)</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn btn-sm" onClick={recover}>{t("Recuperar borrador")}</button>
            <button type="button" className="btn btn-sm" onClick={drop}>{t("Descartar borrador")}</button>
          </div>
        </Alert>
      )}
      {draft && !state.message && (
        <Alert tone="info">
          <p>{t("Recuperamos lo que estabas escribiendo y no alcanzaste a guardar.")} (<Fmt datetime={new Date(draft.at).toISOString()} />)</p>
          <button type="button" className="btn btn-sm mt-2" onClick={drop}>{t("Descartar borrador")}</button>
        </Alert>
      )}
      {(state.duplicates?.length || state.message) && (
        <div ref={noticeRef}>
          {state.duplicates?.length ? (
            <Alert tone="warning">
              <p>{t(state.message ?? "")}</p>
              <ul className="mt-1 list-disc pl-5">
                {state.duplicates.map((d) => <li key={d.id}><Link href={d.href} target="_blank" className="link">{d.label}</Link></li>)}
              </ul>
              <button type="submit" name="_ignore_duplicates" value="1" className="btn btn-sm mt-2">{t("Guardar de todas formas")}</button>
            </Alert>
          ) : <Alert tone={state.offline ? "warning" : "error"}>{t(state.message ?? "")}</Alert>}
        </div>
      )}
      {/* Al recuperar o descartar un borrador los campos se montan de nuevo con sus valores iniciales. */}
      <Fragment key={mount}>
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
                    relation={relationOf(field)}
                    error={state.errors?.[field.name]}
                    echo={values?.[field.name]}
                    dependency={dependencyOf(field)}
                    links={linksOf(field)}
                    place={field.geo ? {
                      country: currentValue(field.geo.country) || (ctx.isNew && !values ? "Colombia" : ""),
                      state: currentValue(field.geo.state),
                    } : undefined}
                  />
                </div>
              ))}
            </div>
          </section>
        );
      })}
      </Fragment>
      {/* En el celular la barra inferior de navegación (fija, 4 rem sobre el área segura) taparía este botón: la barra de
          guardar flota justo encima. Desde md no hay barra inferior y vuelve al borde. */}
      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] flex justify-end gap-2 rounded-lg border border-line bg-bg/95 px-4 py-3 backdrop-blur md:bottom-0">
        <Link href={cancelHref} className="btn" onClick={close}>{t("Cancelar")}</Link>
        <SubmitButton pendingText={t("Guardando…")}>{t("Guardar")} {def.label.toLowerCase()}</SubmitButton>
      </div>
    </form>
  );
}
