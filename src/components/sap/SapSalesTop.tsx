"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { AlVer } from "@/components/dashboard/AlVer";
import { Tr } from "@/components/ui/Tr";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";
import { loadSalesGroup, type SalesBranch, type SalesFilters } from "@/lib/sap/sales";

export type SalesGroup = { key: string; name: string; amount: number; prev: number | null; branches: number };

/**
 * Crecimiento frente al periodo de comparación: verde si creció, rojo y negativo si cayó.
 * Sin base para comparar (no vendió antes) dice «Nuevo»; sin datos de comparación, nada.
 */
export function Growth({ amount, prev, basis }: { amount: number; prev: number | null; basis: string }) {
  if (prev === null) return null;
  if (prev <= 0) return amount > 0 ? <span className="badge badge-info shrink-0" title={basis}><Tr>Nuevo</Tr></span> : null;
  const pct = ((amount - prev) / prev) * 100;
  const text = `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct) >= 10 ? Math.round(Math.abs(pct)) : Math.abs(pct).toFixed(1).replace(".", ",")} %`;
  return (
    <span className={`num shrink-0 whitespace-nowrap text-xs font-semibold ${pct < 0 ? "text-danger" : "text-success"}`} title={`${basis}: ${formatCurrency(prev)}`}>
      {text}
    </span>
  );
}

/**
 * Clientes que más compraron, con las sucursales de un mismo cliente sumadas en una sola fila
 * (la gerencia ve el grupo); al abrir la fila se ve cada sucursal con su vendedor (el detalle del asesor).
 */
export function SapSalesTop({ groups, from, to, owner, filters, basis }: {
  groups: SalesGroup[]; from: string; to: string; owner: string | null; filters: SalesFilters; basis: string;
}) {
  const [open, setOpen] = useState<Record<string, SalesBranch[] | "loading">>({});
  const [, start] = useTransition();
  const max = Math.max(1, ...groups.map((g) => g.amount));
  const toggle = (key: string) => {
    if (open[key]) return setOpen(({ [key]: _closed, ...rest }) => rest);
    setOpen((prev) => ({ ...prev, [key]: "loading" }));
    start(async () => {
      const branches = await loadSalesGroup(key, from, to, owner, filters).catch(() => []);
      setOpen((prev) => (prev[key] ? { ...prev, [key]: branches } : prev));
    });
  };
  if (!groups.length) return <p className="py-6 text-center text-sm text-muted"><Tr>Sin ventas en el periodo.</Tr></p>;
  return (
    <AlVer><ul className="space-y-1.5">
      {groups.map((g, i) => {
        const detail = open[g.key];
        return (
          <li key={g.key}>
            <button type="button" onClick={() => toggle(g.key)} aria-expanded={Boolean(detail)}
              className="grid w-full grid-cols-[1.5rem_minmax(0,1fr)_auto_4.5rem] items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-[color-mix(in_srgb,var(--brand)_6%,transparent)]">
              {detail ? <ChevronDown size={15} className="text-muted" /> : <ChevronRight size={15} className="text-muted" />}
              <span className="min-w-0">
                <span className="flex items-baseline gap-2">
                  <span className="num w-5 shrink-0 text-xs text-muted">{i + 1}</span>
                  <span className="truncate text-sm font-medium">{g.name}</span>
                  {g.branches > 1 && <span className="badge shrink-0">{g.branches} <Tr>sucursales</Tr></span>}
                </span>
                <span className="chart-crece-x mt-1 block h-[6px] rounded-full bg-brand" style={{ width: `${Math.max(1.5, (g.amount / max) * 100)}%`, "--i": i } as React.CSSProperties} aria-hidden />
              </span>
              <span className="num whitespace-nowrap text-sm font-semibold" title={formatCurrency(g.amount)}>{formatCompactCurrency(g.amount)}</span>
              <span className="text-right"><Growth amount={g.amount} prev={g.prev} basis={basis} /></span>
            </button>
            {detail === "loading" && <p className="py-1 pl-9 text-xs text-muted"><Tr>Cargando…</Tr></p>}
            {Array.isArray(detail) && (
              <ul className="mb-2 ml-9 space-y-1 border-l border-line pl-3">
                {detail.map((b) => (
                  <li key={b.card_code} className="grid grid-cols-[minmax(0,1fr)_auto_4.5rem] items-baseline gap-2 pr-1 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate">
                        {b.account_id ? <Link href={`/cuentas/${b.account_id}?tab=sap`} className="link">{b.customer_name ?? b.card_code}</Link> : b.customer_name ?? b.card_code}
                      </span>
                      <span className="num block truncate text-xs text-muted">{b.card_code}{b.seller ? ` · ${b.seller}` : ""}</span>
                    </span>
                    <span className="num whitespace-nowrap" title={formatCurrency(b.amount)}>{formatCompactCurrency(b.amount)}</span>
                    <span className="text-right"><Growth amount={b.amount} prev={b.prev} basis={basis} /></span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul></AlVer>
  );
}
