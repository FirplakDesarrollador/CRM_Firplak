import { Trash2 } from "lucide-react";
import { ActionForm, ConfirmSubmit } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Tr } from "@/components/ui/Tr";
import { getUsers } from "@/lib/records/data";
import { getT, getValueLabel } from "@/lib/i18n/server";
import { getDefaultTeam, getTeamRoles } from "@/lib/teams/server";
import { removeDefaultTeamMember, saveDefaultTeamMember, setTeamAutoAdd } from "@/lib/teams/actions";
import type { TeamObject } from "@/lib/teams/config";
import { TeamMemberFields, teamGrid } from "./TeamCard";

const SECTIONS: { object: TeamObject; title: string; hint: string }[] = [
  { object: "opportunities", title: "Equipo predeterminado de oportunidades", hint: "Quienes suelen acompañarte en tus negocios: especificador, soporte técnico, tu gerente…" },
  { object: "accounts", title: "Equipo predeterminado de cuentas", hint: "Quienes atienden contigo tus cuentas: servicio al cliente, ejecutivo de canal…" },
];

/** Mis preferencias → Mi equipo: equipos predeterminados y si se agregan solos al crear. */
export async function DefaultTeam({ userId, preferences }: { userId: string; preferences: Record<string, unknown> }) {
  const [opps, accounts, roles, users, t, value] = await Promise.all([
    getDefaultTeam("opportunities"), getDefaultTeam("accounts"), getTeamRoles(), getUsers(), getT(), getValueLabel(),
  ]);
  const teams = { opportunities: opps, accounts };

  return (
    <div className="space-y-4 p-4">
      <p className="text-sm text-muted">
        <Tr>Tu equipo predeterminado se agrega a los registros que tienes como propietario con «Agregar equipo predeterminado», o solo al crearlos si activas la opción.</Tr>
      </p>
      {SECTIONS.map(({ object, title, hint }) => {
        const members = teams[object];
        const autoAdd = preferences[`team_auto_add_${object}`] === true;
        return (
          <section key={object} className="rounded-[14px] border border-line">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
              <div>
                <h2 className="card-title">{t(title)}</h2>
                <p className="text-xs text-muted">{t(hint)}</p>
              </div>
              <ActionForm action={setTeamAutoAdd.bind(null, object)} className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-sm font-semibold">
                  <input type="checkbox" name="auto_add" defaultChecked={autoAdd} className="accent-[var(--brand)]" />
                  {t("Agregar al crear")}
                </label>
                <SubmitButton className="btn btn-sm" pendingText="…"><Tr>Guardar</Tr></SubmitButton>
              </ActionForm>
            </div>
            <ul className="divide-y divide-[var(--border)]">
              {members.map((m) => (
                <li key={m.id} className="flex flex-wrap items-end gap-2 px-4 py-3">
                  <ActionForm action={saveDefaultTeamMember.bind(null, object)} className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
                    <input type="hidden" name="user_id" value={m.user_id} />
                    <p className="basis-full font-medium">{m.user?.full_name || m.user?.email}</p>
                    <div className={teamGrid(object, 0, true)}>
                      <TeamMemberFields object={object} idPrefix={`dt-${m.id}`} member={m} roles={roles} t={t} value={value} />
                    </div>
                    <SubmitButton className="btn btn-sm mb-1" pendingText="…"><Tr>Guardar</Tr></SubmitButton>
                  </ActionForm>
                  <ActionForm action={removeDefaultTeamMember.bind(null, m.id)} className="mb-1 flex flex-col items-end">
                    <ConfirmSubmit message={`${t("¿Retirar del equipo a")} ${m.user?.full_name ?? ""}?`}>
                      <Trash2 size={14} /><span className="sr-only"><Tr>Retirar</Tr></span>
                    </ConfirmSubmit>
                  </ActionForm>
                </li>
              ))}
              {members.length === 0 && <li className="px-4 py-3 text-sm text-muted"><Tr>Aún no hay personas en este equipo.</Tr></li>}
            </ul>
            <ActionForm action={saveDefaultTeamMember.bind(null, object)} resetOnSuccess
              className="flex flex-wrap items-end gap-2 border-t border-line bg-surface-2 px-4 py-3">
              <div className={teamGrid(object, 1, true)}>
                <div>
                  <label className="label" htmlFor={`dt-new-${object}`}>{t("Agregar persona")}</label>
                  <select id={`dt-new-${object}`} name="user_id" className="select" required defaultValue="">
                    <option value="" disabled>{t("Selecciona…")}</option>
                    {users.filter((u) => u.is_active && u.id !== userId && !members.some((m) => m.user_id === u.id)).map((u) => (
                      <option key={u.id} value={u.id}>{u.full_name}</option>
                    ))}
                  </select>
                </div>
                <TeamMemberFields object={object} idPrefix={`dt-new-${object}`} roles={roles} t={t} value={value} />
              </div>
              <SubmitButton className="btn btn-sm btn-primary mb-1" pendingText="Agregando…"><Tr>Agregar</Tr></SubmitButton>
            </ActionForm>
          </section>
        );
      })}
    </div>
  );
}
