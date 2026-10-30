"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { OBJECT_ICONS } from "@/components/ui/icons";
import type { NavItem } from "./nav";

export function NavTabs({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Módulos" className="border-b border-line bg-[var(--glass-bg)] backdrop-blur-[28px] backdrop-saturate-150">
      <div className="mx-auto flex max-w-[1600px] overflow-x-auto px-4 [scrollbar-width:none] sm:px-6">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = OBJECT_ICONS[item.icon];
          return (
            <Link key={item.href} href={item.href} className="tab text-[0.88rem]" aria-current={active ? "page" : undefined}>
              {Icon && <Icon size={15} />}
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
