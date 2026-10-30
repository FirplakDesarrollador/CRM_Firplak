import { Trash2, UserPlus, Users } from "lucide-react";
import { ActionForm, ConfirmSubmit } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Tr } from "@/components/ui/Tr";
import { getUsers } from "@/lib/records/data";
import { getT, getValueLabel } from "@/lib/i18n/server";
import { canManageTeam, getTeam, getTeamRoles } from "@/lib/teams/server";
import { addDefaultTeam, addTeamMember, removeTeamMember, updateTeamMember } from "@/lib/teams/actions";
import { ACCESS_LABELS, ACCOUNT_EXTRA_ACCESS, type Access, type TeamMember, type TeamObject } from "@/lib/teams/config";
import type { T } from "@/lib/i18n";

const TITLES: Record<TeamObject, string> = { accounts: "Equipo de la cuenta", opportunities: "Equipo de la oportunidad" };
const MAIN_ACCESS: Record<TeamObject, string> = { accounts: "Cuenta", opportunities: "Acceso" };

/** Rejilla para los selectores (con `extra` columnas adelante, p. ej. la persona; `narrow` en páginas angostas). */
export function teamGrid(object: TeamObject, extra = 0, narrow = false) {
  const cols = (object === "accounts" ? 5 : 2) + extra;
  if (narrow) return `grid min-w-0 flex-1 gap-2 sm:grid-cols-2 ${cols === 2 ? "md:grid-cols-2" : "md:grid-cols-3"}`;
  return `grid min-w-0 flex-1 gap-2 sm:grid-cols-2 ${cols >= 5 ? "lg:grid-cols-3" : ""} ${{ 2: "xl:grid-cols-2", 3: "xl:grid-cols-3", 5: "xl:grid-cols-5", 6: "xl:grid-cols-6" }[cols] ?? ""}`;
}

/** Selectores de rol y niveles de acceso (compartidos por la ficha y el equipo predeterminado). */
export function TeamMemberFields({ object, idPrefix, member, roles, t, value }: {
  object: TeamObject; idPrefix: string; member?: TeamMember; roles: string[]; t: T; value: T;
}) {
  const levels = (name: string, label: string, current: Access | undefined, allowNone: boolean) => (
    <div key={name}>
      <label className="label" htmlFor={`${idPrefix}-${name}`}>{t(label)}</label>
      <select id={`${idPrefix}-${name}`} name={name} className="select" defaultValue={current ?? (allowNone ? "none" : "read")}>
        {(Object.keys(ACCESS_LABELS) as Access[]).filter((a) => allowNone || a !== "none").map((a) => (
          <option key={a} value={a}>{t(ACCESS_LABELS[a])}</option>
        ))}
      </select>
    </div>
  );
  const roleOptions = member && !roles.includes(member.team_role) ? [member.team_role, ...roles] : roles;
  return (
    <>
      <div>
        <label className="label" htmlFor={`${idPrefix}-role`}>{t("Rol en el equipo")}</label>
        <select id={`${idPrefix}-role`} name="team_role" className="select" defaultValue={member?.team_role ?? roles[0]}>
          {roleOptions.map((r) => <option key={r} value={r}>{value(r)}</option>)}
        </select>
      </div>
      {levels("access", MAIN_ACCESS[object], member?.access, false)}
      {object === "accounts" && ACCOUNT_EXTRA_ACCESS.map((x) => levels(x.key, x.label, member?.[x.key], true))}
    </>
  );
}

function accessSummary(object: TeamObject, m: TeamMember, t: T) {
  const parts = [`${t(MAIN_ACCESS[object])}: ${t(ACCESS_LABELS[m.access])}`];
  if (object === "accounts") {
    for (const x of ACCOUNT_EXTRA_ACCESS) if (m[x.key] && m[x.key] !== "none") parts.push(`${t(x.label)}: ${t(ACCESS_LABELS[m[x.key]!])}`);
  }
  return parts.join(" · ");
}

/** Equipo de una cuenta u oportunidad: el propietario y los miembros con su rol y acceso. */
export async function TeamCard({ object, recordId, ownerId, ownerName }: {
  object: TeamObject; recordId: string; ownerId: string | null; ownerName: string | null;
}) {
  const [members, canManage, roles, users, t, value] = await Promise.all([
    getTeam(object, recordId), canManageTeam(object, recordId), getTeamRoles(), getUsers(), getT(), getValueLabel(),
  ]);
  const taken = new Set([ownerId, ...members.map((m) => m.user_id)]);
  const candidates = users.filter((u) => u.is_active && !taken.has(u.id));

  return (
    <section className="card overflow-hidden">
      <div className="card-header flex-wrap gap-2">
        <h2 className="card-title"><Users size={16} /> {t(TITLES[object])} <span className="badge">{members.length}</span></h2>
        {canManage && (
          <ActionForm action={addDefaultTeam.bind(null, object, recordId)} className="flex flex-col items-end">
            <SubmitButton className="btn btn-sm" pendingText="Agregando…"><UserPlus size={14} /> <Tr>Agregar equipo predeterminado</Tr></SubmitButton>
          </ActionForm>
        )}
      </div>
      <ul className="divide-y divide-[var(--border)]">
        <li className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-40 flex-1">
            <p className="font-medium">{ownerName ?? "—"}</p>
            <p className="text-xs text-muted">{t("Propietario")}</p>
          </div>
          <span className="badge badge-brand">{t("Acceso total")}</span>
        </li>
        {members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-end gap-x-3 gap-y-2 px-4 py-3">
            <div className={canManage ? "basis-full" : "min-w-40 flex-1"}>
              <p className="font-medium">{m.user?.full_name || m.user?.email || "—"}</p>
              <p className="text-xs text-muted">
                {canManage ? m.user?.title ?? m.user?.email : <>{value(m.team_role)} · {accessSummary(object, m, t)}</>}
                {m.user && !m.user.is_active && <span className="badge ml-1">{t("Inactivo")}</span>}
              </p>
            </div>
            {canManage && (
              <>
                <ActionForm action={updateTeamMember.bind(null, object, recordId, m.id)} className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
                  <div className={teamGrid(object)}>
                    <TeamMemberFields object={object} idPrefix={`tm-${m.id}`} member={m} roles={roles} t={t} value={value} />
                  </div>
                  <SubmitButton className="btn btn-sm mb-1" pendingText="…"><Tr>Guardar</Tr></SubmitButton>
                </ActionForm>
                <ActionForm action={removeTeamMember.bind(null, object, recordId, m.id)} className="mb-1 flex flex-col items-end">
                  <ConfirmSubmit message={`${t("¿Retirar del equipo a")} ${m.user?.full_name ?? ""}?`}>
                    <Trash2 size={14} /><span className="sr-only"><Tr>Retirar</Tr></span>
                  </ConfirmSubmit>
                </ActionForm>
              </>
            )}
          </li>
        ))}
        {members.length === 0 && (
          <li className="px-4 py-4 text-sm text-muted">
            <Tr>Aún no hay más personas en el equipo.</Tr>{canManage && <> <Tr>Agrega a quienes trabajan este negocio con su rol y nivel de acceso.</Tr></>}
          </li>
        )}
      </ul>
      {canManage && candidates.length > 0 && (
        <ActionForm action={addTeamMember.bind(null, object, recordId)} resetOnSuccess
          className="flex flex-wrap items-end gap-2 border-t border-line bg-surface-2 px-4 py-3">
          <div className={teamGrid(object, 1)}>
            <div>
              <label className="label" htmlFor={`tm-new-${object}-user`}>{t("Agregar persona")}</label>
              <select id={`tm-new-${object}-user`} name="user_id" className="select" required defaultValue="">
                <option value="" disabled>{t("Selecciona…")}</option>
                {candidates.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
            <TeamMemberFields object={object} idPrefix={`tm-new-${object}`} roles={roles} t={t} value={value} />
          </div>
          <SubmitButton className="btn btn-sm btn-primary mb-1" pendingText="Agregando…"><Tr>Agregar</Tr></SubmitButton>
        </ActionForm>
      )}
      <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
        {t(object === "accounts"
          ? "El equipo ve o edita la cuenta y, según el nivel elegido, sus oportunidades (con sus cotizaciones y pedidos en solo lectura), casos y contactos. Nunca puede eliminarlos."
          : "El equipo ve o edita la oportunidad y ve sus cotizaciones y pedidos. Nunca puede eliminarla.")}
      </p>
    </section>
  );
}
