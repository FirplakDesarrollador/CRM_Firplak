"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { unstable_rethrow } from "next/navigation";
import type { FormState } from "@/lib/records/form";
import { draftKey, formValues, readDraft, removeDraft, writeDraft, type Draft, type DraftLookup } from "@/lib/drafts";

export const OFFLINE_MESSAGE = "Sin conexión: no se guardó. Lo que escribiste queda en este dispositivo; guarda de nuevo cuando vuelva internet.";
export const FAILED_MESSAGE = "No se pudo guardar. Lo que escribiste queda en este dispositivo; inténtalo de nuevo.";

const NO_STATE: FormState = {};

const isOffline = () => navigator.onLine === false;

type Options = {
  formRef: React.RefObject<HTMLFormElement | null>;
  /** Usuario dueño del borrador. */
  owner: string;
  /** Campos que se guardan. */
  names: string[];
  /** Campos que se guardan vacíos cuando no están en el formulario (los demás se omiten). */
  always?: string[];
  /** Versión del registro que se edita (`updated_at`); sin ella, registro nuevo. */
  base?: string | null;
  /** La dirección completa identifica el formulario; con `false`, solo la ruta (formularios dentro de una ficha). */
  withSearch?: boolean;
  suffix?: string;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
};

/**
 * Formulario que no pierde lo escrito: mientras se llena guarda un borrador en este dispositivo y lo recupera al
 * volver a abrirlo. Sin conexión no intenta guardar: avisa y conserva todo. El borrador se borra cuando el
 * registro se guarda o cuando la persona lo descarta.
 *
 * Solo lo que la persona hace en el formulario crea un borrador; recuperarlo no dispara eventos.
 */
export function useFormDraft({ formRef, owner, names, always, base, withSearch = true, suffix = "", action }: Options) {
  /** Borrador aplicado al formulario. */
  const [draft, setDraft] = useState<Draft | null>(null);
  /** Borrador de una versión anterior del registro: se ofrece, no se aplica solo. */
  const [offer, setOffer] = useState<Draft | null>(null);
  /** Cambia cuando el formulario debe volver a montarse con otros valores iniciales. */
  const [version, setVersion] = useState(0);
  const [dismissed, setDismissed] = useState<FormState | null>(null);

  const key = useRef<string | null>(null);
  const lookups = useRef<Record<string, DraftLookup>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** El registro ya se guardó o se canceló: no se escribe más. */
  const closed = useRef(false);
  const latest = useRef({ names, always, base, action });
  useEffect(() => {
    latest.current = { names, always, base, action };
  });

  // La dirección se lee una sola vez: al salir de la pantalla ya es la de la pantalla siguiente.
  const currentKey = useCallback(
    () => (key.current ??= draftKey(owner, window.location.pathname + (withSearch ? window.location.search : ""), suffix)),
    [owner, withSearch, suffix],
  );

  const store = useCallback((values: Record<string, string>) => {
    if (closed.current) return;
    writeDraft(currentKey(), { at: Date.now(), base: latest.current.base, values, lookups: lookups.current });
  }, [currentKey]);

  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
  }, []);

  const forget = useCallback(() => {
    cancel();
    removeDraft(currentKey());
    lookups.current = {};
  }, [cancel, currentKey]);

  // Al abrir: recupera el borrador de esta pantalla.
  useEffect(() => {
    const found = readDraft(currentKey());
    if (!found) return;
    if ((found.base ?? null) === (latest.current.base ?? null)) {
      lookups.current = found.lookups ?? {};
      setDraft(found);
      setVersion((v) => v + 1);
    } else {
      setOffer(found);
    }
  }, [currentKey]);

  // Mientras se escribe: guarda poco después de la última tecla, y de inmediato al salir o esconder la app.
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const write = () => {
      timer.current = undefined;
      store(formValues(form, new FormData(form), latest.current.names, latest.current.always));
    };
    const touch = () => {
      if (closed.current) return;
      setOffer(null);
      clearTimeout(timer.current);
      timer.current = setTimeout(write, 400);
    };
    const onLookup = (e: Event) => {
      const { name, item } = (e as CustomEvent<{ name: string; item: Exclude<DraftLookup, null> | null }>).detail;
      lookups.current = {
        ...lookups.current,
        [name]: item ? { id: item.id, label: item.label, market: item.market, channel: item.channel, account: item.account } : null,
      };
      touch();
    };
    const flush = () => {
      if (timer.current === undefined) return;
      clearTimeout(timer.current);
      write();
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    form.addEventListener("input", touch);
    form.addEventListener("change", touch);
    form.addEventListener("lookup:select", onLookup);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      flush();
      form.removeEventListener("input", touch);
      form.removeEventListener("change", touch);
      form.removeEventListener("lookup:select", onLookup);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [formRef, store, version]);

  const run = useCallback(async (prev: FormState, formData: FormData): Promise<FormState> => {
    const current = latest.current;
    const values = formValues(formRef.current, formData, current.names, current.always);
    const kept = (state: FormState): FormState => {
      cancel();
      store(values);
      return { ...state, values };
    };
    if (isOffline()) return kept({ offline: true, message: OFFLINE_MESSAGE });
    try {
      const result = await current.action(prev, formData);
      if (result.ok) {
        // Guardado sin cambiar de pantalla: el formulario queda limpio para el siguiente.
        forget();
        setDraft(null);
        setVersion((v) => v + 1);
        return result;
      }
      return result.values ? result : { ...result, values };
    } catch (err) {
      // Guardado que lleva a otra pantalla: Next lo comunica con un error de redirección. Si lleva al ingreso,
      // la sesión venció y no se guardó: el borrador se conserva.
      const digest = String((err as { digest?: unknown } | null)?.digest ?? "");
      if (digest.startsWith("NEXT_REDIRECT;")) {
        let to = digest.split(";").slice(2, -2).join(";");
        try {
          to = new URL(to, window.location.origin).pathname;
        } catch {
          // dirección rara: se trata como guardado
        }
        if (!to.startsWith("/login")) {
          forget();
          closed.current = true;
        }
      }
      unstable_rethrow(err);
      if (isOffline() || err instanceof TypeError) return kept({ offline: true, message: OFFLINE_MESSAGE });
      console.error(err);
      return kept({ message: FAILED_MESSAGE });
    }
  }, [formRef, store, cancel, forget]);

  const [state, formAction] = useActionState(run, NO_STATE);
  const live = state === dismissed ? NO_STATE : state;

  /** Aplica el borrador ofrecido. */
  const restore = () => {
    if (!offer) return;
    lookups.current = offer.lookups ?? {};
    setDraft(offer);
    setOffer(null);
    setVersion((v) => v + 1);
  };

  /** Borra el borrador y devuelve el formulario a los valores guardados. */
  const discard = () => {
    forget();
    setDraft(null);
    setOffer(null);
    setDismissed(state);
    setVersion((v) => v + 1);
  };

  /** Se sale del formulario sin guardar (Cancelar): borra el borrador y no vuelve a escribirlo. */
  const close = () => {
    forget();
    closed.current = true;
  };

  return {
    /** Respuesta del último intento de guardar. */
    state: live,
    formAction,
    /** Valores con que se llenan los campos: los del último intento o, si no hubo, los del borrador. */
    values: live.values ?? draft?.values,
    draft,
    offer,
    restore,
    discard,
    close,
    version,
  };
}
