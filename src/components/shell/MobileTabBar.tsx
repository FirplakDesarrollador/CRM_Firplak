"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { OBJECT_ICONS } from "@/components/ui/icons";
import { useT } from "@/lib/i18n/client";
import type { NavItem } from "./nav";

// Accesos fijos de la barra inferior en el celular; el resto queda en «Más».
const PRIMARY = ["/inicio", "/cuentas", "/oportunidades", "/actividades"];
const LABELS: Record<string, string> = { "/oportunidades": "Pipeline" };
const HREFS: Record<string, string> = { "/oportunidades": "/oportunidades/pipeline" };

/** Barra de navegación inferior para pantallas pequeñas (y la app instalada en el celular). */
export function MobileTabBar({ items }: { items: NavItem[] }) {
  const t = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const primary = PRIMARY.map((href) => items.find((i) => i.href === href)).filter((i): i is NavItem => Boolean(i));
  const rest = items.filter((i) => !PRIMARY.includes(i.href));
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setOpen(false)}>
          <nav aria-label={t("Más módulos")} onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-0 bottom-0 max-h-[75dvh] overflow-y-auto rounded-t-[20px] border-t border-line bg-[var(--surface)] p-3 pb-[calc(env(safe-area-inset-bottom)+5rem)]">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="eyebrow">{t("Módulos")}</p>
              <button type="button" className="btn btn-icon btn-ghost" onClick={() => setOpen(false)} aria-label={t("Cerrar")}><X size={18} /></button>
            </div>
            <ul className="grid grid-cols-3 gap-2">
              {rest.map((item) => {
                const Icon = OBJECT_ICONS[item.icon];
                return (
                  <li key={item.href}>
                    <Link href={item.href} aria-current={isActive(item.href) ? "page" : undefined} onClick={() => setOpen(false)}
                      className={`flex flex-col items-center gap-1 rounded-[12px] border px-2 py-3 text-center text-xs no-underline ${isActive(item.href) ? "border-[var(--brand)] text-[var(--brand)]" : "border-line text-ink"}`}>
                      {Icon && <Icon size={20} />}
                      <span className="leading-tight">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      )}
      <nav aria-label={t("Navegación principal")}
        className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-[var(--glass-bg)] pb-[env(safe-area-inset-bottom)] backdrop-blur-[28px] backdrop-saturate-150 md:hidden">
        <ul className="grid grid-cols-5">
          {primary.map((item) => {
            const Icon = OBJECT_ICONS[item.icon];
            const href = HREFS[item.href] ?? item.href;
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link href={href} aria-current={active ? "page" : undefined} onClick={() => setOpen(false)}
                  className={`flex h-14 flex-col items-center justify-center gap-0.5 text-[0.68rem] no-underline ${active ? "text-[var(--brand)]" : "text-muted"}`}>
                  {Icon && <Icon size={20} />}
                  <span>{LABELS[item.href] ? t(LABELS[item.href]) : item.label}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
              className={`flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[0.68rem] ${open || rest.some((i) => isActive(i.href)) ? "text-[var(--brand)]" : "text-muted"}`}>
              <Menu size={20} />
              <span>{t("Más")}</span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
