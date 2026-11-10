"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { OFFLINE_EVENT, readMeta, readSnapshot } from "@/lib/offline/store";
import type { OfflineMeta, OfflineSnapshot } from "@/lib/offline/types";

function subscribeOnline(notify: () => void) {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
}

/** Si el dispositivo cree tener red. En el servidor no se sabe: se asume que sí. */
export function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

type Downloaded = { meta: OfflineMeta | null; snapshot: OfflineSnapshot | null; ready: boolean };

function useDownloaded(withData: boolean): Downloaded {
  const [state, setState] = useState<Downloaded>({ meta: null, snapshot: null, ready: false });
  useEffect(() => {
    let alive = true;
    const load = () => {
      Promise.all([readMeta(), withData ? readSnapshot() : null]).then(([meta, snapshot]) => {
        // Resumen y datos se guardan juntos; si falta alguno, no hay descarga.
        if (alive) setState({ meta: withData && !snapshot ? null : meta, snapshot: meta ? snapshot : null, ready: true });
      });
    };
    load();
    window.addEventListener(OFFLINE_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(OFFLINE_EVENT, load);
    };
  }, [withData]);
  return state;
}

/** Resumen de lo descargado en este dispositivo (cuándo y cuánto). `ready`: ya se leyó el almacenamiento. */
export function useOfflineMeta() {
  const { meta, ready } = useDownloaded(false);
  return { meta, ready };
}

/** Lo descargado completo, para la pantalla que lo muestra. */
export function useOfflineData() {
  return useDownloaded(true);
}
