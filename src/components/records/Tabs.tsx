import Link from "next/link";

export function Tabs({ tabs, active, basePath }: { tabs: { key: string; label: string; count?: number }[]; active: string; basePath: string }) {
  return (
    <div role="tablist" className="flex overflow-x-auto border-b border-line px-1">
      {tabs.map((t, i) => (
        <Link key={t.key} role="tab" href={i === 0 ? basePath : `${basePath}?tab=${t.key}`} scroll={false}
          aria-selected={active === t.key} className="tab">
          {t.label}
          {t.count !== undefined && <span className="badge">{t.count}</span>}
        </Link>
      ))}
    </div>
  );
}
