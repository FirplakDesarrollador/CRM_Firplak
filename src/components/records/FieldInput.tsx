"use client";

import type { FieldDef } from "@/lib/objects";
import type { PipelineWithStages, UserOption } from "@/lib/records/data";
import { LookupInput } from "./LookupInput";
import { useT } from "@/lib/i18n/client";

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

export function FieldInput({
  field,
  value,
  relation,
  error,
  ctx,
  echo,
}: {
  field: FieldDef;
  value: unknown;
  relation?: { id?: string; name?: string; full_name?: string } | null;
  error?: string;
  ctx: FieldInputContext;
  /** Valor devuelto por el servidor tras un error de validación. */
  echo?: string;
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
          <option value="">— Selecciona la etapa —</option>
          {ctx.pipelines.filter((p) => p.is_active || p.stages.some((s) => s.id === str)).map((p) => (
            <optgroup key={p.id} label={p.name}>
              {p.stages.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.probability}%)</option>
              ))}
            </optgroup>
          ))}
        </select>
      );
      break;
    case "lookup":
      control = (
        <LookupInput
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
      {error ? <p className="error-text">{error}</p> : field.help ? <p className="help">{field.help}</p> : null}
    </div>
  );
}
