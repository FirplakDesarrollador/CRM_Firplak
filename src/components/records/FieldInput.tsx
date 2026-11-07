"use client";

import { useEffect, useRef, useState } from "react";
import type { FieldDef } from "@/lib/objects";
import type { PipelineWithStages, UserOption } from "@/lib/records/data";
import { LookupInput, type LookupOption } from "./LookupInput";
import { useT } from "@/lib/i18n/client";

import { Opt } from "@/components/ui/Opt";
export type FieldInputContext = {
  users: UserOption[];
  pipelines: PipelineWithStages[];
  /** Países y municipios de Colombia, si el formulario tiene direcciones. */
  geo?: { countries: string[]; departments: Record<string, string[]> };
  isNew?: boolean;
  /** Opciones que vienen de la base para los campos con `choices`. */
  choices?: { clientPriceBooks?: { id: string; name: string }[] };
};

/** Lo que el campo necesita de otros campos del formulario (valores iniciales). */
export type FieldLinks = {
  /** Cuenta elegida (campo `derived.from` o `lookupFilter`). */
  source?: string;
  /** Casilla `manualFlag` marcada. */
  manual?: boolean;
  /** Canal de la cuenta (etapa de oportunidades). */
  channel?: string | null;
};

type LookupSelect = CustomEvent<{ name: string; item: LookupOption | null }>;

/** Escucha lo que se elige en los campos de relación del formulario. */
function useLookupSelect(ref: React.RefObject<HTMLElement | null>, handler: (name: string, item: LookupOption | null) => void) {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const on = (e: Event) => latest.current((e as LookupSelect).detail.name, (e as LookupSelect).detail.item);
    form.addEventListener("lookup:select", on);
    return () => form.removeEventListener("lookup:select", on);
  }, [ref]);
}

/** Etapa equivalente en otro pipeline (mismo tipo y probabilidad más cercana), como hace la base. */
function equivalentStage(stage: PipelineWithStages["stages"][number] | undefined, target: PipelineWithStages) {
  const same = target.stages.filter((s) => s.category === (stage?.category ?? "open"));
  const pool = same.length ? same : target.stages.filter((s) => s.category === "open");
  return [...pool].sort((a, b) => Math.abs(a.probability - (stage?.probability ?? 0)) - Math.abs(b.probability - (stage?.probability ?? 0)) || a.sort_order - b.sort_order)[0];
}

/**
 * Etapa de una oportunidad: solo las del pipeline del canal de la cuenta (si el canal tiene pipeline). Al cambiar
 * la cuenta, pasa a la etapa equivalente del pipeline del nuevo canal.
 */
function StageSelect({ common, initialValue, pipelines, initialChannel }: {
  common: { id: string; name: string; "aria-invalid": boolean; required?: boolean };
  initialValue: string;
  pipelines: PipelineWithStages[];
  initialChannel: string | null;
}) {
  const t = useT();
  const ref = useRef<HTMLSelectElement>(null);
  const [channel, setChannel] = useState(initialChannel);
  const [value, setValue] = useState(initialValue);
  const allStages = pipelines.flatMap((p) => p.stages);
  const channelPipeline = channel ? pipelines.find((p) => p.channel === channel && p.is_active) : undefined;
  const current = pipelines.find((p) => p.stages.some((s) => s.id === value));
  const visible = channelPipeline
    ? [channelPipeline, ...(current && current.id !== channelPipeline.id ? [current] : [])]
    : pipelines.filter((p) => p.is_active || p.id === current?.id);

  useLookupSelect(ref, (name, item) => {
    if (name !== "account_id") return;
    const next = item?.channel ?? null;
    setChannel(next);
    const target = next ? pipelines.find((p) => p.channel === next && p.is_active) : undefined;
    if (target && !target.stages.some((s) => s.id === value)) setValue(equivalentStage(allStages.find((s) => s.id === value), target)?.id ?? "");
  });

  return (
    <>
      <select {...common} ref={ref} className="select" value={value} onChange={(e) => setValue(e.target.value)}>
        <Opt value="">— Selecciona la etapa —</Opt>
        {visible.map((p) => (
          <optgroup key={p.id} label={t(p.name)}>
            {p.stages.map((s) => (
              <option key={s.id} value={s.id}>{t(s.name)} ({s.probability}%)</option>
            ))}
          </optgroup>
        ))}
      </select>
      {channelPipeline && <p className="help">{t("Pipeline del")} {channel}: {t(channelPipeline.name)}.</p>}
    </>
  );
}

/**
 * Relación ligada a otra del formulario: busca solo dentro de la cuenta elegida (`lookupFilter`) o se llena con
 * la cuenta del registro elegido en otro campo (`fillFrom`, p. ej. la cuenta de la oportunidad).
 */
function LinkedLookup({ field, id, invalid, initial, initialFilter }: {
  field: FieldDef; id: string; invalid: boolean; initial: { id: string; label: string } | null; initialFilter: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState(initialFilter);
  const [filled, setFilled] = useState<{ value: { id: string; label: string } | null; version: number }>({ value: initial, version: 0 });

  useLookupSelect(ref, (name, item) => {
    if (field.lookupFilter && name === field.lookupFilter) setFilter(item?.id ?? null);
    if (field.fillFrom && name === field.fillFrom && item?.account) {
      const account = item.account;
      setFilled((f) => ({ value: account, version: f.version + 1 }));
      // Los demás campos reaccionan como si se hubiera elegido a mano (direcciones, condiciones de pago).
      queueMicrotask(() => ref.current?.closest("form")?.dispatchEvent(
        new CustomEvent("lookup:select", { detail: { name: field.name, item: { id: account.id, label: account.label } } })));
    }
  });

  return (
    <div ref={ref}>
      <LookupInput key={filled.version} id={id} name={field.name} object={field.lookup!} invalid={invalid}
        initial={filled.value} filterAccount={filter} />
    </div>
  );
}

const termsCache = new Map<string, Promise<Record<string, string | null>>>();
function accountTerms(accountId: string) {
  if (!termsCache.has(accountId)) {
    termsCache.set(accountId, fetch(`/api/cuenta-condiciones?id=${accountId}`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
  }
  return termsCache.get(accountId)!;
}

/**
 * Campo que se toma de la cuenta (dirección, condiciones de pago): se ve sin editar y se actualiza al elegir la
 * cuenta. Con su casilla (`manualFlag`) marcada se escribe a mano.
 */
function DerivedInput({ common, field, initialValue, links }: {
  common: { id: string; name: string; "aria-invalid": boolean; required?: boolean };
  field: FieldDef;
  initialValue: string;
  links?: FieldLinks;
}) {
  const t = useT();
  const ref = useRef<HTMLInputElement>(null);
  const [manual, setManual] = useState(Boolean(links?.manual));
  const [fromAccount, setFromAccount] = useState(links?.manual ? "" : initialValue);
  const [typed, setTyped] = useState(links?.manual ? initialValue : "");

  const load = (accountId: string | null | undefined) => {
    if (!accountId) {
      setFromAccount("");
      return;
    }
    accountTerms(accountId).then((terms) => setFromAccount(terms[field.name] ?? ""));
  };
  // Nueva cotización con la cuenta ya elegida (desde la oportunidad), o la casilla marcada: se conoce el valor de la cuenta.
  useEffect(() => {
    const source = links?.source;
    if (source && (!initialValue || links?.manual)) accountTerms(source).then((terms) => setFromAccount(terms[field.name] ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useLookupSelect(ref, (name, item) => {
    if (name === field.derived?.from) load(item?.id);
  });
  useEffect(() => {
    const form = ref.current?.form;
    if (!form || !field.manualFlag) return;
    const onChange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (target.name !== field.manualFlag) return;
      setManual(target.checked);
      // Al marcarla se parte de lo que trae la cuenta.
      if (target.checked) setTyped((v) => v || fromAccount);
    };
    form.addEventListener("change", onChange);
    return () => form.removeEventListener("change", onChange);
  }, [field.manualFlag, fromAccount]);

  return manual ? (
    <input {...common} ref={ref} type="text" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} />
  ) : (
    <input id={common.id} ref={ref} type="text" className="input" value={fromAccount} disabled placeholder={t("Se toma de la cuenta")} />
  );
}

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

/**
 * Parte de una dirección. País: lista. Departamento y Ciudad: listas de Colombia (la ciudad según el
 * departamento); en otros países, texto libre. Escucha los cambios del país y el departamento de la misma
 * dirección en el formulario.
 */
function GeoInput({
  common,
  field,
  initialValue,
  initialPlace,
  geo,
}: {
  common: { id: string; name: string; "aria-invalid": boolean; required?: boolean };
  field: FieldDef;
  initialValue: string;
  initialPlace: { country: string; state: string };
  geo: NonNullable<FieldInputContext["geo"]>;
}) {
  const t = useT();
  const ref = useRef<HTMLElement>(null);
  const [place, setPlace] = useState(initialPlace);
  const [value, setValue] = useState(initialValue);
  const role = field.geoRole!;
  const names = field.geo!;

  useEffect(() => {
    const form = (ref.current as HTMLInputElement | null)?.form;
    if (!form) return;
    const onChange = (e: Event) => {
      const target = e.target as HTMLSelectElement;
      if (target.name === names.country && role !== "country") {
        setPlace((p) => ({ country: target.value, state: p.country === target.value ? p.state : "" }));
        setValue("");
      } else if (target.name === names.state && role === "city") {
        setPlace((p) => ({ ...p, state: target.value }));
        setValue("");
      }
    };
    form.addEventListener("change", onChange);
    return () => form.removeEventListener("change", onChange);
  }, [names, role]);

  const options = (list: string[]) => (
    <>
      <option value="">{t("— Ninguno —")}</option>
      {list.map((o) => <option key={o} value={o}>{o}</option>)}
      {value && !list.includes(value) && <option value={value}>{value}</option>}
    </>
  );
  const select = (list: string[], disabled = false) => (
    <select {...common} ref={ref as React.RefObject<HTMLSelectElement>} className="select" value={value} disabled={disabled}
      onChange={(e) => setValue(e.target.value)}>
      {options(list)}
    </select>
  );

  if (role === "country") return select(geo.countries);
  if (place.country !== "Colombia") {
    return <input {...common} ref={ref as React.RefObject<HTMLInputElement>} className="input" value={value} onChange={(e) => setValue(e.target.value)} />;
  }
  if (role === "state") return select(Object.keys(geo.departments));
  const cities = geo.departments[place.state] ?? [];
  return (
    <>
      {select(cities, !place.state && !value)}
      {!place.state && <p className="help">{t("Elige primero el departamento.")}</p>}
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
  place,
  links,
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
  /** Dirección: país y departamento iniciales de la misma dirección. */
  place?: { country: string; state: string };
  /** Valores de otros campos del formulario que este campo necesita. */
  links?: FieldLinks;
}) {
  const t = useT();
  const id = `f-${field.name.replace(".", "-")}`;
  const invalid = Boolean(error);
  const str = echo ?? (value === null || value === undefined ? "" : String(value));
  const common = { id, name: field.name, "aria-invalid": invalid, required: field.required };

  let control: React.ReactNode;
  // Un país nuevo empieza en Colombia; los registros existentes conservan lo que tenían.
  const geoValue = field.geoRole === "country" && !str && ctx.isNew && !echo ? "Colombia" : str;
  const kind = field.geoRole && ctx.geo && place ? "geo" : field.derived ? "derived" : field.choices ? "choices" : field.type;
  switch (kind) {
    case "derived":
      control = <DerivedInput common={common} field={field} initialValue={str} links={links} />;
      break;
    case "choices":
      control = (
        <select {...common} className="select" defaultValue={str}>
          <option value="">{t("— Ninguna —")}</option>
          {(ctx.choices?.[field.choices!] ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          {str && !(ctx.choices?.[field.choices!] ?? []).some((o) => o.id === str) && (
            <option value={str}>{(relation as { name?: string } | null)?.name ?? str} ({t("inactiva")})</option>
          )}
        </select>
      );
      break;
    case "geo":
      control = <GeoInput common={common} field={field} initialValue={geoValue} initialPlace={place!} geo={ctx.geo!} />;
      break;
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
          <input {...common} inputMode="decimal" className={`input num pl-6 ${field.currencyCode ? "pr-12" : ""}`} defaultValue={str} placeholder="0" />
          {field.currencyCode && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted">{field.currencyCode}</span>
          )}
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
      control = <StageSelect common={common} initialValue={str} pipelines={ctx.pipelines} initialChannel={links?.channel ?? null} />;
      break;
    case "lookup":
      if (field.lookupFilter || field.fillFrom) {
        control = (
          <LinkedLookup field={field} id={id} invalid={invalid} initialFilter={links?.source ?? null}
            initial={relation?.id ? { id: relation.id, label: relation.name ?? relation.full_name ?? "" } : null} />
        );
        break;
      }
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
