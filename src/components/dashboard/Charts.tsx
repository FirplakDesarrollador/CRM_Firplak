import { useId } from "react";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";

import { Tr } from "@/components/ui/Tr";
import { Fmt } from "@/components/ui/Fmt";
import { Val } from "@/components/ui/Val";
export function KpiTile({ label, value, unit, sub, tone }: {
  label: string; value: string; unit?: string; sub?: React.ReactNode; tone?: "success" | "danger" | "warning";
}) {
  const toneCls = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-muted";
  return (
    <div className="glass p-5">
      <p className="eyebrow"><Tr>{label}</Tr></p>
      <p className="kpi-value mt-3">{value}{unit && <span className="kpi-unit"><Tr>{unit}</Tr></span>}</p>
      {sub && <p className={`mt-2 text-xs font-medium ${toneCls}`}>{typeof sub === "string" ? <Tr>{sub}</Tr> : sub}</p>}
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
  const uid = useId();
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <p className="py-6 text-center text-sm text-muted">{emptyText}</p>;
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item.key} className="group relative grid grid-cols-[minmax(6rem,11rem)_1fr] items-center gap-3"
          tabIndex={item.detail ? 0 : undefined} aria-describedby={item.detail ? `${uid}-${item.key}` : undefined}>
          <span className="truncate text-sm font-medium text-ink-2"><Val>{item.label}</Val></span>
          <span className="flex items-center gap-2">
            <span
              className="h-[18px] rounded-r-[4px] transition-opacity group-hover:opacity-80"
              style={{ width: `${Math.max(item.value > 0 ? 1.5 : 0, (item.value / max) * 82)}%`, background: item.color ?? "var(--brand)" }}
            />
            <span className="num whitespace-nowrap text-xs font-semibold text-ink">{format(item.value)}</span>
          </span>
          {item.detail && (
            <span role="tooltip" id={`${uid}-${item.key}`} className="pointer-events-none absolute bottom-full left-0 z-10 mb-1 hidden w-max max-w-full rounded-md bg-ink px-2 py-1 text-xs font-semibold text-[var(--surface)] shadow group-hover:block group-focus:block sm:left-40 sm:max-w-none">
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
  const uid = useId();
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
            {data.map((d, i) => {
              const h = (Number(d.won_amount) / max) * 100;
              const side = i < 3 ? "left-0" : i >= data.length - 3 ? "right-0" : "left-1/2 -translate-x-1/2";
              return (
                <div key={d.month} tabIndex={0} aria-describedby={`${uid}-${d.month}`} className="group relative flex h-full flex-1 items-end justify-center">
                  <div className="w-full max-w-6 rounded-t-[4px] bg-brand transition-opacity group-hover:opacity-80" style={{ height: `${h}%` }} />
                  <div role="tooltip" id={`${uid}-${d.month}`} className={`pointer-events-none absolute bottom-full z-10 mb-1 hidden w-max max-w-[70vw] rounded-md bg-ink px-2 py-1 text-xs font-semibold text-[var(--surface)] shadow group-hover:block group-focus:block ${side}`}>
                    <Fmt month={d.month} />: {formatCurrency(d.won_amount)} · {d.won_count} ganadas
                  </div>
                </div>
              );
            })}
          </div>
          <div className="absolute inset-x-0 bottom-0 flex justify-around text-[0.68rem] text-muted">
            {data.map((d) => <span key={d.month} className="flex-1 text-center"><Fmt month={d.month} /></span>)}
          </div>
        </div>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs font-semibold text-muted"><Tr>Ver datos en tabla</Tr></summary>
        <table className="table mt-2">
          <thead><tr><th><Tr>Mes</Tr></th><th className="text-right"><Tr>Ganado</Tr></th><th className="text-right"><Tr>N.º ganadas</Tr></th><th className="text-right"><Tr>Pipeline creado</Tr></th></tr></thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.month}>
                <td><Fmt month={d.month} /></td>
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

/** Embudo: una barra centrada por etapa, ancho proporcional al valor. En el celular la barra baja a su propia línea. */
export function Funnel({ stages }: { stages: { id: string; name: string; color: string; category: string; count: number; amount: number; probability: number }[] }) {
  const uid = useId();
  const max = Math.max(1, ...stages.map((s) => Number(s.amount)));
  if (!stages.length) return <p className="py-6 text-center text-sm text-muted"><Tr>Sin etapas.</Tr></p>;
  return (
    <ol className="space-y-2">
      {stages.map((s) => {
        const w = Math.max(6, (Number(s.amount) / max) * 100);
        return (
          <li key={s.id} tabIndex={0} aria-describedby={`${uid}-${s.id}`} className="group relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(6rem,10rem)_1fr_auto]">
            <span className="truncate text-sm font-medium text-ink-2"><Val>{s.name}</Val></span>
            <span className="order-last col-span-2 flex justify-center sm:order-none sm:col-span-1">
              <span className="h-6 rounded-[4px] transition-opacity group-hover:opacity-80"
                style={{ width: `${w}%`, background: s.category === "won" ? "var(--success)" : s.color }} />
            </span>
            <span className="text-right text-xs sm:w-28">
              <span className="num block font-semibold text-ink">{formatCompactCurrency(s.amount)}</span>
              <span className="text-muted">{s.count} {s.count === 1 ? "oportunidad" : "oportunidades"}</span>
            </span>
            <span role="tooltip" id={`${uid}-${s.id}`} className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden w-max max-w-full -translate-x-1/2 rounded-md bg-ink px-2 py-1 text-xs font-semibold text-[var(--surface)] shadow group-hover:block group-focus:block">
              {s.name}: {formatCurrency(s.amount)} · probabilidad {s.probability}%
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Columnas verticales (una serie) para categorías ordenadas, con eje Y redondeado y tooltip. */
export function ColumnChart({ items, format }: { items: { key: string; label: string; value: number }[]; format: (v: number) => string }) {
  const max = niceMax(Math.max(0, ...items.map((i) => i.value)));
  const ticks = [max, max / 2, 0];
  if (!items.length) return <p className="py-6 text-center text-sm text-muted"><Tr>Sin datos.</Tr></p>;
  return (
    <div className="flex gap-2">
      <div className="num flex h-56 flex-col justify-between pb-10 text-right text-[0.68rem] text-muted">
        {ticks.map((t) => <span key={t} className="-translate-y-1/2 leading-none">{format(t)}</span>)}
      </div>
      <div className="relative h-56 flex-1 overflow-x-auto">
        <div className="absolute inset-x-0 top-0 bottom-10 flex flex-col justify-between" aria-hidden>
          {ticks.map((t) => <span key={t} className="border-t border-line" />)}
        </div>
        <div className="absolute inset-x-0 top-0 bottom-10 flex items-end justify-around gap-[2px]">
          {items.map((d) => (
            <div key={d.key} className="group relative flex h-full flex-1 items-end justify-center">
              <div className="w-full max-w-6 rounded-t-[4px] bg-brand transition-opacity group-hover:opacity-80" style={{ height: `${(d.value / max) * 100}%` }} />
              <div role="tooltip" className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs font-medium text-[var(--surface)] shadow group-hover:block">
                {d.label}: {format(d.value)}
              </div>
            </div>
          ))}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex h-10 justify-around text-[0.68rem] text-muted">
          {items.map((d) => <span key={d.key} className="line-clamp-2 flex-1 px-0.5 pt-1 text-center leading-tight"><Val>{d.label}</Val></span>)}
        </div>
      </div>
    </div>
  );
}
