// Formato numérico del Firplak Design System: "20,229 Millones COP", "91.4%",
// negativos entre paréntesis "(1,904 Millones COP)".
const numberFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const integerFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const oneDecimalFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

const negative = (text: string, n: number) => (n < 0 ? `(${text})` : text);

// Fechas con nombres propios (no Intl): Node y los navegadores abrevian los meses
// distinto ("sept" / "sep") y eso rompe la hidratación de componentes cliente.
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export type DateLocale = "es" | "en";
const months = (locale: DateLocale) => (locale === "en" ? MONTHS_EN : MONTHS);
const BOGOTA_OFFSET_MS = 5 * 3600000; // Colombia: UTC-5 todo el año

function bogotaParts(value: string | Date) {
  const d = new Date(new Date(value).getTime() - BOGOTA_OFFSET_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), min: d.getUTCMinutes() };
}

function clock(h: number, min: number, locale: DateLocale = "es") {
  const suffix = locale === "en" ? (h < 12 ? "AM" : "PM") : h < 12 ? "a. m." : "p. m.";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(min).padStart(2, "0")} ${suffix}`;
}

export const TIME_ZONE = "America/Bogota";

export function formatCurrency(value: number | string | null | undefined, currency = "COP") {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  const text = `$${integerFmt.format(Math.abs(n))}${currency !== "COP" ? ` ${currency}` : ""}`;
  return negative(text, n);
}

/** Millones para tarjetas: { value: "3,684", unit: "Millones COP" }. */
export function formatMillions(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  const abs = Math.abs(n) / 1e6;
  const text = abs >= 100 ? integerFmt.format(abs) : oneDecimalFmt.format(abs);
  return { value: negative(text, n), unit: "Millones COP" };
}

/** Abreviado para espacios reducidos: "$3,684 M", "$850 mil". */
export function formatCompactCurrency(value: number | string | null | undefined) {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  const abs = Math.abs(n);
  let text: string;
  if (abs >= 1e6) text = `$${(abs >= 1e8 ? integerFmt : oneDecimalFmt).format(abs / 1e6)} M`;
  else if (abs >= 1e3) text = `$${oneDecimalFmt.format(abs / 1e3)} mil`;
  else text = `$${integerFmt.format(abs)}`;
  return negative(text, n);
}

/**
 * Regla de cifras de dinero (una por contexto):
 * - Tarjeta de indicador: cifra grande en millones con la unidad escrita, `formatMillions` → «3,684 Millones COP».
 * - Cualquier otro total o resumen (subtítulos, metas, embudos, gráficos, pronóstico): `formatCompactCurrency` → «$2,140 M».
 * - Un registro (fichas, listas, cotizaciones, pedidos): pesos completos, `formatCurrency` → «$376,219,200».
 */

/** El sustantivo concuerda con la cifra: plural(1, "pedido", "pedidos") → "pedido"; 0 y 2+ van en plural. */
export function plural(n: number | string | null | undefined, one: string, many: string) {
  return Number(n ?? 0) === 1 ? one : many;
}

const UNIT_PLURALS: Record<string, string> = {
  unidad: "unidades", juego: "juegos", caja: "cajas", metro: "metros", par: "pares", rollo: "rollos",
  kit: "kits", paquete: "paquetes", galón: "galones", kilo: "kilos", litro: "litros", pieza: "piezas",
};

/** «1 unidad», «400 unidades». Los códigos de SAP en mayúsculas («UN», «M2») se dejan tal cual. */
export function formatQuantityUnit(quantity: number | string | null | undefined, unit: string | null | undefined) {
  const amount = formatNumber(quantity);
  if (!unit) return amount;
  if (unit === unit.toUpperCase() && unit.length <= 4) return `${amount} ${unit}`;
  const word = unit.trim().toLowerCase();
  return `${amount} ${Number(quantity) === 1 ? word : UNIT_PLURALS[word] ?? word}`;
}

/** Cambia las fechas ISO (2026-04-13) que vienen dentro de un texto por la fecha legible («13 abr 2026»). */
export function readableDates(text: string, locale: DateLocale = "es") {
  return text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (iso) => formatDate(iso, locale));
}

export function formatNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  return negative(numberFmt.format(Math.abs(n)), n);
}

/** "91.4%" — una decimal como máximo. */
export function formatPercent(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  return negative(`${oneDecimalFmt.format(Math.abs(n))}%`, n);
}

/** Fechas tipo `date` (YYYY-MM-DD) se muestran sin desplazamiento de zona horaria. */
export function formatDate(value: string | null | undefined, locale: DateLocale = "es") {
  if (!value) return "—";
  const fmt = (y: number, m: number, d: number) => (locale === "en" ? `${months(locale)[m]} ${d}, ${y}` : `${d} ${MONTHS[m]} ${y}`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return fmt(y, m - 1, d);
  }
  const p = bogotaParts(value);
  return fmt(p.y, p.m, p.d);
}

export function formatDateTime(value: string | null | undefined, locale: DateLocale = "es") {
  if (!value) return "—";
  const p = bogotaParts(value);
  return `${formatDate(value, locale)}, ${clock(p.h, p.min, locale)}`;
}

export function formatTime(value: string | null | undefined, locale: DateLocale = "es") {
  if (!value) return "";
  const p = bogotaParts(value);
  return clock(p.h, p.min, locale);
}

export function formatMonth(yyyyMm: string, locale: DateLocale = "es") {
  const [y, m] = yyyyMm.split("-").map(Number);
  return `${months(locale)[m - 1]} ${String(y).slice(2)}`;
}

/** Hoy (YYYY-MM-DD) en la zona horaria de Colombia. */
export function todayISO() {
  return new Date(Date.now() - BOGOTA_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDaysISO(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

export function relativeDays(iso: string | null | undefined, locale: DateLocale = "es") {
  if (!iso) return null;
  const today = todayISO();
  const diff = Math.round((Date.parse(iso.slice(0, 10)) - Date.parse(today)) / 86400000);
  if (locale === "en") {
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    if (diff === -1) return "Yesterday";
    return diff > 0 ? `In ${diff} days` : `${-diff} days ago`;
  }
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  if (diff === -1) return "Ayer";
  return diff > 0 ? `En ${diff} días` : `Hace ${-diff} días`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}
