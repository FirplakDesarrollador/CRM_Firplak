"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";

type Option = { id: string; label: string; sub?: string };

/** Campo de relación con búsqueda remota. Envía el id en un input oculto `name`. */
export function LookupInput({
  id,
  name,
  object,
  initial,
  placeholder,
  invalid,
  filterAccount,
  onChange,
}: {
  id?: string;
  name: string;
  object: string;
  initial?: { id: string; label: string } | null;
  placeholder?: string;
  invalid?: boolean;
  filterAccount?: string | null;
  onChange?: (value: { id: string; label: string } | null) => void;
}) {
  const [selected, setSelected] = useState<{ id: string; label: string } | null>(initial ?? null);
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const t = useT();

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({ object, q: term });
        if (filterAccount) qs.set("account", filterAccount);
        const res = await fetch(`/api/lookup?${qs}`, { signal: ctrl.signal });
        const json = await res.json();
        setResults(json.results ?? []);
        setActive(0);
      } catch {
        /* petición cancelada */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [term, open, object, filterAccount]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const choose = (opt: Option | null) => {
    const value = opt ? { id: opt.id, label: opt.label } : null;
    setSelected(value);
    onChange?.(value);
    setOpen(false);
    setTerm("");
  };

  return (
    <div ref={boxRef} className="relative">
      <input type="hidden" name={name} value={selected?.id ?? ""} />
      {selected ? (
        <div className="input flex items-center justify-between gap-2" aria-invalid={invalid}>
          <span className="truncate font-medium">{selected.label}</span>
          <button type="button" className="text-muted hover:text-danger" aria-label="Quitar selección" onClick={() => choose(null)}>
            <X size={15} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            id={id}
            className="input pl-8"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-invalid={invalid}
            value={term}
            placeholder={placeholder ?? t("Buscar…")}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setTerm(e.target.value);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter" && open && results[active]) {
                e.preventDefault();
                choose(results[active]);
              } else if (e.key === "Escape") setOpen(false);
            }}
          />
        </div>
      )}
      {open && !selected && (
        <ul id={listId} role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-line bg-surface p-1 shadow-[var(--shadow-lg)]">
          {loading && results.length === 0 && <li className="px-3 py-2 text-sm text-muted">{t("Buscando…")}</li>}
          {!loading && results.length === 0 && <li className="px-3 py-2 text-sm text-muted">{t("Sin resultados")}</li>}
          {results.map((r, i) => (
            <li
              key={r.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(r);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer rounded-md px-3 py-2 ${i === active ? "bg-brand-soft" : ""}`}
            >
              <p className="text-sm font-semibold">{r.label}</p>
              {r.sub && <p className="text-xs text-muted">{r.sub}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
