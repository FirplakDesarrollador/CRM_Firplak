"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n/client";

export function SetupNav({ items }: { items: { href: string; label: string; group: string }[] }) {
  const pathname = usePathname();
  const t = useT();
  const groups = [...new Set(items.map((i) => i.group))];
  return (
    <nav aria-label="Configuración" className="glass p-2 lg:sticky lg:top-32">
      {groups.map((g) => (
        <div key={g} className="mb-2 last:mb-0">
          <p className="px-2.5 pb-1 pt-2 text-[0.72rem] font-medium uppercase tracking-[0.18em] text-muted">{t(g)}</p>
          {items.filter((i) => i.group === g).map((i) => {
            const active = pathname === i.href;
            return (
              <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined}
                className={`block rounded-md px-2.5 py-1.5 text-sm font-semibold no-underline ${active ? "bg-brand-soft text-brand-strong" : "text-ink-2 hover:bg-surface-3"}`}>
                {t(i.label)}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
