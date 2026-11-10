// La descarga del día, guardada en este dispositivo (IndexedDB) para consultarla sin señal.
//
// El almacenamiento del navegador no está cifrado: por eso guarda solo lo de quien inició sesión y se borra al
// cerrar sesión, cuando entra otra persona y cuando el servidor dice que ya no hay sesión.

import type { OfflineMeta, OfflineSnapshot } from "./types";

const DB_NAME = "firplak-crm-sin-conexion";
const DB_VERSION = 1;
/** Lo descargado: «meta» (resumen) y «data» (todo). */
const STORE = "descarga";

/** Caché de la pantalla sin conexión: su HTML y los archivos que necesita. El service worker la sirve sin red. */
export const SHELL_CACHE = "firplak-crm-sin-conexion";

/** Se emite en la ventana cuando lo descargado cambia (se guardó o se borró). */
export const OFFLINE_EVENT = "crm:sin-conexion";

/** Tras cerrar sesión no se escribe más hasta que entre alguien: una descarga en curso no deja rastro. */
let locked = false;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Almacenamiento ocupado"));
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request ? request.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("Operación cancelada"));
    });
  } finally {
    db.close();
  }
}

function announce() {
  window.dispatchEvent(new Event(OFFLINE_EVENT));
}

/** Guarda la descarga (resumen y datos en una sola operación). Devuelve `false` si ya se cerró la sesión. */
export async function saveSnapshot(meta: OfflineMeta, snapshot: OfflineSnapshot) {
  if (locked) return false;
  await run("readwrite", (store) => {
    store.put(meta, "meta");
    store.put(snapshot, "data");
  });
  // Se cerró la sesión mientras se guardaba: no queda nada.
  if (locked) {
    await run("readwrite", (store) => void store.clear());
    return false;
  }
  announce();
  return true;
}

export async function readMeta(): Promise<OfflineMeta | null> {
  try {
    return (await run<OfflineMeta>("readonly", (store) => store.get("meta"))) ?? null;
  } catch {
    return null; // almacenamiento bloqueado (navegación privada, ajustes del navegador)
  }
}

export async function readSnapshot(): Promise<OfflineSnapshot | null> {
  try {
    return (await run<OfflineSnapshot>("readonly", (store) => store.get("data"))) ?? null;
  } catch {
    return null;
  }
}

/**
 * Cierre de sesión: borra lo descargado y no deja escribir más hasta que entre alguien. También quita la
 * pantalla guardada para abrir sin red: en un dispositivo sin sesión no queda nada que mostrar.
 */
export async function clearOffline() {
  locked = true;
  try {
    await run("readwrite", (store) => void store.clear());
  } catch {
    // nada que borrar
  }
  try {
    if ("caches" in window) await window.caches.delete(SHELL_CACHE);
  } catch {
    // caché bloqueada
  }
  announce();
}

/** Al entrar al CRM: borra lo que haya descargado otra persona en este dispositivo y vuelve a permitir guardar. */
export async function sweepOffline(userId: string) {
  locked = false;
  const meta = await readMeta();
  if (!meta || meta.userId === userId) return;
  try {
    await run("readwrite", (store) => void store.clear());
  } catch {
    // nada que borrar
  }
  announce();
}
