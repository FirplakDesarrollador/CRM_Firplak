"use client";

import { usePathname } from "next/navigation";
import { Send } from "lucide-react";
import { useOutbox } from "@/components/offline/useOutbox";
import { useT } from "@/lib/i18n/client";
import { unsent } from "@/lib/offline/outbox";

/** Aviso en el encabezado mientras quede algo creado sin señal que no ha llegado al CRM. Lleva a la bandeja. */
export function UnsentLink({ userId }: { userId: string }) {
  const t = useT();
  const pathname = usePathname();
  const { items } = useOutbox(userId);
  const count = unsent(items).length;
  if (count === 0) return null;
  return (
    // Enlace normal: la pantalla sin señal vive fuera del CRM y se abre con una carga completa.
    <a
      href={`/sin-conexion#v=salida&volver=${encodeURIComponent(pathname)}`}
      className="btn btn-sm btn-ghost"
      aria-label={`${count} ${t("sin enviar")}`}
      title={t("Registros creados sin señal que no han llegado al CRM")}
    >
      <Send size={14} aria-hidden="true" /> <span className="badge badge-warning num">{count}</span>
      <span className="hidden xl:inline">{t("sin enviar")}</span>
    </a>
  );
}
