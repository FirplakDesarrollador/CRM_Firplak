"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n/client";

export function PipelineFilters({ pipelines, users, pipeline, owner, closed }: {
  pipelines: { id: string; name: string; channel?: string | null }[];
  users: { id: string; name: string }[];
  pipeline: string;
  owner: string;
  closed: string;
}) {
  const router = useRouter();
  const t = useT();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (key: string, value: string) => {
    const qs = new URLSearchParams(params);
    qs.set(key, value);
    router.push(`${pathname}?${qs}`);
  };
  return (
    <div className="flex flex-wrap gap-2">
      <select aria-label="Pipeline" className="select w-auto" value={pipeline} onChange={(e) => set("pipeline", e.target.value)}>
        {pipelines.map((p) => <option key={p.id} value={p.id}>{p.channel ? `${p.channel} · ${t(p.name)}` : t(p.name)}</option>)}
      </select>
      <select aria-label="Propietario" className="select w-auto" value={owner} onChange={(e) => set("owner", e.target.value)}>
        <option value="all">{t("Todo el equipo")}</option>
        <option value="me">{t("Mis oportunidades")}</option>
        {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select>
      <select aria-label="Cerradas" className="select w-auto" value={closed} onChange={(e) => set("closed", e.target.value)}>
        <option value="30">{t("Cerradas: últimos 30 días")}</option>
        <option value="90">{t("Cerradas: últimos 90 días")}</option>
        <option value="365">{t("Cerradas: último año")}</option>
      </select>
    </div>
  );
}
