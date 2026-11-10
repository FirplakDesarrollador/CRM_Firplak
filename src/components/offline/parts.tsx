"use client";

import { Search } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { go } from "./route";

/** Para buscar sin importar tildes ni mayúsculas. */
export function fold(text: string | null | undefined) {
  return (text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** ¿Alguno de los textos contiene todo lo buscado? */
export function matches(query: string, ...texts: (string | null | undefined)[]) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = texts.map(fold).join(" ");
  return words.every((word) => haystack.includes(word));
}

/** Color del ícono según el tipo de actividad. */
export const TYPE_TONE: Record<string, string> = {
  task: "bg-info-soft text-info",
  call: "bg-success-soft text-success",
  meeting: "bg-accent-soft text-accent",
  email: "bg-brand-soft text-brand",
  note: "bg-surface-3 text-ink-2",
};

export function SearchBox({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">{label}</label>
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
      <input
        id={id}
        type="search"
        className="input pl-9"
        placeholder={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        enterKeyHint="search"
      />
    </div>
  );
}

export function Section({ title, count, action, children }: { title: string; count?: number; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card">
      <div className="card-header">
        <h2 className="card-title">
          {title}
          {count !== undefined && <span className="badge num">{count}</span>}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyRow({ children }: { children: React.ReactNode }) {
  return <li className="px-4 py-8 text-center text-sm text-muted">{children}</li>;
}

/** Nombre de un cliente; si está descargado, lleva a su ficha. */
export function ClientLink({ id, name, known }: { id: string | null; name: string | null; known: boolean }) {
  const t = useT();
  if (!name) return null;
  if (!id || !known) return <span>{name}</span>;
  return (
    <button type="button" className="link text-left" onClick={() => go({ v: "clientes", c: id }, true)} aria-label={`${t("Ver cliente")}: ${name}`}>
      {name}
    </button>
  );
}
