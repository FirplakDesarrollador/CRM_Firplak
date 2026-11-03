"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { OBJECT_ICONS } from "@/components/ui/icons";
import type { NavItem } from "./nav";

export function NavTabs({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const activeTab = useRef<HTMLAnchorElement>(null);
  // La píldora del módulo activo siempre queda a la vista, aunque haya más módulos de los que caben.
  useEffect(() => {
    activeTab.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);
  return (
    <nav aria-label="Módulos" className="shell-chrome shell-bar">
      <div className="nav-scroll mx-auto flex max-w-[1600px] overflow-x-auto px-4 sm:px-6">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = OBJECT_ICONS[item.icon];
          return (
            <Link key={item.href} ref={active ? activeTab : undefined} href={item.href} className="tab flex-none text-[0.88rem]" aria-current={active ? "page" : undefined}>
              {Icon && <Icon size={15} />}
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
