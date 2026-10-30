"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Trash2, UserPlus } from "lucide-react";
import { addCampaignMember, removeCampaignMember, setMemberStatus } from "@/lib/records/phase2-actions";
import { LookupInput } from "@/components/records/LookupInput";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { CAMPAIGN_MEMBER_STATUSES } from "@/lib/objects/picklists";
import type { FormState } from "@/lib/records/form";

export type Member = {
  id: string;
  status: string;
  lead: { id: string; full_name: string; company: string } | null;
  contact: { id: string; full_name: string; account: { name: string } | null } | null;
};

function MemberRow({ m, canEdit }: { m: Member; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [, remove] = useActionState(removeCampaignMember.bind(null, m.id), {} as FormState);
  const target = m.contact
    ? { href: `/contactos/${m.contact.id}`, name: m.contact.full_name, sub: m.contact.account?.name ?? "", kind: "Contacto" }
    : { href: `/prospectos/${m.lead?.id}`, name: m.lead?.full_name ?? "", sub: m.lead?.company ?? "", kind: "Prospecto" };
  return (
    <li className={`flex flex-wrap items-center gap-3 px-4 py-2.5 ${pending ? "opacity-60" : ""}`}>
      <div className="min-w-48 flex-1">
        <Link href={target.href} className="link">{target.name}</Link>
        <p className="text-xs text-muted">{target.kind} · {target.sub}</p>
      </div>
      {canEdit ? (
        <select aria-label="Estado del miembro" className="select h-8 w-40 text-xs" defaultValue={m.status}
          onChange={(e) => {
            const value = e.target.value;
            start(async () => {
              const res = await setMemberStatus(m.id, value);
              setError(res.message ?? null);
            });
          }}>
          {CAMPAIGN_MEMBER_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      ) : (
        <span className="badge">{m.status}</span>
      )}
      {canEdit && (
        <form action={remove}>
          <button type="submit" className="btn btn-sm btn-ghost text-danger" aria-label="Quitar de la campaña"
            onClick={(e) => { if (!confirm("¿Quitar de la campaña?")) e.preventDefault(); }}>
            <Trash2 size={14} />
          </button>
        </form>
      )}
      {error && <p className="error-text basis-full">{error}</p>}
    </li>
  );
}

export function Members({ campaignId, members, canEdit }: { campaignId: string; members: Member[]; canEdit: boolean }) {
  const [state, action] = useActionState(addCampaignMember.bind(null, campaignId), {} as FormState);
  const [kind, setKind] = useState<"contacts" | "leads">("contacts");
  return (
    <section className="card overflow-hidden">
      <div className="card-header"><h2 className="card-title">Miembros de la campaña <span className="badge">{members.length}</span></h2></div>
      <ul className="divide-y divide-[var(--border)]">
        {members.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">Aún no hay miembros.</li>}
        {members.map((m) => <MemberRow key={m.id} m={m} canEdit={canEdit} />)}
      </ul>
      {canEdit && (
        <form action={action} className="grid gap-3 border-t border-line bg-surface-2 p-4 md:grid-cols-[9rem_minmax(0,1fr)_10rem_auto] md:items-end">
          <div>
            <label className="label" htmlFor="member-kind">Agregar</label>
            <select id="member-kind" className="select" value={kind} onChange={(e) => setKind(e.target.value as "contacts" | "leads")}>
              <option value="contacts">Contacto</option>
              <option value="leads">Prospecto</option>
            </select>
          </div>
          <div>
            <span className="label">{kind === "contacts" ? "Contacto" : "Prospecto"}</span>
            <LookupInput key={`${kind}-${state.values?.nonce ?? ""}`} name={kind === "contacts" ? "contact_id" : "lead_id"} object={kind} />
          </div>
          <div>
            <label className="label" htmlFor="member-status">Estado</label>
            <select id="member-status" name="status" className="select" defaultValue="Enviado">
              {CAMPAIGN_MEMBER_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <SubmitButton pendingText="Agregando…"><UserPlus size={15} /> Agregar</SubmitButton>
          {state.message && <p className={`md:col-span-4 text-xs ${state.ok ? "text-success" : "text-danger"}`}>{state.message}</p>}
        </form>
      )}
    </section>
  );
}
