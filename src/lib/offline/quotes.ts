// Cotizaciones hechas sin señal: los totales se calculan en el dispositivo con la misma cuenta que hace la base
// (recalc_quote y la columna line_total). No depende del resto de la app: scripts/test-db.mjs lo compara con la base.

export type QuoteLineAmounts = { quantity: number; unit_price: number; discount: number };

export type QuoteTotals = {
  subtotal: number;
  discount: number;
  net: number;
  taxRate: number;
  tax: number;
  total: number;
};

// Cuenta exacta en enteros (como el `numeric` de la base), sin los redondeos del punto flotante.
const int = (n: number, scale: number) => BigInt(Math.round(n * scale));
const half = (n: bigint, divisor: number) => (n + BigInt(divisor / 2)) / BigInt(divisor);
const money = (cents: bigint) => Number(cents) / 100;

/** IVA que pone el CRM al crear la cotización: 19 % en pesos, 0 % en otra moneda (exportación). */
export const taxRateFor = (currency: string) => (currency === "COP" ? 19 : 0);

/** Cantidad × precio, en diezmilésimas. */
const gross = (line: QuoteLineAmounts) => int(line.quantity, 100) * int(line.unit_price, 100);
/** Total de la línea en centavos: `round(quantity * unit_price * (1 - discount / 100), 2)`. */
const lineCents = (line: QuoteLineAmounts) => half(gross(line) * (BigInt(10000) - int(line.discount, 100)), 1_000_000);

/** Total de una línea, como la columna `line_total`. */
export const lineTotal = (line: QuoteLineAmounts) => money(lineCents(line));

/** Totales de la cotización, como `recalc_quote` (sin flete: se agrega en el CRM). */
export function quoteTotals(lines: QuoteLineAmounts[], currency: string): QuoteTotals {
  const zero = BigInt(0);
  const sub = lines.reduce((sum, line) => sum + gross(line), zero);
  const net = lines.reduce((sum, line) => sum + lineCents(line), zero);
  const taxRate = taxRateFor(currency);
  const tax = half(net * BigInt(taxRate), 100);
  return {
    subtotal: money(half(sub, 100)),
    discount: money(half(sub - net * BigInt(100), 100)),
    net: money(net),
    taxRate,
    tax: money(tax),
    total: money(net + tax),
  };
}

/** Número provisional mientras la cotización no tiene el del CRM. Sale de su id, así no cambia entre pantallas. */
export const provisionalNumber = (id: string) => `PROV-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
