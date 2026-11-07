"use client";

import { useEffect, useRef, useState } from "react";
import type { FieldDef } from "@/lib/objects";
import type { PipelineWithStages, UserOption } from "@/lib/records/data";
import { LookupInput } from "./LookupInput";
import { useT } from "@/lib/i18n/client";

import { Opt } from "@/components/ui/Opt";
export type FieldInputContext = {
  users: UserOption[];
  pipelines: PipelineWithStages[];
};

function toDateTimeLocal(value: unknown) {
  if (!value) return "";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  // Hora de Colombia (UTC-5, sin horario de verano).
  return new Date(d.getTime() - 5 * 3600000).toISOString().slice(0, 16);
}

/** Valores que se pueden elegir con lo elegido en cada lista que controla (vacío si falta alguna). */
function allowedOptions(field: FieldDef, controls: Record<string, string>) {
  const deps = field.dependsOn ?? [];
  if (deps.some((d) => !controls[d.field])) return [];
  return (field.options ?? []).filter((o) => deps.every((d) => d.optionsByController[controls[d.field]]?.includes(o)));
}

/**
 * Lista que depende de otras del mismo formulario (p. ej. Segmento según Mercado y Canal): solo ofrece
 * los valores que corresponden a lo elegido en todas y se vacía si el elegido deja de corresponder.
 */
function DependentSelect({
  common,
  field,
  initialValue,
  controllers,
}: {
  common: { id: string; name: string; "aria-invalid": boolean; required?: boolean };
  field: FieldDef;
  initialValue: string;
  controllers: { name: string; label: string; value: string }[];
}) {
  const t = useT();
  const ref = useRef<HTMLSelectElement>(null);
  const [controls, setControls] = useState<Record<string, string>>(() => Object.fromEntries(controllers.map((c) => [c.name, c.value])));
  const [value, setValue] = useState(initialValue);
  const allowed = allowedOptions(field, controls);
  const missing = controllers.filter((c) => !controls[c.name]).map((c) => `«${c.label}»`);

  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const names = new Set((field.dependsOn ?? []).map((d) => d.field));
    const onChange = (e: Event) => {
      const target = e.target as HTMLSelectElement;
      if (!names.has(target.name)) return;
      const next = { ...controls, [target.name]: target.value };
      const ok = allowedOptions(field, next);
      setControls(next);
      setValue((v) => (ok.includes(v) ? v : ""));
    };
    form.addEventListener("change", onChange);
    return () => form.removeEventListener("change", onChange);
  }, [field, controls]);

  return (
    <>
      <select {...common} ref={ref} className="select" value={value} onChange={(e) => setValue(e.target.value)}>
        <option value="">{t("— Ninguno —")}</option>
        {allowed.map((o) => (
          <option key={o} value={o}>{field.optionLabels?.[o] ?? o}</option>
        ))}
        {/* Un registro antiguo con una combinación que ya no corresponde conserva su valor hasta que se cambie. */}
        {value && !allowed.includes(value) && <option value={value}>{field.optionLabels?.[value] ?? value}</option>}
      </select>
      {missing.length > 0 && <p className="help">{t("Elige primero")} {missing.join(` ${t("y")} `)}.</p>}
    </>
  );
}

export function FieldInput({
  field,
  value,
  relation,
  error,
  ctx,
  echo,
  dependency,
}: {
  field: FieldDef;
  value: unknown;
  relation?: { id?: string; name?: string; full_name?: string } | null;
  error?: string;
  ctx: FieldInputContext;
  /** Valor devuelto por el servidor tras un error de validación. */
  echo?: string;
  /** Lista dependiente: las listas del formulario que la controlan, con su valor inicial. */
  dependency?: { controllers: { name: string; label: string; value: string }[] };
}) {
  const t = useT();
  const id = `f-${field.name.replace(".", "-")}`;
  const invalid = Boolean(error);
  const str = echo ?? (value === null || value === undefined ? "" : String(value));
  const common = { id, name: field.name, "aria-invalid": invalid, required: field.required };

  let control: React.ReactNode;
  switch (field.type) {
    case "textarea":
      control = <textarea {...common} className="textarea" defaultValue={str} rows={4} />;
      break;
    case "select":
      if (field.dependsOn?.length && dependency?.controllers.length) {
        control = <DependentSelect common={common} field={field} initialValue={str} {...dependency} />;
        break;
      }
      control = (
        <select {...common} className="select" defaultValue={str}>
          <option value="">{t("— Ninguno —")}</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>{field.optionLabels?.[o] ?? o}</option>
          ))}
          {str && !(field.options ?? []).includes(str) && <option value={str}>{str} (inactivo)</option>}
        </select>
      );
      break;
    case "multiselect": {
      const selected = new Set(echo !== undefined ? echo.split("|") : Array.isArray(value) ? (value as string[]) : []);
      control = (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-lg border border-line-strong p-2.5" id={id}>
          {(field.options ?? []).map((o) => (
            <label key={o} className="inline-flex items-center gap-1.5 text-sm">
              <input type="checkbox" name={field.name} value={o} defaultChecked={selected.has(o)} className="accent-[var(--brand)]" />
              {o}
            </label>
          ))}
        </div>
      );
      break;
    }
    case "checkbox": {
      const checked = echo !== undefined ? echo === "on" : value === true;
      return (
        <label className="flex items-center gap-2 pt-6 text-sm font-semibold">
          <input type="checkbox" name={field.name} defaultChecked={checked} className="h-4 w-4 accent-[var(--brand)]" />
          {field.label}
        </label>
      );
    }
    case "date":
      control = <input {...common} type="date" className="input" defaultValue={str.slice(0, 10)} />;
      break;
    case "datetime":
      control = <input {...common} type="datetime-local" className="input" defaultValue={echo ?? toDateTimeLocal(value)} />;
      break;
    case "number":
    case "percent":
      control = <input {...common} type="number" step="any" inputMode="decimal" className="input" defaultValue={str}
        min={field.type === "percent" ? 0 : undefined} max={field.type === "percent" ? 100 : undefined} />;
      break;
    case "currency":
      control = (
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
          <input {...common} inputMode="decimal" className="input num pl-6" defaultValue={str} placeholder="0" />
        </div>
      );
      break;
    case "email":
      control = <input {...common} type="email" className="input" defaultValue={str} />;
      break;
    case "phone":
      control = <input {...common} type="tel" className="input" defaultValue={str} />;
      break;
    case "url":
      control = <input {...common} type="url" className="input" defaultValue={str} placeholder="https://" />;
      break;
    case "user":
      control = (
        <select {...common} className="select" defaultValue={str}>
          <option value="">{t("— Yo —")}</option>
          {ctx.users.filter((u) => u.is_active || u.id === str).map((u) => (
            <option key={u.id} value={u.id}>{u.full_name}</option>
          ))}
        </select>
      );
      break;
    case "stage":
      control = (
        <select {...common} className="select" defaultValue={str}>
          <Opt value="">— Selecciona la etapa —</Opt>
          {ctx.pipelines.filter((p) => p.is_active || p.stages.some((s) => s.id === str)).map((p) => (
            <optgroup key={p.id} label={t(p.name)}>
              {p.stages.map((s) => (
                <option key={s.id} value={s.id}>{t(s.name)} ({s.probability}%)</option>
              ))}
            </optgroup>
          ))}
        </select>
      );
      break;
    case "lookup":
      control = (
        <LookupInput
          id={id}
          name={field.name}
          object={field.lookup!}
          invalid={invalid}
          initial={relation?.id ? { id: relation.id, label: relation.name ?? relation.full_name ?? "" } : null}
        />
      );
      break;
    default:
      control = <input {...common} type="text" className="input" defaultValue={str} />;
  }

  return (
    <div>
      <label htmlFor={id} className="label">
        {field.label}
        {field.required && <span className="text-danger"> *</span>}
      </label>
      {control}
      {error ? <p className="error-text">{t(error)}</p> : field.help ? <p className="help">{t(field.help)}</p> : null}
    </div>
  );
}
