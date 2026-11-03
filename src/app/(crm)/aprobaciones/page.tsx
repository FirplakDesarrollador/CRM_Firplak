import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Undo2, XCircle } from "lucide-react";
import { ActionForm } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ObjectIcon } from "@/components/ui/icons";
import { Fmt } from "@/components/ui/Fmt";
import { Tr } from "@/components/ui/Tr";
import { APPROVAL_STATUS } from "@/components/approvals/ApprovalHistory";
import { createClient } from "@/lib/supabase/server";
import { OBJECTS } from "@/lib/objects";
import { canSystem } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { getT } from "@/lib/i18n/server";
import { decideApproval, recallApproval } from "@/lib/approvals/actions";
import { REQUEST_SELECT, type ApprovalRequest } from "@/lib/approvals/server";

export const metadata: Metadata = { title: "Aprobaciones" };

const recordHref = (r: ApprovalRequest) => `${OBJECTS[r.object]?.path ?? ""}/${r.record_id}`;

export default async function ApprovalsPage() {
  const [user, t] = await Promise.all([requireUser(), getT()]);
  const isAdmin = canSystem(user.access, "manage_users");
  const supabase = await createClient();
  const [{ data: mine }, { data: sent }, { data: others }] = await Promise.all([
    supabase.from("approval_requests").select(REQUEST_SELECT).eq("approver_id", user.id).eq("status", "pending").order("submitted_at"),
    supabase.from("approval_requests").select(REQUEST_SELECT).eq("submitted_by", user.id).order("submitted_at", { ascending: false }).limit(30),
    isAdmin
      ? supabase.from("approval_requests").select(REQUEST_SELECT).eq("status", "pending").neq("approver_id", user.id).order("submitted_at")
      : Promise.resolve({ data: [] }),
  ]);
  const toDecide = (mine ?? []) as unknown as ApprovalRequest[];
  const mySent = (sent ?? []) as unknown as ApprovalRequest[];
  const adminQueue = (others ?? []) as unknown as ApprovalRequest[];

  const recordCell = (r: ApprovalRequest) => (
    <div className="flex min-w-0 items-center gap-2.5">
      <ObjectIcon object={r.object} size={14} />
      <div className="min-w-0">
        <Link href={recordHref(r)} className="link font-medium">{r.record_name ?? t("Registro")}</Link>
        <p className="text-xs text-muted">
          {t(OBJECTS[r.object]?.label ?? r.object)} · {r.process_name}
          {r.status === "pending" && r.current_step_name ? ` · ${t("Paso")} ${r.current_step}: ${r.current_step_name}` : ""}
        </p>
      </div>
    </div>
  );

  const decisionList = (list: ApprovalRequest[], empty: string) => (
    list.length === 0 ? <p className="px-5 py-6 text-sm text-muted"><Tr>{empty}</Tr></p> : (
      <ul className="divide-y divide-[var(--line)]">
        {list.map((r) => (
          <li key={r.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
            <div className="min-w-0 space-y-1">
              {recordCell(r)}
              <p className="text-xs text-muted">
                <Tr>Enviada por</Tr> {r.submitter?.full_name ?? "—"} · <Fmt datetime={r.submitted_at} />
                {r.approver_id !== user.id && <> · <Tr>Aprobador:</Tr> {r.approver?.full_name ?? "—"}</>}
              </p>
              {r.submit_comment && <p className="text-sm">“{r.submit_comment}”</p>}
            </div>
            <ActionForm action={decideApproval.bind(null, r.id, "/aprobaciones")} className="flex flex-wrap items-end gap-2">
              <input name="comment" className="input min-w-[10rem] flex-1" aria-label={t("Comentario")} placeholder={t("Comentario (obligatorio para rechazar)")} />
              <SubmitButton name="decision" value="approve" className="btn btn-primary btn-sm"><CheckCircle2 size={14} /> <Tr>Aprobar</Tr></SubmitButton>
              <SubmitButton name="decision" value="reject" className="btn btn-danger btn-sm"><XCircle size={14} /> <Tr>Rechazar</Tr></SubmitButton>
            </ActionForm>
          </li>
        ))}
      </ul>
    )
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <ObjectIcon object="approvals" size={20} />
        <div>
          <h1 className="text-xl font-medium"><Tr>Bandeja de aprobaciones</Tr></h1>
        </div>
      </div>

      <section className="glass overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-3">
          <h2 className="card-title"><Tr>Pendientes de mi aprobación</Tr></h2>
          <span className={`badge ${toDecide.length ? "badge-warning" : ""}`}>{toDecide.length}</span>
        </div>
        {decisionList(toDecide, "No tienes solicitudes por aprobar.")}
      </section>

      {isAdmin && adminQueue.length > 0 && (
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-3">
            <h2 className="card-title"><Tr>Otras solicitudes pendientes</Tr></h2>
            <span className="text-xs text-muted"><Tr>Como administración puedes decidir por el aprobador.</Tr></span>
          </div>
          {decisionList(adminQueue, "")}
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="border-b border-line px-5 py-3">
          <h2 className="card-title"><Tr>Mis solicitudes</Tr></h2>
        </div>
        {mySent.length === 0 ? <p className="px-5 py-6 text-sm text-muted"><Tr>Aún no has enviado registros a aprobación.</Tr></p> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th><Tr>Registro</Tr></th>
                  <th><Tr>Estado</Tr></th>
                  <th><Tr>Enviada</Tr></th>
                  <th><Tr>Aprobador</Tr></th>
                  <th><Tr>Respuesta</Tr></th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {mySent.map((r) => (
                  <tr key={r.id}>
                    <td>{recordCell(r)}</td>
                    <td><span className={`badge ${APPROVAL_STATUS[r.status].badge}`}><Tr>{APPROVAL_STATUS[r.status].label}</Tr></span></td>
                    <td className="whitespace-nowrap"><Fmt datetime={r.submitted_at} /></td>
                    <td>{r.approver?.full_name ?? "—"}</td>
                    <td className="text-sm">
                      {r.decided_at && r.status !== "recalled" ? <><Fmt datetime={r.decided_at} />{r.decision_comment && <span className="block text-muted">“{r.decision_comment}”</span>}</> : "—"}
                    </td>
                    <td className="text-right">
                      {r.status === "pending" && (
                        <ActionForm action={recallApproval.bind(null, r.id, "/aprobaciones")} className="flex flex-col items-end">
                          <SubmitButton className="btn btn-ghost btn-sm" pendingText="Retirando…"><Undo2 size={14} /> <Tr>Retirar</Tr></SubmitButton>
                        </ActionForm>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
