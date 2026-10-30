import { Fmt } from "@/components/ui/Fmt";
import { Tr } from "@/components/ui/Tr";
import type { ApprovalRequest } from "@/lib/approvals/server";

export const APPROVAL_STATUS: Record<ApprovalRequest["status"], { label: string; badge: string }> = {
  pending: { label: "Pendiente", badge: "badge-warning" },
  approved: { label: "Aprobada", badge: "badge-success" },
  rejected: { label: "Rechazada", badge: "badge-danger" },
  recalled: { label: "Retirada", badge: "" },
};
const STEP_STATUS: Record<string, { label: string; badge: string }> = {
  ...APPROVAL_STATUS,
  approved: { label: "Aprobado", badge: "badge-success" },
  rejected: { label: "Rechazado", badge: "badge-danger" },
  recalled: { label: "Retirado", badge: "" },
  skipped: { label: "Omitido", badge: "" },
};

/** Historial de solicitudes de aprobación de un registro. */
export function ApprovalHistory({ requests }: { requests: ApprovalRequest[] }) {
  return (
    <div className="card overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th><Tr>Proceso</Tr></th>
            <th><Tr>Estado</Tr></th>
            <th><Tr>Enviada</Tr></th>
            <th><Tr>Aprobador</Tr></th>
            <th><Tr>Decisión</Tr></th>
            <th><Tr>Comentarios</Tr></th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id}>
              <td className="font-medium">{r.process_name}</td>
              <td><span className={`badge ${APPROVAL_STATUS[r.status].badge}`}><Tr>{APPROVAL_STATUS[r.status].label}</Tr></span></td>
              <td className="whitespace-nowrap">{r.submitter?.full_name ?? "—"}<span className="block text-xs text-muted"><Fmt datetime={r.submitted_at} /></span></td>
              <td>{r.approver?.full_name ?? "—"}</td>
              <td className="whitespace-nowrap">
                {r.decided_at ? <>{r.decider?.full_name ?? "—"}<span className="block text-xs text-muted"><Fmt datetime={r.decided_at} /></span></> : "—"}
              </td>
              <td className="text-sm">
                {r.submit_comment && <p>“{r.submit_comment}”</p>}
                {r.decision_comment && <p className="text-muted">↳ “{r.decision_comment}”</p>}
                {(r.steps?.length ?? 0) > 1 && (
                  <ol className="mt-1 space-y-0.5 text-xs">
                    {[...r.steps].sort((a, b) => a.step_order - b.step_order).map((s) => (
                      <li key={s.id} className="flex flex-wrap items-center gap-1">
                        <span className="text-muted">{s.step_order}. {s.step_name}</span>
                        <span className={`badge ${STEP_STATUS[s.status]?.badge ?? ""}`}><Tr>{STEP_STATUS[s.status]?.label ?? s.status}</Tr></span>
                        {s.decider?.full_name && <span className="text-muted">{s.decider.full_name}</span>}
                        {s.comment && <span className="text-muted">· “{s.comment}”</span>}
                      </li>
                    ))}
                  </ol>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
