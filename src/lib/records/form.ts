import type { FieldDef, ObjectDef } from "@/lib/objects";

export type FormState = {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string>;
  values?: Record<string, string>;
  /** Posibles duplicados encontrados al crear (se puede guardar de todas formas). */
  duplicates?: { id: string; label: string; href: string }[];
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Acepta montos con cualquier convención: "1,250,000.50", "1.250.000,50", "$ 1.250.000", "1250000".
 * Si aparecen los dos separadores, el último es el decimal; si solo hay uno y va seguido de
 * exactamente tres dígitos (o se repite), es separador de miles.
 */
export function parseAmount(raw: string): number | null {
  const s = raw.replace(/[^\d,.-]/g, "");
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    normalized = s.split(thousands).join("").replace(decimal, ".");
  } else {
    const sep = lastComma >= 0 ? "," : lastDot >= 0 ? "." : null;
    if (!sep) normalized = s;
    else {
      const parts = s.split(sep);
      const isThousands = parts.length > 2 || parts[parts.length - 1].length === 3;
      normalized = isThousands ? parts.join("") : parts.join(".");
    }
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** datetime-local (hora de Colombia) → ISO con zona. */
function toTimestamp(raw: string) {
  if (!raw) return null;
  return raw.length === 16 ? `${raw}:00-05:00` : raw;
}

export function editableFields(def: ObjectDef) {
  return def.fields.filter((f) => !f.readOnly && !f.formHidden);
}

/**
 * Convierte el FormData en columnas + custom_fields según los metadatos.
 * Devuelve errores de validación por campo.
 */
export function parseRecordForm(def: ObjectDef, formData: FormData, existingCustom: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {};
  const custom: Record<string, unknown> = { ...existingCustom };
  const errors: Record<string, string> = {};
  const echo: Record<string, string> = {};

  for (const field of editableFields(def)) {
    const raw = formData.getAll(field.name).map((v) => String(v).trim());
    echo[field.name] = raw.join("|");
    const value = convert(field, raw, errors);
    if (field.required && (value === null || value === "" || (Array.isArray(value) && value.length === 0))) {
      errors[field.name] = "Campo obligatorio";
    }
    if (field.custom) custom[field.name.slice(3)] = value;
    else values[field.name] = value;
  }

  values.custom_fields = custom;
  return { values, errors, echo };
}

function convert(field: FieldDef, raw: string[], errors: Record<string, string>): unknown {
  const first = raw[0] ?? "";
  switch (field.type) {
    case "checkbox":
      return raw.includes("on") || raw.includes("true");
    case "multiselect":
      return raw.filter(Boolean);
    case "number":
    case "percent": {
      if (!first) return null;
      const n = Number(first.replace(",", "."));
      if (!Number.isFinite(n)) errors[field.name] = "Número no válido";
      if (field.type === "percent" && (n < 0 || n > 100)) errors[field.name] = "Debe estar entre 0 y 100";
      return Number.isFinite(n) ? (field.custom ? n : Math.round(n)) : null;
    }
    case "currency": {
      if (!first) return null;
      const n = parseAmount(first);
      if (n === null || n < 0) errors[field.name] = "Valor no válido";
      return n;
    }
    case "email":
      if (first && !EMAIL_RE.test(first)) errors[field.name] = "Correo no válido";
      return first || null;
    case "url":
      if (!first) return null;
      return /^https?:\/\//i.test(first) ? first : `https://${first}`;
    case "datetime":
      return toTimestamp(first);
    case "date":
      return first || null;
    default:
      return first || null;
  }
}
