"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { WifiOff } from "lucide-react";
import { useOfflineMeta } from "@/components/offline/useOffline";
import { ensureShell, OFFLINE_PATH } from "@/lib/offline/download";

/**
 * Registra el service worker (app instalable) y avisa cuando se pierde la conexión.
 * En desarrollo no guarda archivos estáticos en caché (?static=0).
 */
export function PwaRegister() {
  const [offline, setOffline] = useState(false);
  const pathname = usePathname();
  const { meta } = useOfflineMeta();

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

  // Hay descarga y hay red: si la pantalla para verla sin señal no quedó completa, se guarda de nuevo sola.
  useEffect(() => {
    if (!meta || offline) return;
    void ensureShell().catch(() => undefined);
  }, [meta, offline]);

  // La pantalla de consulta sin señal ya dice que no hay señal, y allí no se guarda nada.
  if (!offline || pathname === OFFLINE_PATH) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[60] flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 bg-[var(--warning,#a86b16)] px-4 pb-1.5 pt-[calc(var(--safe-top)+0.375rem)] text-xs font-semibold text-white">
      <WifiOff size={14} className="flex-none" aria-hidden="true" />
      <span>Sin conexión: no se puede guardar. Lo que escribas en un registro o una actividad queda como borrador en este dispositivo.</span>
      {meta && (
        // Enlace normal, no <Link>: la navegación completa es la que el service worker puede atender sin red.
        <a href={OFFLINE_PATH} className="rounded-sm text-white underline underline-offset-2">Ver lo descargado</a>
      )}
    </div>
  );
}
