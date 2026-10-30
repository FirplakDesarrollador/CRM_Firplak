"use client";

import { useState } from "react";
import { formatCompactCurrency, formatDate } from "@/lib/format";
import { useLocale, useT } from "@/lib/i18n/client";

export type TrendPoint = { date: string; closed: number; forecast: number; potential: number; quota: number | null; live?: boolean };

const SERIES = [
  { key: "potential", label: "Potencial (con mejor caso)", color: "var(--sage-500)" },
  { key: "forecast", label: "Pronóstico", color: "var(--navy-700)" },
  { key: "closed", label: "Cerrado", color: "var(--success)" },
] as const;

const W = 720;
const H = 240;
const PAD = { top: 16, right: 16, bottom: 28, left: 64 };

/** Tendencia del pronóstico por instantánea: tres líneas y la meta como referencia punteada. */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const t = useT();
  const locale = useLocale();
  const [hover, setHover] = useState<number | null>(null);
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
  const step = Math.max(1, Math.ceil(points.length / 6));

  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-3 text-xs text-ink-2" aria-label={t("Leyenda")}>
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: s.color }} />{t(s.label)}</li>
        ))}
        {quota > 0 && <li className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-ink" />{t("Meta")}</li>}
      </ul>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={t("Tendencia del pronóstico")}
          onMouseLeave={() => setHover(null)}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{formatCompactCurrency(v)}</text>
            </g>
          ))}
          {points.map((p, i) => (i % step === 0 || i === points.length - 1) && (
            <text key={p.date} x={x(i)} y={H - 8} fontSize={11} fill="var(--muted)"
              textAnchor={points.length > 1 && i === 0 ? "start" : points.length > 1 && i === points.length - 1 ? "end" : "middle"}>{label(p)}</text>
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
            <rect key={p.date} x={x(i) - innerW / Math.max(2, points.length * 2)} y={PAD.top} width={innerW / Math.max(1, points.length)}
              height={innerH} fill="transparent" onMouseEnter={() => setHover(i)} />
          ))}
        </svg>
        {hover !== null && (
          <div className="pointer-events-none absolute top-2 rounded-[10px] border border-line bg-surface px-3 py-2 text-xs shadow-sm"
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
    </div>
  );
}
