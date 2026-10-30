"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/client";

export function Tabs({ tabs, active, basePath }: { tabs: { key: string; label: string; count?: number }[]; active: string; basePath: string }) {
  const t = useT();
  return (
    <div role="tablist" className="flex overflow-x-auto border-b border-line px-1">
      {tabs.map((tab, i) => (
        <Link key={tab.key} role="tab" href={i === 0 ? basePath : `${basePath}?tab=${tab.key}`} scroll={false}
          aria-selected={active === tab.key} className="tab">
          {t(tab.label)}
          {tab.count !== undefined && <span className="badge">{tab.count}</span>}
        </Link>
      ))}
    </div>
  );
}
