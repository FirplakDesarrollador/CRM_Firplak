import { formatCompactCurrency, formatCurrency, formatMonth } from "@/lib/format";

export function KpiTile({ label, value, unit, sub, tone }: {
  label: string; value: string; unit?: string; sub?: React.ReactNode; tone?: "success" | "danger" | "warning";
}) {
  const toneCls = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-muted";
  return (
    <div className="glass p-5">
      <p className="eyebrow">{label}</p>
      <p className="kpi-value mt-3">{value}{unit && <span className="kpi-unit">{unit}</span>}</p>
      {sub && <p className={`mt-2 text-xs font-medium ${toneCls}`}>{sub}</p>}
    </div>
  );
}

/** Barras horizontales (una serie): etiqueta, barra ≤ 24 px y valor en el extremo. */
export function BarList({
  items,
  format = formatCompactCurrency,
  emptyText = "Sin datos en el periodo.",
}: {
  items: { key: string; label: React.ReactNode; value: number; color?: string; detail?: string }[];
  format?: (v: number) => string;
  emptyText?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <p className="py-6 text-center text-sm text-muted">{emptyText}</p>;
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item.key} className="group relative grid grid-cols-[minmax(6rem,11rem)_1fr] items-center gap-3">
          <span className="truncate text-sm font-medium text-ink-2">{item.label}</span>
          <span className="flex items-center gap-2">
            <span
              className="h-[18px] rounded-r-[4px] transition-opacity group-hover:opacity-80"
              style={{ width: `${Math.max(item.value > 0 ? 1.5 : 0, (item.value / max) * 82)}%`, background: item.color ?? "var(--brand)" }}
            />
            <span className="num whitespace-nowrap text-xs font-semibold text-ink">{format(item.value)}</span>
          </span>
          {item.detail && (
            <span role="tooltip" className="pointer-events-none absolute -top-8 left-40 z-10 hidden whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs font-semibold text-[var(--surface)] shadow group-hover:block">
              {item.detail}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

/** Columnas por mes (una serie) con eje Y redondeado, tooltip y tabla de datos. */
export function MonthlyColumns({ data }: { data: { month: string; won_amount: number; won_count: number; created_amount: number }[] }) {
  const max = niceMax(Math.max(0, ...data.map((d) => Number(d.won_amount))));
  const ticks = [max, max / 2, 0];
  return (
    <div>
      <div className="flex gap-2">
        <div className="flex h-48 flex-col justify-between pb-5 text-right text-[0.68rem] text-muted num">
          {ticks.map((t) => <span key={t} className="-translate-y-1/2 leading-none">{formatCompactCurrency(t)}</span>)}
        </div>
        <div className="relative h-48 flex-1">
          <div className="absolute inset-x-0 top-0 bottom-5 flex flex-col justify-between" aria-hidden>
            {ticks.map((t) => <span key={t} className="border-t border-line" />)}
          </div>
          <div className="absolute inset-x-0 top-0 bottom-5 flex items-end justify-around gap-[2px]">
            {data.map((d) => {
              const h = (Number(d.won_amount) / max) * 100;
              return (
                <div key={d.month} className="group relative flex h-full flex-1 items-end justify-center">
                  <div className="w-full max-w-6 rounded-t-[4px] bg-brand transition-opacity group-hover:opacity-80" style={{ height: `${h}%` }} />
                  <div role="tooltip" className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs font-semibold text-[var(--surface)] shadow group-hover:block">
                    {formatMonth(d.month)}: {formatCurrency(d.won_amount)} · {d.won_count} ganadas
                  </div>
                </div>
              );
            })}
          </div>
          <div className="absolute inset-x-0 bottom-0 flex justify-around text-[0.68rem] text-muted">
            {data.map((d) => <span key={d.month} className="flex-1 text-center">{formatMonth(d.month)}</span>)}
          </div>
        </div>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs font-semibold text-muted">Ver datos en tabla</summary>
        <table className="table mt-2">
          <thead><tr><th>Mes</th><th className="text-right">Ganado</th><th className="text-right">N.º ganadas</th><th className="text-right">Pipeline creado</th></tr></thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.month}>
                <td>{formatMonth(d.month)}</td>
                <td className="num text-right">{formatCurrency(d.won_amount)}</td>
                <td className="num text-right">{d.won_count}</td>
                <td className="num text-right">{formatCurrency(d.created_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/** Embudo: una barra centrada por etapa, ancho proporcional al valor. */
export function Funnel({ stages }: { stages: { id: string; name: string; color: string; category: string; count: number; amount: number; probability: number }[] }) {
  const max = Math.max(1, ...stages.map((s) => Number(s.amount)));
  if (!stages.length) return <p className="py-6 text-center text-sm text-muted">Sin etapas.</p>;
  return (
    <ol className="space-y-2">
      {stages.map((s) => {
        const w = Math.max(6, (Number(s.amount) / max) * 100);
        return (
          <li key={s.id} className="group relative grid grid-cols-[minmax(6rem,10rem)_1fr_auto] items-center gap-3">
            <span className="truncate text-sm font-medium text-ink-2">{s.name}</span>
            <span className="flex justify-center">
              <span className="h-6 rounded-[4px] transition-opacity group-hover:opacity-80"
                style={{ width: `${w}%`, background: s.category === "won" ? "var(--success)" : s.color }} />
            </span>
            <span className="w-28 text-right text-xs">
              <span className="num block font-semibold text-ink">{formatCompactCurrency(s.amount)}</span>
              <span className="text-muted">{s.count} {s.count === 1 ? "oportunidad" : "oportunidades"}</span>
            </span>
            <span role="tooltip" className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs font-semibold text-[var(--surface)] shadow group-hover:block">
              {s.name}: {formatCurrency(s.amount)} · probabilidad {s.probability}%
            </span>
          </li>
        );
      })}
    </ol>
  );
}
