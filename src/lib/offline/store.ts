// Lo que la app guarda en este dispositivo (IndexedDB) para trabajar sin señal:
//   · «descarga»: la descarga del día, para consultarla;
//   · «salida»: la bandeja de salida, con lo que se creó sin señal y espera a enviarse.
//
// El almacenamiento del navegador no está cifrado. Por eso la descarga guarda solo lo de quien inició sesión y
// se borra al cerrar sesión, cuando entra otra persona y cuando el servidor dice que ya no hay sesión. La
// bandeja de salida es la excepción (decisión de Luis, 9 nov 2026): lo que no se ha enviado se conserva hasta
// que la misma persona vuelva a entrar, porque borrarlo sería perder trabajo. Nadie más lo ve ni lo envía.

import type { OfflineMeta, OfflineSnapshot, OutboxItem } from "./types";

const DB_NAME = "firplak-crm-sin-conexion";
const DB_VERSION = 2;
/** Lo descargado: «meta» (resumen) y «data» (todo). */
const STORE = "descarga";
/** Bandeja de salida: un registro por cliente o actividad creados sin señal. */
const OUTBOX = "salida";

/** Caché de la pantalla sin conexión: su HTML y los archivos que necesita. El service worker la sirve sin red. */
export const SHELL_CACHE = "firplak-crm-sin-conexion";

/** Se emite en la ventana cuando lo descargado cambia (se guardó o se borró). */
export const OFFLINE_EVENT = "crm:sin-conexion";
/** Se emite cuando cambia la bandeja de salida (se agregó, se envió, se descartó). */
export const OUTBOX_EVENT = "crm:sin-conexion:salida";
/** Pide enviar lo pendiente. Va aparte del anterior para que enviar no se llame a sí mismo. */
export const SEND_EVENT = "crm:sin-conexion:enviar";

/** Lo enviado se sigue mostrando hasta la siguiente descarga o, a más tardar, estos días. */
const SENT_DAYS = 7;

/** Tras cerrar sesión no se escribe más hasta que entre alguien: una descarga en curso no deja rastro. */
let locked = false;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(OUTBOX)) db.createObjectStore(OUTBOX, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Almacenamiento ocupado"));
  });
}

async function run<T>(name: string, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(name, mode);
      const request = work(tx.objectStore(name));
      tx.oncomplete = () => resolve(request ? request.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("Operación cancelada"));
    });
  } finally {
    db.close();
  }
}

function announce(event = OFFLINE_EVENT) {
  window.dispatchEvent(new Event(event));
}

// ── La descarga del día ─────────────────────────────────────────────────────────────────────────────────────

/** Guarda la descarga (resumen y datos en una sola operación). Devuelve `false` si ya se cerró la sesión. */
export async function saveSnapshot(meta: OfflineMeta, snapshot: OfflineSnapshot) {
  if (locked) return false;
  await run(STORE, "readwrite", (store) => {
    store.put(meta, "meta");
    store.put(snapshot, "data");
  });
  // Se cerró la sesión mientras se guardaba: no queda nada.
  if (locked) {
    await run(STORE, "readwrite", (store) => void store.clear());
    return false;
  }
  // Lo que ya se envió viene ahora en la descarga: sobra en la bandeja.
  await purgeSent(meta.userId).catch(() => undefined);
  announce();
  return true;
}

export async function readMeta(): Promise<OfflineMeta | null> {
  try {
    return (await run<OfflineMeta>(STORE, "readonly", (store) => store.get("meta"))) ?? null;
  } catch {
    return null; // almacenamiento bloqueado (navegación privada, ajustes del navegador)
  }
}

export async function readSnapshot(): Promise<OfflineSnapshot | null> {
  try {
    return (await run<OfflineSnapshot>(STORE, "readonly", (store) => store.get("data"))) ?? null;
  } catch {
    return null;
  }
}

/**
 * Cierre de sesión: borra lo descargado y no deja escribir más hasta que entre alguien. También quita la
 * pantalla guardada para abrir sin red: en un dispositivo sin sesión no queda nada que mostrar. De la bandeja
 * de salida solo se va lo que ya se envió; lo pendiente espera a que su dueño vuelva a entrar.
 */
export async function clearOffline() {
  locked = true;
  try {
    await run(STORE, "readwrite", (store) => void store.clear());
  } catch {
    // nada que borrar
  }
  await purgeSent().catch(() => undefined);
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
    await run(STORE, "readwrite", (store) => void store.clear());
  } catch {
    // nada que borrar
  }
  announce();
}

// ── La bandeja de salida ────────────────────────────────────────────────────────────────────────────────────

async function allOutbox(): Promise<OutboxItem[]> {
  return (await run<OutboxItem[]>(OUTBOX, "readonly", (store) => store.getAll())) ?? [];
}

/** Guarda algo creado sin señal. Lanza si el dispositivo no deja guardar: quien lo escribió debe enterarse. */
export async function addOutbox(item: OutboxItem) {
  await run(OUTBOX, "readwrite", (store) => void store.put(item));
  announce(OUTBOX_EVENT);
}

/** La bandeja de una persona, de lo más antiguo a lo más reciente. */
export async function listOutbox(userId: string): Promise<OutboxItem[]> {
  try {
    return (await allOutbox()).filter((item) => item.userId === userId).sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

export async function updateOutbox(id: string, patch: Partial<OutboxItem>) {
  await run(OUTBOX, "readwrite", (store) => {
    const found = store.get(id);
    found.onsuccess = () => {
      if (found.result) store.put({ ...found.result, ...patch, id });
    };
  });
  announce(OUTBOX_EVENT);
}

/** Descarta un registro y, si era un cliente, lo que dependía de él: sin el cliente no se puede enviar. */
export async function removeOutbox(id: string) {
  await run(OUTBOX, "readwrite", (store) => {
    store.delete(id);
    const cursor = store.openCursor();
    cursor.onsuccess = () => {
      const at = cursor.result;
      if (!at) return;
      if ((at.value as OutboxItem).dependsOn === id) at.delete();
      at.continue();
    };
  });
  announce(OUTBOX_EVENT);
}

/** Quita lo ya enviado: todo, lo de una persona, o solo lo enviado antes de `before` (ms). */
export async function purgeSent(userId?: string, before?: number) {
  let removed = false;
  await run(OUTBOX, "readwrite", (store) => {
    const cursor = store.openCursor();
    cursor.onsuccess = () => {
      const at = cursor.result;
      if (!at) return;
      const item = at.value as OutboxItem;
      if (item.status === "sent" && (!userId || item.userId === userId) && (before === undefined || (item.sentAt ?? 0) < before)) {
        at.delete();
        removed = true;
      }
      at.continue();
    };
  });
  if (removed) announce(OUTBOX_EVENT);
}

/** Lo enviado hace más de una semana ya no hace falta mostrarlo. */
export function purgeOldSent(userId: string) {
  return purgeSent(userId, Date.now() - SENT_DAYS * 86_400_000);
}

/** Cuántos registros faltan por enviar: de una persona o, sin ella, de todo el dispositivo. */
export async function countUnsent(userId?: string) {
  try {
    return (await allOutbox()).filter((item) => item.status !== "sent" && (!userId || item.userId === userId)).length;
  } catch {
    return 0;
  }
}

/** Pide enviar ya lo pendiente (lo atiende quien tenga la sesión abierta en esta ventana). */
export function requestSend() {
  announce(SEND_EVENT);
}
