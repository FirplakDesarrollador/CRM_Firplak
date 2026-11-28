"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { formatCompactCurrency, formatCurrency, formatDate, formatMonth } from "@/lib/format";
import { useLocale, useT } from "@/lib/i18n/client";
import { REAL_LAYERS, type RealDay } from "./real-layers";
import { niceScale } from "./scale";

const PAD = { top: 30, right: 12, bottom: 44, left: 64 };
const TOTAL = "var(--text)"; // la línea del total va en la tinta de la app, sobre los colores de siempre

type Bucket = { key: string; label: string; start: string; end: string; invoiced: number; backlog: number; opportunities: number };

/**
 * Barras apiladas con los colores de la app (los de «Tendencia del pronóstico»: verde facturado, azul pedidos y entregas, y el tono de mejor caso para las oportunidades) dentro de una franja tenue
 * cuyo borde es la línea del total proyectado: continua hasta hoy, punteada de ahí en adelante.
 * En un mes, cada barra es lo acumulado al cierre de la semana y la línea termina en el pronóstico del mes.
 * En trimestre y año, cada barra es lo que se factura en ese mes y la línea muestra hacia dónde va el total.
 */
export function RealForecastChart({ days, today, quota, mode }: { days: RealDay[]; today: string; quota: number | null; mode: "weeks" | "months" }) {
  const t = useT();
  const locale = useLocale();
  const id = useId().replace(/:/g, "");
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(720);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    if (!box.current) return;
    const observer = new ResizeObserver(([entry]) => setW(Math.round(entry.contentRect.width)));
    observer.observe(box.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (hover === null) return;
    const close = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setHover(null); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [hover]);

  const weeks = mode === "weeks";
  const shortDate = (iso: string) => formatDate(iso, locale).replace(/,? \d{4}$/, "");
  const buckets: Bucket[] = [];
  if (weeks) {
    // Semanas del mes contadas desde el día 1: 1–7, 8–14… Cada una muestra el acumulado a su último día.
    for (let i = 0; i < days.length; i += 7) {
      const first = days[i], end = days[Math.min(i + 6, days.length - 1)];
      const d1 = Number(first.date.slice(8)), sd = shortDate(end.date);
      const label = first.date === end.date ? sd : locale === "en" ? sd.replace(/(\d+)$/, `${d1}–$1`) : `${d1}–${sd}`;
      buckets.push({ key: first.date, label, start: first.date, end: end.date, invoiced: end.invoiced, backlog: end.backlog, opportunities: end.opportunities });
    }
  } else {
    // Meses del periodo: lo que entra en cada uno (el acumulado a su cierre menos el del mes anterior).
    let prev = { invoiced: 0, backlog: 0, opportunities: 0 };
    days.forEach((d, i) => {
      const next = days[i + 1];
      if (next && next.date.slice(0, 7) === d.date.slice(0, 7)) return;
      const ym = d.date.slice(0, 7);
      buckets.push({
        key: ym, label: formatMonth(ym, locale).split(" ")[0], start: `${ym}-01`, end: d.date,
        invoiced: Math.max(0, d.invoiced - prev.invoiced), backlog: Math.max(0, d.backlog - prev.backlog), opportunities: Math.max(0, d.opportunities - prev.opportunities),
      });
      prev = d;
    });
  }

  const H = W < 560 ? 250 : 340;
  const last = buckets.length - 1;
  const total = (b: Bucket) => b.invoiced + b.backlog + b.opportunities;
  const shownQuota = weeks ? quota : null; // la meta es del periodo completo: solo se compara contra el acumulado
  // Tope ajustado al dato (con un 4 % de aire para la etiqueta del valor más alto).
  const { max, ticks } = niceScale(Math.max(1, shownQuota ?? 0, ...buckets.map(total)) * 1.04);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const band = innerW / Math.max(1, buckets.length);
  const barW = Math.max(6, Math.min(band * 0.46, 72));
  const x = (i: number) => PAD.left + band * i + band / 2;
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  // El tramo donde cae hoy: hasta ahí la línea es real; después, proyección.
  const todayIndex = buckets.findIndex((b) => b.start <= today && today <= b.end);
  const split = todayIndex >= 0 ? todayIndex : buckets.length && today > buckets[last].end ? last : 0;
  const point = (i: number) => `${x(i)},${y(total(buckets[i]))}`;
  const edge = buckets.length ? [`${PAD.left},${y(total(buckets[0]))}`, ...buckets.map((_, i) => point(i)), `${W - PAD.right},${y(total(buckets[last]))}`] : [];
  const showValues = band >= 62;
  const axisLabel = (b: Bucket) => (band >= 44 ? b.label : b.label.slice(0, 1).toUpperCase());
  const totalLabel = weeks ? t("Acumulado") : t("Total del mes");
  const summary = buckets.map((b) => `${b.label} ${formatCompactCurrency(total(b))}`).join(", ");
  const when = (b: Bucket) => (b.start <= today && today <= b.end ? ` · ${t("Hoy")}` : b.start > today ? ` · ${t("proyección")}` : "");

  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-2 text-xs text-ink-2" aria-label={t("Leyenda")}>
        {REAL_LAYERS.map((l) => (
          <li key={l.key} className="chart-pastilla"><span className="h-2 w-2 rounded-full" style={{ background: l.color }} />{t(l.label)}</li>
        ))}
        <li className="chart-pastilla"><span className="h-[3px] w-4 rounded-full" style={{ background: TOTAL }} />{t("Total proyectado")}</li>
      </ul>
      <div className="relative" ref={box}>
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="group" tabIndex={0}
          aria-label={`${weeks ? t("Pronóstico acumulado por semana") : t("Pronóstico mes a mes")}. ${summary}`}
          onMouseLeave={() => setHover(null)} onFocus={() => setHover((h) => h ?? split)} onBlur={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? split) - 1));
            else if (e.key === "ArrowRight") setHover((h) => Math.min(last, (h ?? split) + 1));
            else if (e.key === "Escape") setHover(null);
            else return;
            e.preventDefault();
          }}>
          <defs>
            <linearGradient id={`${id}-franja`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={TOTAL} stopOpacity={0.14} />
              <stop offset="1" stopColor={TOTAL} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{formatCompactCurrency(v)}</text>
            </g>
          ))}
          {/* La franja: todo lo que queda bajo la línea del total. */}
          {buckets.length > 0 && <path d={`M${PAD.left},${y(0)} L${edge.join(" L")} L${W - PAD.right},${y(0)} Z`} fill={`url(#${id}-franja)`} />}
          {hover !== null && <rect x={x(hover) - band / 2} y={PAD.top} width={band} height={innerH} fill="var(--text)" fillOpacity={0.05} rx={8} />}
          {buckets.map((b, i) => {
            let base = 0;
            return (
              <g key={b.key}>
                {REAL_LAYERS.map((l) => {
                  const v = b[l.key];
                  if (v <= 0) return null;
                  const top = y(base + v), height = Math.max(2, y(base) - top - (base > 0 ? 2 : 0));
                  base += v;
                  return <rect key={l.key} x={x(i) - barW / 2} y={top} width={barW} height={height} rx={Math.min(5, barW / 3, height / 2)} fill={l.color} />;
                })}
                <text x={x(i)} y={H - 24} fontSize={11} textAnchor="middle" fill={i === todayIndex ? "var(--text)" : "var(--muted)"} fontWeight={i === todayIndex ? 600 : 400}>{axisLabel(b)}</text>
                {i === todayIndex && <text x={x(i)} y={H - 8} fontSize={10} textAnchor="middle" fill="var(--muted)">{t("Hoy")}</text>}
              </g>
            );
          })}
          {shownQuota ? (
            <g>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(shownQuota)} y2={y(shownQuota)} stroke="var(--text)" strokeOpacity={0.6} strokeWidth={1.25} strokeDasharray="5 4" />
              <text x={PAD.left + 6} y={y(shownQuota) - 6} fontSize={11} fill="var(--muted)">{t("Meta")} {formatCompactCurrency(shownQuota)}</text>
            </g>
          ) : null}
          {buckets.length > 1 && (
            <g>
              {split > 0 && <polyline fill="none" stroke={TOTAL} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" points={buckets.slice(0, split + 1).map((_, i) => point(i)).join(" ")} />}
              {split < last && <polyline fill="none" stroke={TOTAL} strokeWidth={2.5} strokeDasharray="1 7" strokeLinejoin="round" strokeLinecap="round" points={buckets.slice(split).map((_, k) => point(split + k)).join(" ")} />}
            </g>
          )}
          {buckets.map((b, i) => (
            <g key={b.key}>
              <circle cx={x(i)} cy={y(total(b))} r={hover === i ? 5.5 : 4.5} fill={TOTAL} stroke="var(--surface)" strokeWidth={2} />
              {((showValues && total(b) > 0) || hover === i) && (
                <text x={x(i)} y={y(total(b)) - 11} fontSize={11.5} fontWeight={600} textAnchor="middle" fill="var(--text)" stroke="var(--surface)" strokeWidth={3} strokeOpacity={0.7} paintOrder="stroke">{formatCompactCurrency(total(b))}</text>
              )}
            </g>
          ))}
          {buckets.map((b, i) => (
            <rect key={b.key} x={x(i) - band / 2} y={PAD.top} width={band} height={innerH + 20} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
          ))}
        </svg>
        {hover !== null && buckets[hover] && (
          <div role="status" className="pointer-events-none absolute top-2 rounded-[10px] border border-line bg-surface px-3 py-2 text-xs shadow-sm"
            style={{ left: `clamp(0px, calc(${(x(hover) / W) * 100}% - 8rem), calc(100% - 16rem))`, width: "16rem" }}>
            <p className="mb-1 font-semibold text-ink">{buckets[hover].label}{when(buckets[hover])}</p>
            {REAL_LAYERS.map((l) => (
              <p key={l.key} className="flex items-center justify-between gap-2 text-ink-2">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: l.color }} />{t(l.label)}</span>
                <span className="num whitespace-nowrap font-medium text-ink">{formatCompactCurrency(buckets[hover][l.key])}</span>
              </p>
            ))}
            <p className="mt-1 flex justify-between gap-2 border-t border-line pt-1 font-semibold text-ink">
              <span className="flex items-center gap-1.5"><span className="h-[3px] w-3 rounded-full" style={{ background: TOTAL }} />{totalLabel}</span>
              <span className="num">{formatCompactCurrency(total(buckets[hover]))}</span>
            </p>
          </div>
        )}
      </div>
      <details className="group/tabla mt-3 text-sm">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-semibold text-muted [&::-webkit-details-marker]:hidden">
          <ChevronRight size={14} aria-hidden="true" className="transition-transform group-open/tabla:rotate-90" />
          {t("Ver datos en tabla")}
        </summary>
        <div className="overflow-x-auto">
          <table className="table mt-2">
            <thead>
              <tr>
                <th>{weeks ? t("Semana") : t("Mes")}</th>
                {REAL_LAYERS.map((l) => <th key={l.key} className="text-right">{t(l.label)}</th>)}
                <th className="text-right">{totalLabel}</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((b) => (
                <tr key={b.key}>
                  <td className="whitespace-nowrap">{b.label}{when(b)}</td>
                  {REAL_LAYERS.map((l) => <td key={l.key} className="num text-right">{formatCurrency(b[l.key])}</td>)}
                  <td className="num text-right font-medium">{formatCurrency(total(b))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
