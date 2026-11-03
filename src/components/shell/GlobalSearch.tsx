"use client";

import { Search } from "lucide-react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useT } from "@/lib/i18n/client";

const WIDE = "(min-width: 64rem)";

function subscribeWide(onChange: () => void) {
  const media = window.matchMedia(WIDE);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function GlobalSearch() {
  const router = useRouter();
  const t = useT();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(pathname === "/buscar" ? params.get("q") ?? "" : "");
  const inputRef = useRef<HTMLInputElement>(null);
  // El texto completo solo cabe desde 1024 px: en el celular se cortaba en «Buscar c».
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form
      role="search"
      className="relative w-full max-w-xl"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) router.push(`/buscar?q=${encodeURIComponent(value.trim())}`);
      }}
    >
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="input h-9 rounded-full bg-surface-2 pl-9 pr-3 sm:pr-14"
        placeholder={wide ? t("Buscar cuentas, contactos, oportunidades…") : t("Buscar")}
        aria-label="Búsqueda global"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-line px-1.5 text-[0.65rem] font-semibold text-muted sm:block">
        Ctrl K
      </kbd>
    </form>
  );
}
