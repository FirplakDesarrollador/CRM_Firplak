import Link from "next/link";
import { CalendarDays, CalendarRange, List } from "lucide-react";

/** Agenda · Calendario · Lista para el módulo de actividades. */
export function ActivityViewSwitcher({ active }: { active: "agenda" | "calendario" | "lista" }) {
  const items = [
    { key: "agenda", href: "/actividades", label: "Agenda", Icon: CalendarDays },
    { key: "calendario", href: "/actividades/calendario", label: "Calendario", Icon: CalendarRange },
    { key: "lista", href: "/actividades?vista=lista", label: "Lista", Icon: List },
  ] as const;
  return (
    <div className="inline-flex rounded-[10px] border border-line-strong p-0.5">
      {items.map(({ key, href, label, Icon }) => (
        <Link key={key} href={href} aria-current={active === key ? "page" : undefined}
          className={`btn btn-sm border-0 ${active === key ? "bg-brand text-[var(--brand-contrast)] hover:bg-brand" : "btn-ghost"}`}>
          <Icon size={14} /> {label}
        </Link>
      ))}
    </div>
  );
}
