"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useT } from "@/lib/i18n/client";

// «Volver a la lista» conserva los filtros: cada lista recuerda, mientras dure la pestaña, cómo quedó (vista, filtros,
// búsqueda, orden y página). Entrar al módulo por el menú empieza de cero y borra lo recordado.
const key = (path: string) => `lista:${path}`;

/** En la lista: recuerda su dirección actual. */
export function RememberList() {
  const path = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    try {
      sessionStorage.setItem(key(path), search);
    } catch {
      // Sin almacenamiento (modo privado): «Volver» lleva a la lista sin filtros.
    }
  }, [path, search]);
  return null;
}

/** En la ficha: vuelve a la lista como se dejó. */
export function BackToList({ path }: { path: string }) {
  const t = useT();
  const [href, setHref] = useState(path);
  useEffect(() => {
    try {
      const search = sessionStorage.getItem(key(path));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lo recordado vive en el navegador: solo se conoce al montar
      if (search) setHref(`${path}?${search}`);
    } catch {
      // Queda el enlace a la lista sin filtros.
    }
  }, [path]);
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-sm font-semibold text-muted no-underline hover:text-ink">
      <ChevronLeft size={16} /> {t("Volver a la lista")}
    </Link>
  );
}
