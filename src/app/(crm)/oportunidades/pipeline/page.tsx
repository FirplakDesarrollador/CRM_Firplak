import type { Metadata } from "next";
import Link from "next/link";
import { List, Plus } from "lucide-react";
import { Kanban, type KanbanCard } from "@/components/opportunities/Kanban";
import { ObjectIcon } from "@/components/ui/icons";
import { getObjectDef, getPipelines, getUsers } from "@/lib/records/data";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { formatCompactCurrency, addDaysISO, todayISO } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { PipelineFilters } from "./PipelineFilters";

export const metadata: Metadata = { title: "Pipeline" };

export default async function PipelinePage({ searchParams }: PageProps<"/oportunidades/pipeline">) {
  const [user, sp, pipelines, users, oppDef] = await Promise.all([requireUser(), searchParams, getPipelines(), getUsers(), getObjectDef("opportunities")]);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const pipeline = pipelines.find((p) => p.id === one(sp.pipeline)) ?? pipelines.find((p) => p.is_default) ?? pipelines[0];
  const owner = one(sp.owner) || "all";
  const closed = one(sp.closed) || "90";

  if (!pipeline) {
    return <p className="text-muted">No hay pipelines configurados. Crea uno en Configuración → Pipelines y etapas.</p>;
  }

  const supabase = await createClient();
  let query = supabase
    .from("opportunities")
    .select("id, name, amount, close_date, stage_id, probability, is_closed, owner_id, account:accounts!opportunities_account_id_fkey(id, name), owner:profiles!opportunities_owner_id_fkey(full_name, email)")
    .eq("pipeline_id", pipeline.id)
    .order("close_date")
    .limit(1000);
  if (owner === "me") query = query.eq("owner_id", user.id);
  else if (owner !== "all") query = query.eq("owner_id", owner);
  // Las cerradas solo se muestran si cerraron en la ventana elegida.
  query = query.or(`is_closed.eq.false,close_date.gte.${addDaysISO(todayISO(), -Number(closed) || -90)}`);
  const { data } = await query;

  // Permiso de edición por propietario (pocos propietarios distintos): lo decide la base.
  const owners = [...new Set((data ?? []).map((o) => o.owner_id ?? ""))];
  const editable = new Map(
    await Promise.all(
      owners.map(async (ownerId) => {
        const { data: ok } = await supabase.rpc("can_edit_record", {
          p_object: "opportunities",
          p_owner: ownerId || "00000000-0000-0000-0000-000000000000",
        });
        return [ownerId, Boolean(ok)] as const;
      }),
    ),
  );
  const cards: KanbanCard[] = (data ?? []).map((o) => ({
    id: o.id,
    name: o.name,
    amount: Number(o.amount),
    close_date: o.close_date,
    stage_id: o.stage_id,
    probability: o.probability,
    account: o.account,
    owner: o.owner,
    canEdit: editable.get(o.owner_id ?? "") ?? false,
  }));
  const openCards = (data ?? []).filter((o) => !o.is_closed);
  const openTotal = openCards.reduce((s, o) => s + Number(o.amount), 0);
  const weighted = openCards.reduce((s, o) => s + (Number(o.amount) * o.probability) / 100, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ObjectIcon object="opportunities" />
          <div>
            <p className="eyebrow">Pipeline de ventas</p>
            <h1 className="text-xl font-medium">{pipeline.name}</h1>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/oportunidades" className="btn"><List size={16} /> Ver lista</Link>
          {can(user.access, "opportunities", "create") && (
            <Link href={`/oportunidades/nueva?pipeline=${pipeline.id}`} className="btn btn-primary"><Plus size={16} /> Nueva oportunidad</Link>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PipelineFilters
          pipelines={pipelines.map((p) => ({ id: p.id, name: p.name }))}
          users={users.map((u) => ({ id: u.id, name: u.full_name }))}
          pipeline={pipeline.id}
          owner={owner}
          closed={closed}
        />
        <p className="text-sm text-muted">
          {openCards.length} abiertas · <span className="num font-semibold text-ink">{formatCompactCurrency(openTotal)}</span> · ponderado{" "}
          <span className="num font-semibold text-ink">{formatCompactCurrency(weighted)}</span>
        </p>
      </div>
      <Kanban key={`${pipeline.id}-${owner}-${closed}`} stages={pipeline.stages} cards={cards}
        lossReasons={oppDef.fields.find((f) => f.name === "loss_reason")?.options} />
    </div>
  );
}
