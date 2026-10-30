import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasServiceRole } from "@/lib/supabase/admin";
import { ActionForm } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { canSystem } from "@/lib/permissions";
import { formatDate, initials } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { inviteUser, updateUser } from "../actions";

export const metadata: Metadata = { title: "Usuarios" };

export default async function UsersPage() {
  const me = await requireUser();
  if (!canSystem(me.access, "manage_users")) redirect("/configuracion");
  const supabase = await createClient();
  const [{ data: users }, { data: roles }, { data: profiles }] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, title, role_id, permission_profile_id, manager_id, is_active, created_at").order("full_name"),
    supabase.from("roles").select("id, name").order("name"),
    supabase.from("permission_profiles").select("id, name, is_default").order("name"),
  ]);

  return (
    <>
      <h1 className="text-xl font-medium">Usuarios</h1>
      {hasServiceRole() && (
        <section className="card">
          <div className="card-header"><h2 className="card-title">Invitar usuario</h2></div>
          <ActionForm action={inviteUser} resetOnSuccess className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto] xl:items-end">
            <div><label className="label" htmlFor="inv-name">Nombre</label><input id="inv-name" name="full_name" className="input" /></div>
            <div><label className="label" htmlFor="inv-email">Correo</label><input id="inv-email" name="email" type="email" className="input" required /></div>
            <div>
              <label className="label" htmlFor="inv-profile">Perfil</label>
              <select id="inv-profile" name="permission_profile_id" className="select" defaultValue={profiles?.find((p) => p.is_default)?.id}>
                {(profiles ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="inv-role">Rol</label>
              <select id="inv-role" name="role_id" className="select" defaultValue="">
                <option value="">— Sin rol —</option>
                {(roles ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <SubmitButton pendingText="Enviando…">Enviar invitación</SubmitButton>
          </ActionForm>
        </section>
      )}
      <section className="card overflow-hidden">
        <div className="card-header"><h2 className="card-title">Equipo <span className="badge">{users?.length ?? 0}</span></h2></div>
        <ul className="divide-y divide-[var(--border)]">
          {(users ?? []).map((u) => (
            <li key={u.id} className="p-4">
              <ActionForm action={updateUser.bind(null, u.id)} className="grid gap-3 lg:grid-cols-[minmax(12rem,1.3fr)_1fr_1fr_1fr_1fr_auto] lg:items-end">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="avatar">{initials(u.full_name || u.email)}</span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{u.full_name || u.email}{u.id === me.id && <span className="badge ml-1.5">Tú</span>}</p>
                    <p className="truncate text-xs text-muted">{u.email} · desde {formatDate(u.created_at)}</p>
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor={`t-${u.id}`}>Cargo</label>
                  <input id={`t-${u.id}`} name="title" className="input" defaultValue={u.title ?? ""} />
                </div>
                <div>
                  <label className="label" htmlFor={`r-${u.id}`}>Rol</label>
                  <select id={`r-${u.id}`} name="role_id" className="select" defaultValue={u.role_id ?? ""}>
                    <option value="">— Sin rol —</option>
                    {(roles ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor={`p-${u.id}`}>Perfil</label>
                  <select id={`p-${u.id}`} name="permission_profile_id" className="select" defaultValue={u.permission_profile_id ?? ""}>
                    <option value="">— Sin perfil —</option>
                    {(profiles ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor={`m-${u.id}`}>Jefe directo</label>
                  <select id={`m-${u.id}`} name="manager_id" className="select" defaultValue={u.manager_id ?? ""}>
                    <option value="">—</option>
                    {(users ?? []).filter((x) => x.id !== u.id).map((x) => <option key={x.id} value={x.id}>{x.full_name || x.email}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-sm font-semibold">
                    <input type="checkbox" name="is_active" defaultChecked={u.is_active} className="accent-[var(--brand)]" /> Activo
                  </label>
                  <SubmitButton className="btn btn-sm" pendingText="…">Guardar</SubmitButton>
                </div>
              </ActionForm>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
