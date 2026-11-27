"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { formatCompactCurrency, formatCurrency, formatDate } from "@/lib/format";
import { useLocale, useT } from "@/lib/i18n/client";
import { REAL_LAYERS, type RealDay } from "./real-layers";

const PAD = { top: 16, right: 16, bottom: 28, left: 64 };

/**
 * Cómo se va llenando el periodo: una sola curva que sube día a día y cambia de color según de qué está hecha.
 * Hasta hoy es facturación real (verde); de hoy en adelante se le suman, en la fecha en que se facturarían, los
 * pedidos y entregas abiertos (azul) y encima las oportunidades (naranja). La línea punteada es la meta.
 */
export function RealForecastChart({ days, today, quota }: { days: RealDay[]; today: string; quota: number | null }) {
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
  useEffect(() => {
    if (hover === null) return;
    const close = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setHover(null); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [hover]);

  const H = W < 560 ? 220 : 300;
  const last = days.length - 1;
  const total = (d: RealDay) => d.invoiced + d.backlog + d.opportunities;
  const raw = Math.max(1, quota ?? 0, ...days.map(total)) / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const stepValue = ([1, 2, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow;
  const max = stepValue * 4;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (last <= 0 ? innerW / 2 : (i / last) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const ticks = [0, 1, 2, 3, 4].map((k) => k * stepValue);
  // «Hoy» dentro del periodo: de ahí en adelante la curva es proyección.
  const todayIndex = days.findIndex((d) => d.date >= today);
  const split = todayIndex < 0 ? last : todayIndex;
  const top = (d: RealDay, upTo: number) => REAL_LAYERS.slice(0, upTo + 1).reduce((s, l) => s + d[l.key], 0);
  // Área de cada capa entre su borde de arriba y el de la capa de abajo.
  const area = (layer: number, from: number, to: number) => {
    const upper = days.slice(from, to + 1).map((d, k) => `${x(from + k)},${y(top(d, layer))}`);
    const lower = days.slice(from, to + 1).map((d, k) => `${x(from + k)},${y(layer === 0 ? 0 : top(d, layer - 1))}`).reverse();
    return `M${upper.join(" L")} L${lower.join(" L")} Z`;
  };
  const line = (layer: number, from: number, to: number) => days.slice(from, to + 1).map((d, k) => `${x(from + k)},${y(top(d, layer))}`).join(" ");
  // Fechas del eje: primera, hoy y última, más las intermedias que quepan.
  const every = Math.max(1, Math.ceil(days.length / Math.max(2, Math.floor(innerW / 90))));
  const showDate = (i: number) => i === 0 || i === last || (i % every === 0 && last - i >= every / 2 && i >= every / 2);
  const shortDate = (iso: string) => formatDate(iso, locale).replace(/,? \d{4}$/, "");
  const band = last > 0 ? innerW / last : innerW;
  const summary = days.length ? `${t("Facturado")} ${formatCompactCurrency(days[last].invoiced)}, ${t("Pedidos y entregas abiertos")} ${formatCompactCurrency(days[last].backlog)}, ${t("Oportunidades")} ${formatCompactCurrency(days[last].opportunities)}` : "";
  const moved = days.filter((d, i) => i === 0 || i === last || d.date === today || total(d) !== total(days[i - 1]));

  return (
    <div>
      <div className="relative" ref={box}>
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="group" tabIndex={0}
          aria-label={`${t("Avance del pronóstico día a día")}. ${summary}`}
          onMouseLeave={() => setHover(null)} onFocus={() => setHover((h) => h ?? split)} onBlur={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? split) - 1));
            else if (e.key === "ArrowRight") setHover((h) => Math.min(last, (h ?? split) + 1));
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
          {days.map((d, i) => showDate(i) && (
            <text key={d.date} x={x(i)} y={H - 8} fontSize={11} fill="var(--muted)" textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"}>{shortDate(d.date)}</text>
          ))}
          {days.length > 1 && (
            <>
              {/* Facturado: todo el periodo (después de hoy queda plano). Las otras dos capas, solo de hoy en adelante. */}
              <path d={area(0, 0, last)} fill="var(--success)" fillOpacity={0.3} />
              {split < last && <path d={area(1, split, last)} fill="var(--info)" fillOpacity={0.3} />}
              {split < last && <path d={area(2, split, last)} fill="var(--warning)" fillOpacity={0.3} />}
              <polyline fill="none" stroke="var(--success)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={line(0, 0, split)} />
              {split < last && <polyline fill="none" stroke="var(--success)" strokeWidth={1.5} strokeDasharray="2 4" strokeLinecap="round" points={line(0, split, last)} />}
              {split < last && <polyline fill="none" stroke="var(--info)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={line(1, split, last)} />}
              {split < last && <polyline fill="none" stroke="var(--warning)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={line(2, split, last)} />}
            </>
          )}
          {quota ? <line x1={PAD.left} x2={W - PAD.right} y1={y(quota)} y2={y(quota)} stroke="var(--text)" strokeWidth={1.5} strokeDasharray="5 4" /> : null}
          {todayIndex >= 0 && (
            <g>
              <line x1={x(split)} x2={x(split)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--border-strong)" strokeWidth={1} strokeDasharray="3 3" />
              <text x={x(split)} y={PAD.top - 4} fontSize={11} fill="var(--muted)" textAnchor={split > last * 0.85 ? "end" : split < last * 0.15 ? "start" : "middle"}>{t("Hoy")}</text>
            </g>
          )}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--border-strong)" strokeWidth={1} />}
          {hover !== null && REAL_LAYERS.map((l, k) => (
            <circle key={l.key} cx={x(hover)} cy={y(top(days[hover], k))} r={4} fill={l.color} stroke="var(--surface)" strokeWidth={2} />
          ))}
          {days.map((d, i) => (
            <rect key={d.date} x={x(i) - band / 2} y={PAD.top} width={Math.max(band, 1)} height={innerH} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
          ))}
        </svg>
        {hover !== null && (
          <div role="status" className="pointer-events-none absolute top-2 rounded-[10px] border border-line bg-surface px-3 py-2 text-xs shadow-sm"
            style={{ left: `clamp(0px, calc(${(x(hover) / W) * 100}% - 8rem), calc(100% - 16rem))`, width: "16rem" }}>
            <p className="mb-1 font-semibold text-ink">{formatDate(days[hover].date, locale)}{days[hover].date === today ? ` · ${t("Hoy")}` : days[hover].date > today ? ` · ${t("proyección")}` : ""}</p>
            {REAL_LAYERS.map((l) => (
              <p key={l.key} className="flex items-center justify-between gap-2 text-ink-2">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: l.color }} />{t(l.label)}</span>
                <span className="num whitespace-nowrap font-medium text-ink">{formatCompactCurrency(days[hover][l.key])}</span>
              </p>
            ))}
            <p className="mt-1 flex justify-between gap-2 border-t border-line pt-1 font-semibold text-ink"><span>{t("Acumulado")}</span><span className="num">{formatCompactCurrency(total(days[hover]))}</span></p>
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
                <th>{t("Día")}</th>
                {REAL_LAYERS.map((l) => <th key={l.key} className="text-right">{t(l.label)}</th>)}
                <th className="text-right">{t("Acumulado")}</th>
              </tr>
            </thead>
            <tbody>
              {moved.map((d) => (
                <tr key={d.date}>
                  <td className="whitespace-nowrap">{formatDate(d.date, locale)}{d.date === today ? ` · ${t("Hoy")}` : ""}</td>
                  {REAL_LAYERS.map((l) => <td key={l.key} className="num text-right">{formatCurrency(d[l.key])}</td>)}
                  <td className="num text-right font-medium">{formatCurrency(total(d))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
