"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { CalendarDays, GripVertical } from "lucide-react";
import { moveOpportunityStage } from "@/lib/records/actions";
import type { StageRow } from "@/lib/records/data";
import { formatCompactCurrency, formatCurrency, formatDate, todayISO } from "@/lib/format";
import { LossDialog } from "./LossDialog";

export type KanbanCard = {
  id: string;
  name: string;
  amount: number;
  close_date: string;
  stage_id: string;
  probability: number;
  account: { id: string; name: string } | null;
  owner: { full_name: string; email: string } | null;
  canEdit: boolean;
};

export function Kanban({ stages, cards: initial }: { stages: StageRow[]; cards: KanbanCard[] }) {
  const [pending, start] = useTransition();
  const [cards, moveCard] = useOptimistic(initial, (state, { id, stageId }: { id: string; stageId: string }) =>
    state.map((c) => (c.id === id ? { ...c, stage_id: stageId } : c)),
  );
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingLoss, setPendingLoss] = useState<{ id: string; stageId: string } | null>(null);
  const today = todayISO();

  const doMove = (id: string, stageId: string, lossReason?: string) => {
    const card = cards.find((c) => c.id === id);
    if (!card || card.stage_id === stageId) return;
    setError(null);
    start(async () => {
      moveCard({ id, stageId });
      const res = await moveOpportunityStage(id, stageId, lossReason);
      if (res.message) setError(res.message);
    });
  };

  const requestMove = (id: string, stageId: string) => {
    const stage = stages.find((s) => s.id === stageId);
    if (stage?.category === "lost") setPendingLoss({ id, stageId });
    else doMove(id, stageId);
  };

  return (
    <div>
      {error && <p className="mb-2 rounded-lg bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      <div className="flex gap-3 overflow-x-auto pb-3" aria-busy={pending}>
        {stages.map((stage) => {
          const column = cards.filter((c) => c.stage_id === stage.id);
          const total = column.reduce((s, c) => s + Number(c.amount), 0);
          const closedTone = stage.category === "won" ? "border-t-success" : stage.category === "lost" ? "border-t-danger" : "";
          return (
            <section
              key={stage.id}
              aria-label={stage.name}
              onDragOver={(e) => { e.preventDefault(); setOver(stage.id); }}
              onDragLeave={() => setOver((o) => (o === stage.id ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain") || dragId;
                setOver(null);
                setDragId(null);
                if (id) requestMove(id, stage.id);
              }}
              className={`flex w-72 flex-none flex-col rounded-xl border border-t-4 border-line bg-surface-2 ${closedTone} ${over === stage.id ? "ring-2 ring-[var(--brand)]" : ""}`}
              style={stage.category === "open" ? { borderTopColor: stage.color } : undefined}
            >
              <header className="px-3 pb-2 pt-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="truncate text-sm font-medium">{stage.name}</h2>
                  <span className="badge">{column.length}</span>
                </div>
                <p className="num text-xs font-semibold text-muted">{formatCompactCurrency(total)} · {stage.probability}%</p>
              </header>
              <ul className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2" style={{ maxHeight: "calc(100dvh - 17rem)" }}>
                {column.map((card) => {
                  const late = stage.category === "open" && card.close_date < today;
                  return (
                    <li
                      key={card.id}
                      draggable={card.canEdit}
                      onDragStart={(e) => { e.dataTransfer.setData("text/plain", card.id); e.dataTransfer.effectAllowed = "move"; setDragId(card.id); }}
                      onDragEnd={() => setDragId(null)}
                      className={`card group p-3 ${card.canEdit ? "cursor-grab active:cursor-grabbing" : ""} ${dragId === card.id ? "opacity-50" : ""}`}
                    >
                      <div className="flex items-start gap-1.5">
                        {card.canEdit && <GripVertical size={14} className="mt-0.5 flex-none text-muted opacity-0 group-hover:opacity-100" />}
                        <Link href={`/oportunidades/${card.id}`} className="link min-w-0 flex-1 text-sm leading-snug">{card.name}</Link>
                      </div>
                      {card.account && <p className="mt-1 truncate text-xs text-muted">{card.account.name}</p>}
                      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                        <span className="num font-semibold" title={formatCurrency(card.amount)}>{formatCompactCurrency(card.amount)}</span>
                        <span className={`inline-flex items-center gap-1 ${late ? "font-semibold text-danger" : "text-muted"}`}>
                          <CalendarDays size={12} /> {formatDate(card.close_date)}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="truncate text-[0.7rem] text-muted">{card.owner?.full_name || card.owner?.email}</span>
                        {card.canEdit && (
                          <select
                            aria-label="Mover a etapa"
                            className="h-7 max-w-32 rounded-md border border-line bg-surface px-1 text-[0.7rem] font-semibold"
                            value={card.stage_id}
                            onChange={(e) => requestMove(card.id, e.target.value)}
                          >
                            {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        )}
                      </div>
                    </li>
                  );
                })}
                {column.length === 0 && <li className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-muted">Arrastra aquí</li>}
              </ul>
            </section>
          );
        })}
      </div>
      <LossDialog
        open={pendingLoss !== null}
        onCancel={() => setPendingLoss(null)}
        onConfirm={(reason) => {
          const p = pendingLoss!;
          setPendingLoss(null);
          doMove(p.id, p.stageId, reason);
        }}
      />
    </div>
  );
}
