"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { countUnsent, listOutbox, OUTBOX_EVENT, SEND_EVENT } from "@/lib/offline/store";
import { syncOutbox, type SyncResult } from "@/lib/offline/sync";
import type { OutboxItem } from "@/lib/offline/types";

const EMPTY: OutboxItem[] = [];

/** La bandeja de salida de una persona en este dispositivo, al día con cada cambio. */
export function useOutbox(userId: string | null) {
  const [state, setState] = useState<{ userId: string; items: OutboxItem[] } | null>(null);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    const load = () => {
      void listOutbox(userId).then((items) => {
        if (alive) setState({ userId, items });
      });
    };
    load();
    window.addEventListener(OUTBOX_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(OUTBOX_EVENT, load);
    };
  }, [userId]);
  const mine = userId !== null && state?.userId === userId;
  return { items: mine ? state.items : EMPTY, ready: userId === null || mine };
}

/** Cuántos registros sin enviar hay en el dispositivo, sean de quien sean (no dice cuáles ni de quién). */
export function useDeviceUnsent() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => {
      void countUnsent().then((n) => {
        if (alive) setCount(n);
      });
    };
    load();
    window.addEventListener(OUTBOX_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(OUTBOX_EVENT, load);
    };
  }, []);
  return count;
}

/**
 * Envía lo pendiente de quien tiene la sesión: al abrir, al volver la señal, al volver a la app, cuando se guarda
 * algo nuevo y, mientras quede algo, cada minuto. `userId` debe ser el que confirmó el servidor.
 */
export function useOutboxSync(userId: string | null, onSent?: (result: SyncResult) => void) {
  const callback = useRef(onSent);
  useEffect(() => {
    callback.current = onSent;
  });
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    const run = () => {
      if (!navigator.onLine) return;
      syncOutbox(userId)
        .then((result) => {
          if (alive && result.sent > 0) callback.current?.(result);
        })
        .catch(() => undefined);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    run();
    window.addEventListener("online", run);
    window.addEventListener(SEND_EVENT, run);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(run, 60_000);
    return () => {
      alive = false;
      window.removeEventListener("online", run);
      window.removeEventListener(SEND_EVENT, run);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [userId]);
}

// ── Aviso breve tras guardar («Guardada en este dispositivo…») ──────────────────────────────────────────────

let notice: string | null = null;
let noticeTimer: number | undefined;
const noticeListeners = new Set<() => void>();

function setNotice(text: string | null) {
  notice = text;
  noticeListeners.forEach((listener) => listener());
}

/** Muestra un aviso unos segundos en la pantalla sin conexión. */
export function showNotice(text: string) {
  window.clearTimeout(noticeTimer);
  setNotice(text);
  noticeTimer = window.setTimeout(() => setNotice(null), 6000);
}

function subscribeNotice(listener: () => void) {
  noticeListeners.add(listener);
  return () => {
    noticeListeners.delete(listener);
  };
}

export function useNotice() {
  return useSyncExternalStore(subscribeNotice, () => notice, () => null);
}
