import { CheckCircle2, Lock, Send, Undo2, XCircle } from "lucide-react";
import { ActionForm } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Fmt } from "@/components/ui/Fmt";
import { Tr } from "@/components/ui/Tr";
import { decideApproval, recallApproval, submitForApproval } from "@/lib/approvals/actions";
import type { ApprovalRequest } from "@/lib/approvals/server";
import type { ObjectKey } from "@/lib/objects";

/**
 * Franja de aprobación bajo la cabecera de la ficha: estado de la solicitud pendiente con
 * sus acciones (aprobar, rechazar, retirar), o el botón para enviar a aprobación.
 */
export function ApprovalBar({
  object, recordId, path, requests, process, canSubmit, userId, isAdmin,
}: {
  object: ObjectKey;
  recordId: string;
  path: string;
  requests: ApprovalRequest[];
  process: { id: string; name: string } | null;
  canSubmit: boolean;
  userId: string;
  isAdmin: boolean;
}) {
  const pending = requests.find((r) => r.status === "pending");
  const last = requests.find((r) => r.status === "approved" || r.status === "rejected");

  if (pending) {
    const canDecide = pending.approver_id === userId || isAdmin;
    const canRecall = pending.submitted_by === userId || isAdmin;
    return (
      <div className="border-t border-line bg-[var(--warning-soft)] px-5 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 text-sm">
            <p className="flex items-center gap-1.5 font-semibold">
              {pending.lock_record && <Lock size={15} strokeWidth={1.5} aria-hidden />}
              <Tr>En aprobación</Tr> · {pending.process_name}
              {pending.current_step_name && <span className="badge badge-warning ml-1"><Tr>Paso</Tr> {pending.current_step} · {pending.current_step_name}</span>}
            </p>
            <p className="text-xs text-muted">
              <Tr>Enviada por</Tr> {pending.submitter?.full_name ?? "—"} · <Fmt datetime={pending.submitted_at} /> · <Tr>Aprobador:</Tr>{" "}
              <span className="font-semibold text-ink-2">{pending.approver?.full_name ?? "—"}</span>
            </p>
            {pending.submit_comment && <p className="mt-1 text-sm">“{pending.submit_comment}”</p>}
            {(pending.steps ?? []).filter((s) => s.status === "approved").sort((a, b) => a.step_order - b.step_order).map((s) => (
              <p key={s.id} className="mt-1 flex items-center gap-1 text-xs text-muted">
                <CheckCircle2 size={13} strokeWidth={1.5} className="text-success" aria-hidden />
                {s.step_name}: <Tr>aprobado por</Tr> {s.decider?.full_name ?? "—"}{s.comment && <> · “{s.comment}”</>}
              </p>
            ))}
          </div>
          {canRecall && !canDecide && (
            <ActionForm action={recallApproval.bind(null, pending.id, path)} className="flex flex-col items-end gap-1">
              <SubmitButton className="btn btn-sm" pendingText="Retirando…"><Undo2 size={14} /> <Tr>Retirar solicitud</Tr></SubmitButton>
            </ActionForm>
          )}
        </div>
        {canDecide && (
          <ActionForm action={decideApproval.bind(null, pending.id, path)} className="mt-3 flex flex-wrap items-end gap-2">
            <div className="min-w-[14rem] flex-1">
              <label className="label" htmlFor={`ap-${pending.id}`}><Tr>Comentario (obligatorio para rechazar)</Tr></label>
              <input id={`ap-${pending.id}`} name="comment" className="input" />
            </div>
            <SubmitButton name="decision" value="approve" className="btn btn-primary"><CheckCircle2 size={15} /> <Tr>Aprobar</Tr></SubmitButton>
            <SubmitButton name="decision" value="reject" className="btn btn-danger"><XCircle size={15} /> <Tr>Rechazar</Tr></SubmitButton>
          </ActionForm>
        )}
        {canDecide && canRecall && (
          <ActionForm action={recallApproval.bind(null, pending.id, path)} className="mt-2 flex flex-col items-end gap-1">
            <SubmitButton className="btn btn-ghost btn-sm" pendingText="Retirando…"><Undo2 size={14} /> <Tr>Retirar solicitud</Tr></SubmitButton>
          </ActionForm>
        )}
      </div>
    );
  }

  if (!canSubmit && !last) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
      {last ? (
        <p className="flex min-w-0 items-center gap-1.5 text-sm">
          {last.status === "approved"
            ? <CheckCircle2 size={16} strokeWidth={1.5} className="text-success" aria-hidden />
            : <XCircle size={16} strokeWidth={1.5} className="text-danger" aria-hidden />}
          <span>
            <span className="font-semibold"><Tr>{last.status === "approved" ? "Aprobada" : "Rechazada"}</Tr></span>
            {" · "}{last.process_name} · {last.decider?.full_name ?? "—"} · {last.decided_at && <Fmt datetime={last.decided_at} />}
            {last.decision_comment && <span className="text-muted"> · “{last.decision_comment}”</span>}
          </span>
        </p>
      ) : <span />}
      {canSubmit && process && (
        <ActionForm action={submitForApproval.bind(null, object, recordId)} className="flex flex-wrap items-end justify-end gap-2">
          <div>
            <label className="label" htmlFor={`as-${recordId}`}><Tr>Requiere aprobación:</Tr> {process.name}</label>
            <input id={`as-${recordId}`} name="comment" className="input h-9 w-64 max-w-full" placeholder="Comentario para el aprobador (opcional)" />
          </div>
          <SubmitButton className="btn btn-primary" pendingText="Enviando…"><Send size={15} /> <Tr>Enviar a aprobación</Tr></SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
