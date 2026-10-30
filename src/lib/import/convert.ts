import type { FieldDef } from "@/lib/objects";
import { parseAmount } from "@/lib/records/form";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "31/12/2026", "2026-12-31", "31-12-2026" → "2026-12-31" */
export function parseDateValue(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

export type Converted = { ok: true; value: unknown } | { ok: false; error: string };

/** Convierte el texto de una celda al valor del campo (sin lookups, que se resuelven aparte). */
export function convertCell(field: FieldDef, raw: string): Converted {
  const s = raw.trim();
  if (s === "") return { ok: true, value: field.type === "checkbox" ? false : field.type === "multiselect" ? [] : null };
  switch (field.type) {
    case "number":
    case "percent":
    case "currency": {
      const n = parseAmount(s);
      if (n === null) return { ok: false, error: `${field.label}: número no válido “${s}”` };
      return { ok: true, value: field.type === "currency" || field.custom ? n : Math.round(n) };
    }
    case "date": {
      const d = parseDateValue(s);
      return d ? { ok: true, value: d } : { ok: false, error: `${field.label}: fecha no válida “${s}” (usa DD/MM/AAAA)` };
    }
    case "datetime": {
      const d = parseDateValue(s);
      const time = s.match(/(\d{1,2}):(\d{2})/);
      return d ? { ok: true, value: `${d}T${time ? `${time[1].padStart(2, "0")}:${time[2]}` : "09:00"}:00-05:00` } : { ok: false, error: `${field.label}: fecha no válida “${s}”` };
    }
    case "checkbox":
      return { ok: true, value: /^(s[ií]|si|true|1|x|yes|y)$/i.test(s) };
    case "email":
      return EMAIL_RE.test(s) ? { ok: true, value: s.toLowerCase() } : { ok: false, error: `${field.label}: correo no válido “${s}”` };
    case "url":
      return { ok: true, value: /^https?:\/\//i.test(s) ? s : `https://${s}` };
    case "multiselect": {
      const parts = s.split(/[;|]/).map((p) => p.trim()).filter(Boolean);
      return { ok: true, value: parts };
    }
    case "select": {
      const options = field.options ?? [];
      const byLabel = Object.entries(field.optionLabels ?? {}).find(([, label]) => label.toLowerCase() === s.toLowerCase())?.[0];
      const match = options.find((o) => o.toLowerCase() === s.toLowerCase()) ?? byLabel;
      // Listas sin restricción en la base: se acepta el valor aunque no esté en la lista.
      return { ok: true, value: match ?? s };
    }
    default:
      return { ok: true, value: s };
  }
}
