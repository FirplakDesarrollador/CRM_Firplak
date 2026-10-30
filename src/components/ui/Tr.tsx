"use client";

import { useT } from "@/lib/i18n/client";

/** Texto traducible: muestra la frase en el idioma del usuario (respaldo: español). */
export function Tr({ children }: { children: string }) {
  const t = useT();
  return <>{t(children)}</>;
}
