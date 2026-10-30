"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PERIODS } from "@/lib/periods";
import { useT } from "@/lib/i18n/client";

export function DashboardFilters({ period, from, to, owner, pipeline, users, pipelines, canPickOwner }: {
  period: string; from: string; to: string; owner: string; pipeline: string;
  users: { id: string; name: string }[]; pipelines: { id: string; name: string }[]; canPickOwner: boolean;
}) {
  const router = useRouter();
  const t = useT();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (patch: Record<string, string | null>) => {
    const qs = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? qs.set(k, v) : qs.delete(k)));
    router.push(`${pathname}?${qs}`);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Periodo" className="select w-auto" value={period}
        onChange={(e) => set({ periodo: e.target.value, desde: e.target.value === "custom" ? from : null, hasta: e.target.value === "custom" ? to : null })}>
        {Object.entries(PERIODS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
      </select>
      {period === "custom" && (
        <>
          <input type="date" aria-label="Desde" className="input w-auto" defaultValue={from} onChange={(e) => e.target.value && set({ desde: e.target.value })} />
          <input type="date" aria-label="Hasta" className="input w-auto" defaultValue={to} onChange={(e) => e.target.value && set({ hasta: e.target.value })} />
        </>
      )}
      {canPickOwner && (
        <select aria-label="Asesor" className="select w-auto" value={owner} onChange={(e) => set({ asesor: e.target.value === "all" ? null : e.target.value })}>
          <option value="all">{t("Todo el equipo")}</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      )}
      <select aria-label="Pipeline del embudo" className="select w-auto" value={pipeline} onChange={(e) => set({ pipeline: e.target.value })}>
        {pipelines.map((p) => <option key={p.id} value={p.id}>{t(p.name)}</option>)}
      </select>
    </div>
  );
}
