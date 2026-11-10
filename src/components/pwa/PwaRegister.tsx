"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/**
 * Registra el service worker (app instalable) y avisa cuando se pierde la conexión.
 * En desarrollo no guarda archivos estáticos en caché (?static=0).
 */
export function PwaRegister() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      const dev = process.env.NODE_ENV !== "production";
      navigator.serviceWorker.register(`/sw.js${dev ? "?static=0" : ""}`, { scope: "/", updateViaCache: "none" }).catch(() => undefined);
    }
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-[var(--warning,#a86b16)] px-4 pb-1.5 pt-[calc(var(--safe-top)+0.375rem)] text-xs font-semibold text-white">
      <WifiOff size={14} /> Sin conexión: no se puede guardar. Lo que escribas en un registro o una actividad queda como borrador en este dispositivo.
    </div>
  );
}
