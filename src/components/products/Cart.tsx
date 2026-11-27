"use client";

import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { Check, Minus, Plus, ShoppingCart, Trash2, X } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { useT } from "@/lib/i18n/client";

// Selección de productos para cotizar («carrito»): el asesor va marcando productos mientras navega el catálogo y al
// final los convierte en una cotización. Vive en el dispositivo (no reserva inventario ni fija precios: el precio
// sale de la lista del cliente al crear la cotización).
export type CartItem = { id: string; name: string; code: string | null; qty: number };
type Cart = { owner: string | null; items: CartItem[] };

const KEY = "firplak:seleccion";
const EVENT = "firplak:seleccion";
const EMPTY: Cart = { owner: null, items: [] };
export const CART_MAX = 100;

let cache: { raw: string | null; value: Cart } = { raw: null, value: EMPTY };
function read(): Cart {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cache.raw) return cache.value;
  let value = EMPTY;
  try {
    const parsed = raw ? (JSON.parse(raw) as Cart) : EMPTY;
    if (Array.isArray(parsed.items)) value = { owner: parsed.owner ?? null, items: parsed.items.filter((i) => i && typeof i.id === "string" && Number(i.qty) > 0) };
  } catch {
    value = EMPTY;
  }
  cache = { raw, value };
  return value;
}
function write(next: Cart) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Sin almacenamiento (modo privado): la selección no se conserva.
  }
  window.dispatchEvent(new Event(EVENT));
}
function subscribe(notify: () => void) {
  window.addEventListener(EVENT, notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener(EVENT, notify);
    window.removeEventListener("storage", notify);
  };
}

export function useCart() {
  const cart = useSyncExternalStore(subscribe, read, () => EMPTY);
  return {
    items: cart.items,
    count: cart.items.length,
    has: (id: string) => cart.items.some((i) => i.id === id),
    add(item: Omit<CartItem, "qty">, qty = 1) {
      const current = read();
      const found = current.items.find((i) => i.id === item.id);
      if (!found && current.items.length >= CART_MAX) return false;
      write({ ...current, items: found ? current.items.map((i) => (i.id === item.id ? { ...i, qty: i.qty + qty } : i)) : [...current.items, { ...item, qty }] });
      return true;
    },
    setQty(id: string, qty: number) {
      const current = read();
      write({ ...current, items: current.items.map((i) => (i.id === id ? { ...i, qty: Math.max(1, Math.round(qty) || 1) } : i)) });
    },
    remove(id: string) {
      const current = read();
      write({ ...current, items: current.items.filter((i) => i.id !== id) });
    },
    clear() {
      write({ ...read(), items: [] });
    },
  };
}

/** Botón «agregar a la selección» de un producto. `compact`: solo el ícono (fila de la lista). */
export function AddToCart({ id, name, code, compact = false, className }: { id: string; name: string; code: string | null; compact?: boolean; className?: string }) {
  const t = useT();
  const cart = useCart();
  const inCart = cart.has(id);
  const label = inCart ? `${t("En la selección: agregar otra unidad de")} ${name}` : `${t("Agregar a la selección")}: ${name}`;
  return (
    <button type="button" aria-label={label} title={compact ? (inCart ? t("En la selección") : t("Agregar a la selección")) : undefined}
      className={className ?? (compact ? "shrink-0 rounded-full p-0.5 text-muted transition hover:text-ink" : "btn")}
      onClick={() => cart.add({ id, name, code })}>
      {inCart ? <Check size={compact ? 14 : 15} className="text-success" /> : <Plus size={compact ? 14 : 15} />}
      {!compact && <span>{inCart ? t("En la selección") : t("Agregar a la selección")}</span>}
    </button>
  );
}

/**
 * Botón flotante «Selección (n)» y su panel: cantidades, quitar, vaciar y «Convertir en cotización». Solo aparece
 * cuando hay productos elegidos. La selección es de quien la armó: con otro usuario en el mismo equipo, empieza vacía.
 */
export function CartButton({ userId }: { userId: string }) {
  const t = useT();
  const cart = useCart();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const current = read();
    if (current.owner !== userId) write({ owner: userId, items: current.owner === null ? current.items : [] });
  }, [userId]);
  if (cart.count === 0) return null;
  const units = cart.items.reduce((n, i) => n + i.qty, 0);

  return (
    <>
      <button type="button" className="btn btn-primary fixed bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] right-4 z-40 shadow-[var(--shadow-lg)] md:bottom-6 md:right-6"
        aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>
        <ShoppingCart size={16} /> {t("Selección")} <span className="badge" data-testid="seleccion-cuenta">{cart.count}</span>
      </button>
      <dialog ref={dialog} aria-label={t("Productos seleccionados")}
        className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-2xl border border-line bg-bg p-0 text-ink shadow-[var(--shadow-lg)] backdrop:bg-black/40">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className="text-base font-medium">{t("Productos seleccionados")}</h2>
            <p className="text-xs text-muted">{formatNumber(cart.count)} {t("productos")} · {formatNumber(units)} {t("unidades")}</p>
          </div>
          <button type="button" className="rounded-full p-1 text-muted hover:text-ink" aria-label={t("Cerrar")} onClick={() => dialog.current?.close()}><X size={16} /></button>
        </div>
        <ul className="max-h-[50dvh] divide-y divide-[var(--border)] overflow-auto">
          {cart.items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{i.name}</p>
                {i.code && <p className="text-xs text-muted">{i.code}</p>}
              </div>
              <div className="flex items-center gap-1">
                <button type="button" className="btn btn-sm btn-icon" aria-label={`${t("Una menos de")} ${i.name}`} disabled={i.qty <= 1} onClick={() => cart.setQty(i.id, i.qty - 1)}><Minus size={13} /></button>
                <input type="number" min={1} inputMode="numeric" className="input num h-8 w-16 text-center" aria-label={`${t("Cantidad de")} ${i.name}`}
                  value={i.qty} onChange={(e) => cart.setQty(i.id, Number(e.target.value))} />
                <button type="button" className="btn btn-sm btn-icon" aria-label={`${t("Una más de")} ${i.name}`} onClick={() => cart.setQty(i.id, i.qty + 1)}><Plus size={13} /></button>
              </div>
              <button type="button" className="btn btn-sm btn-ghost text-danger" aria-label={`${t("Quitar de la selección")}: ${i.name}`} onClick={() => cart.remove(i.id)}><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
        <p className="border-t border-line px-4 py-2 text-xs text-muted">
          {t("El precio lo pone la lista del cliente al crear la cotización. Seleccionar no reserva inventario.")}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3">
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => { cart.clear(); dialog.current?.close(); }}>{t("Vaciar")}</button>
          <Link href="/cotizaciones/nueva?seleccion=1" className="btn btn-primary" onClick={() => dialog.current?.close()}>{t("Convertir en cotización")}</Link>
        </div>
      </dialog>
    </>
  );
}

/**
 * En el formulario de cotización nueva: avisa qué productos de la selección entrarán al guardar y los envía con el
 * formulario. Sin selección, no muestra nada.
 */
export function CartField() {
  const t = useT();
  const cart = useCart();
  if (cart.count === 0) return null;
  return (
    <section className="card p-4" aria-label={t("Productos seleccionados")}>
      <input type="hidden" name="_cart" value={JSON.stringify(cart.items.map((i) => ({ id: i.id, qty: i.qty })))} />
      <p className="font-medium">{t("Al guardar se agregan los productos de tu selección")} <span className="badge">{cart.count}</span></p>
      <ul className="mt-2 grid gap-x-6 gap-y-0.5 text-sm sm:grid-cols-2">
        {cart.items.map((i) => <li key={i.id} className="flex justify-between gap-3"><span className="min-w-0 truncate">{i.name}</span><span className="num shrink-0 text-muted">× {formatNumber(i.qty)}</span></li>)}
      </ul>
      <p className="mt-2 text-xs text-muted">{t("Cada uno entra con el precio de la lista de la cuenta que elijas; los que no tengan precio en esa lista no se agregan.")}</p>
    </section>
  );
}

/** En la cotización recién creada desde la selección: la vacía (ya cumplió su propósito). */
export function CartCleared() {
  useEffect(() => {
    write({ ...read(), items: [] });
  }, []);
  return null;
}
