// Borradores de formularios, guardados en este dispositivo (localStorage) para no perder lo escrito cuando se cae
// la conexión o se cierra la app. No van al servidor: se borran al guardar el registro, al descartarlos, al cerrar
// sesión y cuando pasan de dos semanas. El almacenamiento del navegador no está cifrado, por eso solo guardan lo que
// el propio usuario escribió y se limpian al salir.

/** Lo elegido en un campo de relación (para volver a mostrar su nombre). `null`: se quitó la selección. */
export type DraftLookup = {
  id: string; label: string;
  market?: string | null; channel?: string | null; account?: { id: string; label: string } | null;
} | null;

export type Draft = {
  /** Cuándo se guardó (ms). */
  at: number;
  /** Versión del registro que se estaba editando (`updated_at`); sin ella, registro nuevo. */
  base?: string | null;
  /** Valores por nombre de campo, como los envía el formulario (varios valores unidos con «|»). */
  values: Record<string, string>;
  lookups?: Record<string, DraftLookup>;
};

const PREFIX = "crm:borrador:";
const MAX_AGE = 14 * 24 * 60 * 60 * 1000;

/** Clave del borrador: usuario + dirección de la pantalla (+ un sufijo si la pantalla tiene varios formularios). */
export function draftKey(userId: string, location: string, suffix = "") {
  return `${PREFIX}${userId}:${location}${suffix}`;
}

function parse(raw: string | null): Draft | null {
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw) as Draft;
    if (typeof draft?.at !== "number" || typeof draft.values !== "object" || draft.values === null) return null;
    return Date.now() - draft.at > MAX_AGE ? null : draft;
  } catch {
    return null;
  }
}

export function readDraft(key: string): Draft | null {
  try {
    return parse(window.localStorage.getItem(key));
  } catch {
    return null; // almacenamiento bloqueado (navegación privada, ajustes del navegador)
  }
}

/** Tras cerrar sesión no se escribe más hasta que entre alguien: el formulario que se está cerrando no deja rastro. */
let locked = false;

export function writeDraft(key: string, draft: Draft) {
  if (locked) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Sin espacio o sin permiso: el formulario sigue funcionando, solo que sin borrador.
  }
}

export function removeDraft(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // nada que borrar
  }
}

/**
 * Limpieza. Sin `keepUserId` borra todos los borradores (cierre de sesión); con él conserva los vigentes de ese
 * usuario y borra los de otras personas que hayan usado este dispositivo y los vencidos.
 */
export function clearDrafts(keepUserId?: string) {
  locked = keepUserId === undefined;
  try {
    const store = window.localStorage;
    const keys = Array.from({ length: store.length }, (_, i) => store.key(i)).filter((k): k is string => Boolean(k?.startsWith(PREFIX)));
    for (const key of keys) {
      const own = keepUserId !== undefined && key.startsWith(`${PREFIX}${keepUserId}:`);
      if (!own || !parse(store.getItem(key))) store.removeItem(key);
    }
  } catch {
    // almacenamiento bloqueado
  }
}

/**
 * Valores del formulario para el borrador, en el mismo formato que devuelve el servidor tras un error de
 * validación. Un campo que en este momento no está en el formulario se omite (conserva el valor del registro),
 * salvo los de `always`, que se guardan vacíos.
 */
export function formValues(form: HTMLFormElement | null, formData: FormData, names: string[], always: string[] = []) {
  const values: Record<string, string> = {};
  for (const name of names) {
    const present = form ? form.elements.namedItem(name) !== null : formData.has(name);
    if (!present && !always.includes(name)) continue;
    values[name] = formData.getAll(name).map((v) => String(v).trim()).join("|");
  }
  return values;
}
