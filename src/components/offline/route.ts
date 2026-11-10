"use client";

import { useMemo, useSyncExternalStore } from "react";

// La pantalla sin conexión guarda dónde está la persona en la parte de la dirección que va después de «#»:
// cambiarla no le pide nada al servidor, así que pestañas, fichas y el botón «atrás» funcionan sin red.

export const VIEWS = ["agenda", "clientes", "oportunidades", "productos", "salida"] as const;
export type View = (typeof VIEWS)[number];

const ROUTE_EVENT = "crm:sin-conexion:ruta";

function subscribe(notify: () => void) {
  window.addEventListener("hashchange", notify);
  window.addEventListener("popstate", notify);
  window.addEventListener(ROUTE_EVENT, notify);
  return () => {
    window.removeEventListener("hashchange", notify);
    window.removeEventListener("popstate", notify);
    window.removeEventListener(ROUTE_EVENT, notify);
  };
}

const params = (hash: string) => new URLSearchParams(hash.replace(/^#/, ""));

/** A dónde volver en el CRM: solo rutas propias, nunca otra página ni esta misma pantalla. */
function safeBack(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/inicio";
  return value === "/sin-conexion" || value.startsWith("/sin-conexion?") || value.startsWith("/sin-conexion#") ? "/inicio" : value;
}

export type Route = {
  view: View;
  /** Ficha de cliente abierta. */
  client: string | null;
  /** Con qué precios se ve el catálogo: «a:<cliente>» o «l:<lista>». */
  prices: string | null;
  /** Pantalla del CRM que se intentó abrir sin red. */
  back: string;
  /** Formulario abierto para crear (o corregir) algo sin señal. */
  form: Form | null;
  /** Registro de la bandeja de salida que se está corrigiendo. */
  edit: string | null;
};

const FORMS = ["cliente", "actividad"] as const;
export type Form = (typeof FORMS)[number];

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => "");
  return useMemo(() => {
    const p = params(hash);
    const view = p.get("v") as View | null;
    return {
      view: view && VIEWS.includes(view) ? view : "agenda",
      client: p.get("c"),
      prices: p.get("p"),
      back: safeBack(p.get("volver")),
      form: FORMS.find((form) => form === p.get("f")) ?? null,
      edit: p.get("e"),
    };
  }, [hash]);
}

/**
 * Cambia la ruta. `push` deja la pantalla anterior en el historial (el «atrás» del teléfono vuelve a ella);
 * sin él, la reemplaza.
 */
export function go(changes: Record<string, string | null>, push = false) {
  const p = params(window.location.hash);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) p.delete(key);
    else p.set(key, value);
  }
  const hash = p.toString();
  const url = `${window.location.pathname}${window.location.search}${hash ? `#${hash}` : ""}`;
  // La marca dice que esta pantalla se abrió desde otra de aquí mismo: el botón «Volver» puede retroceder.
  if (push) window.history.pushState({ fp: 1 }, "", url);
  else window.history.replaceState(window.history.state, "", url);
  window.dispatchEvent(new Event(ROUTE_EVENT));
  window.scrollTo({ top: 0 });
}

/** Cierra el formulario abierto: vuelve a la pantalla desde la que se abrió. */
export function closeForm() {
  if ((window.history.state as { fp?: number } | null)?.fp) window.history.back();
  else go({ f: null, e: null });
}
