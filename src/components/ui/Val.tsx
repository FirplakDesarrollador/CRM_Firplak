"use client";

import { useValueLabel } from "@/lib/i18n/client";

/** Muestra un valor de lista o una etapa en el idioma del usuario (el dato sigue en español). */
export function Val({ children }: { children: React.ReactNode }) {
  const label = useValueLabel();
  return <>{typeof children === "string" && children ? label(children) : children}</>;
}
