"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info, X } from "lucide-react";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import { AddToCart } from "./Cart";

type Summary = {
  name: string; code: string | null; unit: string | null; isKit: boolean;
  available: number | null; availableAt: string | null; ownChannels: boolean;
  prices: { list: string; channel: string | null; market: string; currency: string; price: number | null }[];
};

const HOLD_MS = 450;
const MOVE_PX = 10;

/**
 * Vistazo de un producto en la lista: al dejar presionada su fila (o con el botón de información) aparece una
 * tarjeta pequeña con el disponible real de PT-01 y el precio en las listas de los canales del asesor.
 */
export function ProductPeek({ id, name, code = null, children }: { id: string; name: string; code?: string | null; children: React.ReactNode }) {
  const t = useT();
  const anchor = useRef<HTMLSpanElement>(null);
  const card = useRef<HTMLDivElement>(null);
  // Dónde se presionó y la fila del producto: la tarjeta nace pegada a esa fila, con su pico en el punto presionado.
  const [open, setOpen] = useState<{ x: number; top: number; bottom: number } | null>(null);
  const [data, setData] = useState<Summary | "error" | null>(null);

  const show = useCallback((x: number) => {
    const row = anchor.current?.closest("tr")?.getBoundingClientRect();
    if (!row) return;
    setOpen({ x, top: row.top, bottom: row.bottom });
    setData(null);
    fetch(`/api/productos/${id}/resumen`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Summary) => setData(d))
      .catch(() => setData("error"));
  }, [id]);

  // Dejar presionada la fila. El toque que la abrió no debe, además, entrar al producto.
  useEffect(() => {
    const row = anchor.current?.closest("tr");
    if (!row) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let start = { x: 0, y: 0 };
    let held = false;
    const cancel = () => { clearTimeout(timer); timer = undefined; };
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
      held = false;
      start = { x: e.clientX, y: e.clientY };
      cancel();
      timer = setTimeout(() => { held = true; show(start.x); }, HOLD_MS);
    };
    const move = (e: PointerEvent) => {
      if (timer && Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_PX) cancel();
    };
    const click = (e: MouseEvent) => {
      if (!held) return;
      held = false;
      e.preventDefault();
      e.stopPropagation();
    };
    // En el teléfono, dejar presionado un enlace abre el menú del sistema: aquí lo reemplaza el vistazo.
    const menu = (e: Event) => { if (held || timer) e.preventDefault(); };
    row.addEventListener("pointerdown", down);
    row.addEventListener("pointermove", move);
    row.addEventListener("pointerup", cancel);
    row.addEventListener("pointercancel", cancel);
    row.addEventListener("pointerleave", cancel);
    row.addEventListener("click", click, true);
    row.addEventListener("contextmenu", menu);
    return () => {
      cancel();
      row.removeEventListener("pointerdown", down);
      row.removeEventListener("pointermove", move);
      row.removeEventListener("pointerup", cancel);
      row.removeEventListener("pointercancel", cancel);
      row.removeEventListener("pointerleave", cancel);
      row.removeEventListener("click", click, true);
      row.removeEventListener("contextmenu", menu);
    };
  }, [show]);

  // Mientras está abierta, la fila del producto queda resaltada: se ve de cuál es la tarjeta.
  useEffect(() => {
    const row = anchor.current?.closest("tr");
    if (!open || !row) return;
    row.setAttribute("data-peek", "");
    return () => row.removeAttribute("data-peek");
  }, [open]);

  // Se cierra con Escape, al tocar fuera o al desplazar la lista.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(null);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const outside = (e: PointerEvent) => { if (!card.current?.contains(e.target as Node)) close(); };
    // El mismo toque que la abre termina con un «pointerup»: se escucha el siguiente «pointerdown».
    const id = setTimeout(() => document.addEventListener("pointerdown", outside), 0);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", close, true);
    return () => {
      clearTimeout(id);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  const summary = data && data !== "error" ? data : null;
  const width = 304;
  const left = open ? Math.max(8, Math.min(open.x - 28, window.innerWidth - width - 8)) : 0;
  // Debajo de la fila; si la fila está en la parte baja de la pantalla, encima.
  const below = open ? open.bottom < window.innerHeight * 0.6 : true;
  // El pico apunta al punto presionado (dentro de la tarjeta).
  const tip = open ? Math.max(16, Math.min(open.x - left, width - 16)) : 0;

  return (
    <span ref={anchor} className="group/peek inline-flex max-w-full items-center gap-1.5 [-webkit-touch-callout:none]">
      {children}
      <button type="button" className="shrink-0 rounded-full p-0.5 text-muted opacity-0 transition hover:text-ink focus-visible:opacity-100 group-hover/peek:opacity-100 [@media(pointer:coarse)]:hidden"
        aria-label={`${t("Ver disponible y precios de")} ${name}`} aria-haspopup="dialog"
        onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); show(r.left + r.width / 2); }}>
        <Info size={14} />
      </button>
      <span className="opacity-0 transition focus-within:opacity-100 group-hover/peek:opacity-100 [@media(pointer:coarse)]:hidden">
        <AddToCart id={id} name={name} code={code} compact />
      </span>
      {/* Va en el <body>: la tarjeta de la lista tiene desenfoque de fondo, y dentro de ella «fixed» se mide contra la
          tarjeta y no contra la pantalla (la tarjeta del vistazo salía lejos del producto). */}
      {open && createPortal(
        <div ref={card} role="dialog" aria-label={`${t("Disponible y precios de")} ${name}`}
          className="peek-card fixed z-50 rounded-2xl border border-line bg-bg p-3 text-left text-sm font-normal text-ink shadow-[var(--shadow-lg)]"
          style={{ left, width, transformOrigin: `${tip}px ${below ? "top" : "bottom"}`, ...(below ? { top: open.bottom + 8 } : { bottom: window.innerHeight - open.top + 8 }) }}>
          <span aria-hidden className={`absolute h-3 w-3 rotate-45 border-line bg-bg ${below ? "-top-1.5 border-l border-t" : "-bottom-1.5 border-b border-r"}`} style={{ left: tip - 6 }} />
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="break-words font-medium leading-snug">{name}</p>
              {summary?.code && <p className="text-xs text-muted">{summary.code}</p>}
            </div>
            <button type="button" className="shrink-0 rounded-full p-1 text-muted hover:text-ink" aria-label={t("Cerrar")} onClick={() => setOpen(null)}><X size={14} /></button>
          </div>
          {data === null && <div className="skeleton mt-3 h-20 w-full" aria-busy="true" aria-label={t("Cargando")} />}
          {data === "error" && <p className="mt-3 text-danger">{t("No se pudo consultar el producto.")}</p>}
          {summary && (
            <>
              <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-line pt-2">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">{summary.isKit ? t("Kits disponibles") : t("Disponible PT-01")}</p>
                <p className={`num text-lg font-medium ${summary.available === null ? "text-muted" : summary.available > 0 ? "text-success" : "text-danger"}`}>
                  {summary.available === null ? t("Sin dato de SAP") : formatNumber(summary.available)}
                </p>
              </div>
              {summary.availableAt && <p className="text-right text-xs text-muted">{t("SAP al")} {formatDateTime(summary.availableAt)}</p>}
              <div className="mt-2 border-t border-line pt-2">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">{summary.ownChannels ? t("Precio en tus canales") : t("Precio por lista")}</p>
                {summary.prices.length === 0 && <p className="mt-1 text-muted">{t("No hay listas de precios activas para tus canales.")}</p>}
                <ul className="mt-1 space-y-0.5">
                  {summary.prices.map((p) => (
                    <li key={p.list} className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate">{p.list}</span>
                      <span className={`num shrink-0 ${p.price === null ? "text-muted" : "font-medium"}`}>
                        {p.price === null ? t("sin precio") : `${formatCurrency(p.price, p.currency)}${p.currency === "COP" ? "" : ` ${p.currency}`}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-3 flex justify-end border-t border-line pt-2">
                <AddToCart id={id} name={name} code={summary.code} className="btn btn-sm" />
              </div>
            </>
          )}
        </div>,
        document.body,
      )}
    </span>
  );
}
