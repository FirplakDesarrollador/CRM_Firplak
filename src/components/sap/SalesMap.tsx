"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { ChevronLeft } from "lucide-react";
import { Tr } from "@/components/ui/Tr";
import { useT } from "@/lib/i18n/client";
import { formatCompactCurrency, formatCurrency, formatMillions } from "@/lib/format";
import { loadSalesCountry, type SalesCountryCustomer, type SalesFilters, type SalesSlice } from "@/lib/sap/sales";
import { COUNTRY_ALIASES, COUNTRY_POINTS, GRATICULE, HOME_PATH, LAND_PATH, MAP_H, MAP_W } from "./americas-map";
import { groupName } from "./SapSalesExplorer";

// Panel tipo centro de control, siempre oscuro (en tema claro y oscuro): navy de la app con líneas de luz azul y el
// origen en oliva. Los colores son propios del panel, no del tema.
const C = { line: "#6fb4e0", glow: "#7fd0ff", text: "#f2f9ff", soft: "#9cbbd0", dim: "#7f97aa", home: "#c5d59a", up: "#9fe0b0", down: "#ffb4a8" };
type Box = [number, number, number, number];
const FULL: Box = [0, 0, MAP_W, MAP_H];
// Hacia dónde sale la etiqueta de cada país en la vista general, para que no se monten en Centroamérica y el Caribe.
const LABEL_OFFSET: Record<string, [number, number]> = {
  "estados unidos": [40, -34], canada: [44, -22], mexico: [-96, 22], guatemala: [-104, -26], "el salvador": [-120, 6], honduras: [70, -64],
  "costa rica": [-116, 58], panama: [-128, 44], ecuador: [-112, 40], jamaica: [60, -58], "puerto rico": [84, -30], "republica dominicana": [96, -62],
  venezuela: [92, 22], guyana: [84, 2], suriname: [88, 26], "trinidad y tobago": [96, -8], aruba: [100, -44], peru: [-96, 14], bolivia: [70, 12],
  brasil: [70, 0], chile: [-76, 4], argentina: [70, 14], cuba: [70, -40],
};

const NARROW_OFFSET: Record<string, [number, number]> = { "estados unidos": [22, -20], "el salvador": [-10, -12], panama: [-12, 18], mexico: [-10, 16], ecuador: [-12, 16] };

const norm = (name: string) => {
  const key = name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\./g, "").toLowerCase().trim().replace(/\s+/g, " ");
  return COUNTRY_ALIASES[key] ?? key;
};
const pct = (part: number, whole: number) => {
  if (!(whole > 0) || !(part > 0)) return "";
  const p = (part / whole) * 100;
  return `${p >= 10 ? p.toFixed(1).replace(".", ",").replace(",0", "") : p.toFixed(1).replace(".", ",")} %`;
};
const growth = (amount: number, prev: number | null) => {
  if (prev === null || prev <= 0) return null;
  const g = ((amount - prev) / prev) * 100;
  return { text: `${g > 0 ? "+" : g < 0 ? "−" : ""}${Math.abs(g) >= 10 ? Math.round(Math.abs(g)) : Math.abs(g).toFixed(1).replace(".", ",")} %`, up: g >= 0 };
};

/**
 * Ventas por país del mercado internacional sobre el mapa de América: un punto por país donde se vende, con su
 * participación. Al elegir un país (en el mapa o en la lista) el mapa se acerca y el panel muestra sus principales clientes.
 */
export function SalesMap({ items, grandTotal, basis, from, to, owner, filters }: {
  items: SalesSlice[]; grandTotal: number; basis: string; from: string; to: string; owner: string | null; filters: SalesFilters;
}) {
  const t = useT();
  const uid = useId().replace(/:/g, "");
  const total = items.reduce((n, i) => n + Math.max(0, Number(i.amount)), 0);
  const max = Math.max(1, ...items.map((i) => Number(i.amount)));
  const customers = items.reduce((n, i) => n + Number(i.customers), 0);
  const points = useMemo(() => items.map((item, rank) => {
    const key = norm(item.key);
    const p = COUNTRY_POINTS[key];
    return { ...item, amount: Number(item.amount), rank, norm: key, x: p?.[0] ?? null, y: p?.[1] ?? null, span: p?.[2] ?? MAP_W };
  }), [items]);
  const home = COUNTRY_POINTS.colombia;

  const [selected, setSelected] = useState<string | null>(null);
  const [rows, setRows] = useState<SalesCountryCustomer[] | "loading">("loading");
  const [, start] = useTransition();
  const [box, setBox] = useState<Box>(FULL);
  const boxRef = useRef<Box>(FULL);
  const frame = useRef(0);
  const [hover, setHover] = useState<string | null>(null);
  // Ancho real del mapa en pantalla: textos y trazos se dibujan en píxeles reales, también en el celular.
  const svgRef = useRef<SVGSVGElement>(null);
  const [pxW, setPxW] = useState(MAP_W);
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setPxW(Math.max(200, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Acercamiento suave hacia el país (o de vuelta a América); sin animación si la persona pidió menos movimiento.
  const flyTo = (target: Box) => {
    cancelAnimationFrame(frame.current);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { boxRef.current = target; setBox(target); return; }
    const origin = boxRef.current;
    let t0: number | null = null;
    const step = (now: number) => {
      t0 ??= now;
      const k = Math.min(1, (now - t0) / 700);
      const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
      const next = origin.map((v, i) => v + (target[i] - v) * e) as Box;
      boxRef.current = next;
      setBox(next);
      if (k < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const pick = (key: string | null) => {
    setSelected(key);
    const p = key ? points.find((c) => c.key === key) : null;
    if (!p || p.x === null || p.y === null) flyTo(FULL);
    else {
      const w = Math.min(MAP_W, Math.max(60, p.span)), h = w * (MAP_H / MAP_W);
      flyTo([Math.max(0, Math.min(MAP_W - w, p.x - w / 2)), Math.max(0, Math.min(MAP_H - h, p.y - h / 2)), w, h]);
    }
    if (!key) return;
    setRows("loading");
    start(async () => {
      const data = await loadSalesCountry(key, from, to, owner, filters).catch(() => []);
      setRows(data);
    });
  };

  // Lo que se dibuja con tamaño fijo en pantalla se divide por el acercamiento.
  const zoom = MAP_W / box[2];
  const u = (n: number) => (n * box[2]) / pxW;
  const narrow = pxW < 480;
  // La trama de puntos se afina al acercar, sin llegar a verse como discos.
  const grain = 1 / zoom ** 0.78;
  const zoomed = zoom > 1.25;
  const current = selected ? points.find((c) => c.key === selected) ?? null : null;
  const onMap = points.filter((c) => c.x !== null);
  const labelled = new Set(onMap.slice(0, narrow ? 3 : 7).map((c) => c.key));
  // En pantallas angostas las etiquetas crecen (en unidades del mapa) para leerse, y sus guías con ellas.
  const lf = Math.max(1, MAP_W / pxW / 1.15);
  const big = formatMillions(total);

  return (
    <div className="mapa-hud relative grid gap-5 overflow-hidden rounded-2xl p-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]"
      style={{ background: "radial-gradient(120% 90% at 30% 20%, #12304a 0%, #0a1826 55%, #060f18 100%)", color: "#d5e3ed" }}>
      <svg ref={svgRef} viewBox={box.join(" ")} className="block max-h-[78vh] w-full" role="group" aria-label={t("Mapa de ventas por país")}>
        <defs>
          <pattern id={`${uid}d`} width={6.4 * grain} height={6.4 * grain} patternUnits="userSpaceOnUse"><circle cx={3.2 * grain} cy={3.2 * grain} r={0.95 * grain} fill={C.line} fillOpacity="0.38" /></pattern>
          <pattern id={`${uid}h`} width={6.4 * grain} height={6.4 * grain} patternUnits="userSpaceOnUse"><circle cx={3.2 * grain} cy={3.2 * grain} r={0.95 * grain} fill={C.home} fillOpacity="0.6" /></pattern>
        </defs>
        <g aria-hidden="true">
          {GRATICULE.x.map(([deg, x]) => <line key={`x${deg}`} x1={x} y1={0} x2={x} y2={MAP_H} stroke={C.line} strokeOpacity="0.09" strokeWidth={u(0.6)} />)}
          {GRATICULE.y.map(([deg, y]) => <line key={`y${deg}`} x1={0} y1={y} x2={MAP_W} y2={y} stroke={C.line} strokeOpacity="0.09" strokeWidth={u(0.6)} />)}
          {!zoomed && GRATICULE.y.map(([deg, y]) => (
            <text key={`l${deg}`} x={4} y={y - 3} fill={C.line} fillOpacity="0.45" fontSize={7.5 * lf} letterSpacing="0.08em">{Math.abs(deg)}°{deg > 0 ? "N" : deg < 0 ? "S" : ""}</text>
          ))}
          <path d={LAND_PATH} fill={`url(#${uid}d)`} stroke={C.line} strokeOpacity="0.34" strokeWidth={u(0.55)} strokeLinejoin="round" />
          <path d={HOME_PATH} fill={`url(#${uid}h)`} stroke={C.home} strokeOpacity="0.5" strokeWidth={u(0.55)} strokeLinejoin="round" />
          {/* Del origen a los principales destinos. */}
          {onMap.slice(0, 7).map((c) => (
            <path key={c.key} d={`M${home[0]},${home[1]} Q${(c.x! + home[0]) / 2},${(c.y! + home[1]) / 2 - Math.abs(c.x! - home[0]) * 0.22 - 12} ${c.x},${c.y}`}
              fill="none" stroke={C.home} strokeOpacity={zoomed ? 0.16 : 0.36} strokeWidth={u(0.7)} strokeDasharray={`${u(2)} ${u(3)}`} />
          ))}
          <circle cx={home[0]} cy={home[1]} r={u(3)} fill={C.home} style={{ filter: `drop-shadow(0 0 ${u(5)}px #a7b77a)` }} />
          {!zoomed && <text x={home[0] + 8} y={home[1] + 16} fill={C.soft} fontSize={7.5 * lf} letterSpacing="0.14em">{t("ORIGEN")} · COLOMBIA</text>}
        </g>
        {onMap.map((c) => {
          const r = u(2.6 + Math.sqrt(c.amount / Math.max(1, total)) * 9);
          const on = selected === c.key;
          const showLabel = zoomed ? true : labelled.has(c.key) || hover === c.key;
          // En el celular las guías son cortas y hacia donde hay espacio: las largas se salen del mapa.
          const [dx, dy] = (narrow ? NARROW_OFFSET[c.norm] ?? [12, -12] : LABEL_OFFSET[c.norm] ?? [44, -26]).map((v) => v * lf);
          const hook = (narrow ? 5 : 14) * lf, gap = (narrow ? 9 : 20) * lf;
          const right = dx > 0;
          return (
            // El botón es solo el punto; la etiqueta va aparte para no agrandar su zona de clic.
            <g key={c.key}>
            <g role="button" tabIndex={0} aria-label={`${c.key}, ${pct(c.amount, total)}`} aria-pressed={on} className="cursor-pointer outline-none"
              onClick={() => pick(on ? null : c.key)} onMouseEnter={() => setHover(c.key)} onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(c.key)} onBlur={() => setHover(null)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(on ? null : c.key); } }}>
              <circle cx={c.x!} cy={c.y!} r={r * 2.1} fill={C.glow} fillOpacity="0.16" className="mapa-pulso" style={{ "--i": c.rank } as React.CSSProperties} />
              <circle cx={c.x!} cy={c.y!} r={r} fill="none" stroke={C.glow} strokeOpacity={on || hover === c.key ? 1 : 0.75} strokeWidth={u(0.9)} />
              <circle cx={c.x!} cy={c.y!} r={u(2.2)} fill="#eaf7ff" style={{ filter: `drop-shadow(0 0 ${u(4)}px ${C.glow})` }} />
              {on && <circle cx={c.x!} cy={c.y!} r={r + u(7)} fill="none" stroke="#eaf7ff" strokeWidth={u(0.7)} strokeDasharray={`${u(2)} ${u(2.6)}`} />}
              {/* Área de toque amplia, para el dedo. */}
              <circle cx={c.x!} cy={c.y!} r={Math.max(r * 1.6, u(11))} fill="transparent" />
            </g>
              {showLabel && !zoomed && (
                <g aria-hidden="true" pointerEvents="none">
                  <path d={`M${c.x},${c.y} L${c.x! + dx},${c.y! + dy} h${right ? hook : -hook}`} fill="none" stroke={C.glow} strokeOpacity="0.6" strokeWidth={u(0.8)} />
                  <text x={c.x! + dx + (right ? gap : -gap)} y={c.y! + dy - 2 * lf} textAnchor={right ? "start" : "end"} fill={C.text} fontSize={13 * lf} fontWeight="600">{pct(c.amount, total)}</text>
                  <text x={c.x! + dx + (right ? gap : -gap)} y={c.y! + dy + 11 * lf} textAnchor={right ? "start" : "end"} fill={C.soft} fontSize={7.5 * lf} letterSpacing="0.14em">{c.key.toUpperCase()}</text>
                </g>
              )}
              {zoomed && (
                <text aria-hidden="true" pointerEvents="none" x={c.x! + r + u(5)} y={c.y! + u(3)} fill={on ? C.text : C.soft} fontSize={u(narrow ? 10 : 9.5)} fontWeight={on ? 600 : 400} letterSpacing="0.1em">
                  {c.key.toUpperCase()} · {pct(c.amount, total)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="min-w-0 px-1 pt-1">
        {!current ? (
          <>
            <p className="text-[10px] uppercase tracking-[0.18em]" style={{ color: C.line }}><Tr>Mercado internacional</Tr></p>
            <p className="num mt-1 text-4xl font-light" style={{ color: C.text }}>{big.value}<span className="ml-2 text-sm font-normal" style={{ color: C.soft }}>{big.unit}</span></p>
            <dl className="my-4 flex flex-wrap gap-x-7 gap-y-2 border-b pb-4" style={{ borderColor: "rgba(111,180,224,.18)" }}>
              {[[String(items.length), t(items.length === 1 ? "País" : "Países")], [String(customers), t(customers === 1 ? "Cliente" : "Clientes")], [pct(total, grandTotal) || "—", t("De la venta del periodo")]].map(([v, l]) => (
                <div key={l}><dd className="num text-xl" style={{ color: C.text }}>{v}</dd><dt className="text-[10px] uppercase tracking-[0.14em]" style={{ color: C.soft }}>{l}</dt></div>
              ))}
            </dl>
            <ul aria-label={t("Ventas facturadas por país")} className="max-h-[26rem] overflow-y-auto pr-1">
              {points.map((c) => (
                <li key={c.key}>
                  <button type="button" onClick={() => pick(c.key)} onMouseEnter={() => setHover(c.key)} onMouseLeave={() => setHover(null)}
                    className="grid w-full grid-cols-[1.4rem_minmax(0,7.5rem)_minmax(1rem,1fr)_auto_3.4rem] items-center gap-2.5 rounded-md border-b px-1 py-1.5 text-left text-[13px] hover:bg-white/5 focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#7fd0ff]"
                    style={{ borderColor: "rgba(111,180,224,.08)" }} title={formatCurrency(c.amount)}>
                    <span className="num text-[10px] opacity-70" style={{ color: C.line }}>{String(c.rank + 1).padStart(2, "0")}</span>
                    <span className="truncate" style={{ color: "#d5e3ed" }}>{c.key}</span>
                    <span className="h-[3px] rounded-full" style={{ background: "rgba(111,180,224,.12)" }} aria-hidden>
                      <span className="chart-crece-x block h-full rounded-full" style={{ width: `${Math.max(2, (Math.max(0, c.amount) / max) * 100)}%`, background: "linear-gradient(90deg,#3f86b4,#7fd0ff)", "--i": c.rank } as React.CSSProperties} />
                    </span>
                    <span className="num whitespace-nowrap text-right" style={{ color: "#d5e3ed" }}>{formatCompactCurrency(c.amount)}</span>
                    <span className="num whitespace-nowrap text-right font-semibold" style={{ color: C.text }}>{pct(c.amount, total)}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] leading-relaxed" style={{ color: C.dim }}>
              <Tr>Cada punto es un país donde vendemos; su tamaño y el porcentaje son su participación en la venta internacional. Elige un país para acercarte y ver sus principales clientes.</Tr>
            </p>
          </>
        ) : (
          <>
            <button type="button" onClick={() => pick(null)} className="inline-flex items-center gap-1 rounded text-xs tracking-wide hover:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#7fd0ff]" style={{ color: C.glow }}>
              <ChevronLeft size={14} aria-hidden /> <Tr>Volver a América</Tr>
            </button>
            <div className="mt-3 rounded-xl border p-4" style={{ background: "rgba(111,180,224,.07)", borderColor: "rgba(111,180,224,.22)" }} aria-live="polite">
              <p className="text-[10px] uppercase tracking-[0.18em]" style={{ color: C.line }}><Tr>País seleccionado</Tr></p>
              <h4 className="text-2xl" style={{ color: C.text }}>{current.key}</h4>
              <dl className="mt-3 flex flex-wrap gap-x-7 gap-y-2">
                <div><dd className="num text-xl" style={{ color: C.text }} title={formatCurrency(current.amount)}>{formatCompactCurrency(current.amount)}</dd><dt className="text-[10px] uppercase tracking-[0.14em]" style={{ color: C.soft }}><Tr>Ventas del periodo</Tr></dt></div>
                <div><dd className="num text-xl" style={{ color: C.text }}>{pct(current.amount, total)}</dd><dt className="text-[10px] uppercase tracking-[0.14em]" style={{ color: C.soft }}><Tr>Participación</Tr></dt></div>
                <div><dd className="num text-xl" style={{ color: C.text }}>{current.customers}</dd><dt className="text-[10px] uppercase tracking-[0.14em]" style={{ color: C.soft }}>{t(current.customers === 1 ? "Cliente" : "Clientes")}</dt></div>
                {(() => { const g = growth(current.amount, current.prev === null ? null : Number(current.prev)); return g ? (
                  <div title={basis}><dd className="num text-xl" style={{ color: g.up ? C.up : C.down }}>{g.text}</dd><dt className="text-[10px] uppercase tracking-[0.14em]" style={{ color: C.soft }}><Tr>Crecimiento</Tr></dt></div>
                ) : null; })()}
              </dl>
              {current.x === null && <p className="mt-2 text-[11px]" style={{ color: C.dim }}><Tr>Este país está fuera del mapa de América.</Tr></p>}
            </div>
            <p className="mt-5 text-[10px] uppercase tracking-[0.18em]" style={{ color: C.line }}><Tr>Principales clientes</Tr></p>
            {rows === "loading" ? <p className="py-3 text-xs" style={{ color: C.dim }}><Tr>Cargando…</Tr></p> : (
              <ul aria-label={`${t("Principales clientes")} · ${current.key}`}>
                {rows.length === 0 && <li className="py-3 text-xs" style={{ color: C.dim }}><Tr>Sin ventas en el periodo.</Tr></li>}
                {rows.map((r, i) => (
                  <li key={r.key} className="grid grid-cols-[1.4rem_minmax(0,1fr)_auto_3.4rem] items-baseline gap-2.5 border-b px-1 py-2 text-[13px]" style={{ borderColor: "rgba(111,180,224,.08)" }}>
                    <span className="num text-[10px] opacity-70" style={{ color: C.line }}>{String(i + 1).padStart(2, "0")}</span>
                    <span className="truncate" style={{ color: "#d5e3ed" }}>{groupName(r.names ?? []) || r.key}{r.branches > 1 && <span className="ml-2 text-[11px]" style={{ color: C.dim }}>{r.branches} {t("sucursales")}</span>}</span>
                    <span className="num whitespace-nowrap text-right" style={{ color: "#d5e3ed" }} title={formatCurrency(r.amount)}>{formatCompactCurrency(r.amount)}</span>
                    <span className="num whitespace-nowrap text-right font-semibold" style={{ color: C.text }}>{pct(r.amount, current.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
