"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Check, Trophy, XCircle } from "lucide-react";
import { moveOpportunityStage } from "@/lib/records/actions";
import type { StageRow } from "@/lib/records/data";
import { LossDialog } from "./LossDialog";

/** Ruta de etapas de la oportunidad: clic en una etapa para avanzar o retroceder. */
export function StagePath({ opportunityId, stages, currentStageId, canEdit }: {
  opportunityId: string; stages: StageRow[]; currentStageId: string; canEdit: boolean;
}) {
  const [pending, start] = useTransition();
  const [stageId, setStageId] = useOptimistic(currentStageId);
  const [error, setError] = useState<string | null>(null);
  const [askLoss, setAskLoss] = useState<string | null>(null);

  const open = stages.filter((s) => s.category === "open");
  const won = stages.find((s) => s.category === "won");
  const lost = stages.find((s) => s.category === "lost");
  const current = stages.find((s) => s.id === stageId);
  const currentIndex = open.findIndex((s) => s.id === stageId);
  const closed = current?.category !== "open";

  const move = (id: string, lossReason?: string) => {
    setError(null);
    start(async () => {
      setStageId(id);
      const res = await moveOpportunityStage(opportunityId, id, lossReason);
      if (res.message) setError(res.message);
    });
  };

  return (
    <div className="border-t border-line px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <ol className="flex min-w-0 flex-1 overflow-x-auto rounded-full bg-surface-3 p-1" aria-label="Etapas">
          {open.map((s, i) => {
            const isCurrent = s.id === stageId;
            const isDone = !closed && i < currentIndex;
            return (
              <li key={s.id} className="min-w-28 flex-1">
                <button
                  type="button"
                  disabled={!canEdit || pending || isCurrent}
                  onClick={() => move(s.id)}
                  title={`${s.name} · ${s.probability}%`}
                  className={`flex h-8 w-full items-center justify-center gap-1 truncate rounded-full px-3 text-xs font-semibold transition ${
                    isCurrent
                      ? "bg-brand text-[var(--brand-contrast)]"
                      : isDone || (closed && current?.category === "won")
                        ? "bg-brand-soft text-brand-strong"
                        : "text-muted hover:bg-surface hover:text-ink"
                  } disabled:cursor-default`}
                >
                  {(isDone || (closed && current?.category === "won")) && <Check size={13} />}
                  <span className="truncate">{s.name}</span>
                </button>
              </li>
            );
          })}
        </ol>
        {canEdit && (
          <div className="flex gap-2">
            {won && (
              <button type="button" className={`btn btn-sm ${current?.id === won.id ? "btn-primary" : ""}`} disabled={pending || current?.id === won.id} onClick={() => move(won.id)}>
                <Trophy size={14} /> {current?.id === won.id ? "Ganada" : "Marcar ganada"}
              </button>
            )}
            {lost && (
              <button type="button" className="btn btn-sm btn-danger" disabled={pending || current?.id === lost.id} onClick={() => setAskLoss(lost.id)}>
                <XCircle size={14} /> {current?.id === lost.id ? "Perdida" : "Marcar perdida"}
              </button>
            )}
          </div>
        )}
      </div>
      {error && <p className="error-text">{error}</p>}
      <LossDialog
        open={askLoss !== null}
        onCancel={() => setAskLoss(null)}
        onConfirm={(reason) => {
          const id = askLoss!;
          setAskLoss(null);
          move(id, reason);
        }}
      />
    </div>
  );
}
