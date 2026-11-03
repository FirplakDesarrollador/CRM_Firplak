"use client";

import { useEffect, useRef, useState } from "react";

/** Menú desplegable accesible con cierre al hacer clic fuera o pulsar Escape. */
export function Dropdown({
  trigger,
  children,
  align = "right",
  label,
  className = "btn",
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "left" | "right";
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" className={className} aria-label={label} aria-expanded={open} aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}>
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          // Se cierra después del clic: quitar el menú antes dejaría sin enviar un formulario que esté dentro.
          onClick={(e) => (e.target as HTMLElement).closest("a,button[type=submit],[data-close]") && setTimeout(() => setOpen(false))}
          className={`absolute z-40 mt-1.5 min-w-56 rounded-lg border border-line bg-surface p-1.5 shadow-[var(--shadow-lg)] ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export const menuItemClass =
  "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium text-ink no-underline hover:bg-surface-3";
