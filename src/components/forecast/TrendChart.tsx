"use client";

import { useEffect, useRef, useState } from "react";
import { formatCompactCurrency, formatCurrency, formatDate } from "@/lib/format";
import { useLocale, useT } from "@/lib/i18n/client";

export type TrendPoint = { date: string; closed: number; forecast: number; potential: number; quota: number | null; live?: boolean };

const SERIES = [
  { key: "potential", label: "Potencial (con mejor caso)", color: "var(--chart-best)" },
  { key: "forecast", label: "Pronóstico", color: "var(--chart-commit)" },
  { key: "closed", label: "Cerrado", color: "var(--success)" },
] as const;

const PAD = { top: 16, right: 16, bottom: 28, left: 64 };

/** Tendencia del pronóstico por instantánea: tres líneas y la meta como referencia punteada. Se dibuja al ancho real para que el texto no escale. */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const t = useT();
  const locale = useLocale();
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(720);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    if (!box.current) return;
    const observer = new ResizeObserver(([entry]) => setW(Math.round(entry.contentRect.width)));
    observer.observe(box.current);
    return () => observer.disconnect();
  }, []);

  // En táctil no hay «salir del punto»: tocar fuera cierra el detalle.
  useEffect(() => {
    if (hover === null) return;
    const close = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setHover(null); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [hover]);

  const H = W < 560 ? 200 : 280;
  const quota = points.reduce((m, p) => Math.max(m, p.quota ?? 0), 0);
  // Escala con pasos redondos (1, 2 o 5 × 10ⁿ) para que el eje se lea fácil.
  const raw = Math.max(1, quota, ...points.map((p) => p.potential)) / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const stepValue = ([1, 2, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow;
  const max = stepValue * 4;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const ticks = [0, 1, 2, 3, 4].map((k) => k * stepValue);
  const label = (p: TrendPoint) => (p.live ? t("Hoy (en vivo)") : formatDate(p.date, locale));
  const last = points.length - 1;
  // Eje de fechas: sin año en pantallas angostas y solo las que caben sin encimarse.
  const axisLabel = (p: TrendPoint) => (W >= 480 ? label(p) : p.live ? t("Hoy") : formatDate(p.date, locale).replace(/,? \d{4}$/, ""));
  const longest = Math.max(0, ...points.map((p) => axisLabel(p).length)) * 6;
  const fits = Math.max(2, Math.floor(innerW / (longest * 1.5 + 8)) + 1);
  const step = Math.max(1, Math.ceil(last / (fits - 1)));
  const showDate = (i: number) => i === last || (i % step === 0 && last - i >= step);
  const band = points.length > 1 ? innerW / last : innerW;

  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-3 text-xs text-ink-2" aria-label={t("Leyenda")}>
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: s.color }} />{t(s.label)}</li>
        ))}
        {quota > 0 && <li className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-ink" />{t("Meta")}</li>}
      </ul>
      <div className="relative" ref={box}>
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="group" aria-label={t("Tendencia del pronóstico")} tabIndex={0}
          onMouseLeave={() => setHover(null)}
          onFocus={() => setHover((h) => h ?? last)}
          onBlur={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? last) - 1));
            else if (e.key === "ArrowRight") setHover((h) => Math.min(last, (h ?? 0) + 1));
            else if (e.key === "Escape") setHover(null);
            else return;
            e.preventDefault();
          }}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{formatCompactCurrency(v)}</text>
            </g>
          ))}
          {points.map((p, i) => showDate(i) && (
            <text key={p.date} x={x(i)} y={H - 8} fontSize={11} fill="var(--muted)"
              textAnchor={points.length > 1 && i === 0 ? "start" : points.length > 1 && i === last ? "end" : "middle"}>{axisLabel(p)}</text>
          ))}
          {quota > 0 && (
            <line x1={PAD.left} x2={W - PAD.right} y1={y(quota)} y2={y(quota)} stroke="var(--text)" strokeWidth={1.5} strokeDasharray="5 4" />
          )}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--border-strong)" strokeWidth={1} />}
          {SERIES.map((s) => (
            <g key={s.key}>
              {points.length > 1 && (
                <polyline fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
                  points={points.map((p, i) => `${x(i)},${y(p[s.key])}`).join(" ")} />
              )}
              {points.map((p, i) => (
                <circle key={p.date} cx={x(i)} cy={y(p[s.key])} r={hover === i ? 5 : 4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
              ))}
            </g>
          ))}
          {points.map((p, i) => (
            <rect key={p.date} x={x(i) - band / 2} y={PAD.top} width={band} height={innerH} fill="transparent"
              onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
          ))}
        </svg>
        {hover !== null && (
          <div role="status" className="pointer-events-none absolute top-2 rounded-[10px] border border-line bg-surface px-3 py-2 text-xs shadow-sm"
            style={{ left: `clamp(0px, calc(${(x(hover) / W) * 100}% - 7.5rem), calc(100% - 15rem))`, width: "15rem" }}>
            <p className="mb-1 font-semibold text-ink">{label(points[hover])}</p>
            {SERIES.map((s) => (
              <p key={s.key} className="flex items-center justify-between gap-2 text-ink-2">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{t(s.label)}</span>
                <span className="num whitespace-nowrap font-medium text-ink">{formatCompactCurrency(points[hover][s.key])}</span>
              </p>
            ))}
            {points[hover].quota ? (
              <p className="flex justify-between gap-2 text-ink-2"><span>{t("Meta")}</span><span className="num">{formatCompactCurrency(points[hover].quota)}</span></p>
            ) : null}
          </div>
        )}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs font-semibold text-muted">{t("Ver datos en tabla")}</summary>
        <div className="overflow-x-auto">
          <table className="table mt-2">
            <thead>
              <tr>
                <th>{t("Fecha")}</th>
                {SERIES.map((s) => <th key={s.key} className="text-right">{t(s.label)}</th>)}
                <th className="text-right">{t("Meta")}</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.date}>
                  <td className="whitespace-nowrap">{label(p)}</td>
                  {SERIES.map((s) => <td key={s.key} className="num text-right">{formatCurrency(p[s.key])}</td>)}
                  <td className="num text-right">{p.quota ? formatCurrency(p.quota) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
