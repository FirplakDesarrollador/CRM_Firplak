import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { PasswordForm, PreferencesForm, ProfileForm } from "./forms";
import { ACTION_LABELS, OBJECT_ACTIONS, PERMISSION_OBJECTS } from "@/lib/permissions";
import { OBJECTS } from "@/lib/objects";

import { Tr } from "@/components/ui/Tr";
import { DefaultTeam } from "@/components/teams/DefaultTeam";
import { McpSettings } from "@/components/mcp/McpSettings";
export const metadata: Metadata = { title: "Mis preferencias" };

const TABS = [
  { key: "preferencias", label: "Preferencias" },
  { key: "perfil", label: "Mi perfil" },
  { key: "equipo", label: "Mi equipo" },
  { key: "ia", label: "Asistentes de IA" },
  { key: "seguridad", label: "Seguridad" },
  { key: "permisos", label: "Mis permisos" },
];

export default async function PreferencesPage({ searchParams }: PageProps<"/preferencias">) {
  const [user, sp] = await Promise.all([requireUser(), searchParams]);
  const tab = TABS.some((t) => t.key === sp.tab) ? String(sp.tab) : "preferencias";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-medium"><Tr>Configuración personal</Tr></h1>
      <div className="card">
        <div role="tablist" className="flex overflow-x-auto border-b border-line px-4">
          {TABS.map((t) => (
            <Link key={t.key} role="tab" href={`/preferencias?tab=${t.key}`} aria-selected={tab === t.key} className="tab"><Tr>{t.label}</Tr></Link>
          ))}
        </div>
        {tab === "preferencias" && <PreferencesForm prefs={user.preferences} />}
        {tab === "perfil" && <ProfileForm fullName={user.fullName} title={user.title} phone={user.phone} email={user.email} />}
        {tab === "equipo" && <DefaultTeam userId={user.id} preferences={user.preferences as unknown as Record<string, unknown>} />}
        {tab === "ia" && <McpSettings user={user} />}
        {tab === "seguridad" && <PasswordForm />}
        {tab === "permisos" && (
          <div className="space-y-3 p-4">
            <p className="text-sm">
              Perfil: <strong>{user.access.profile ?? "Sin perfil"}</strong>{user.roleName && <> <Tr>· Rol:</Tr> <strong>{user.roleName}</strong></>}
              {user.access.isAdmin && <span className="badge badge-accent ml-2"><Tr>Administrador</Tr></span>}
            </p>
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th><Tr>Objeto</Tr></th>{OBJECT_ACTIONS.map((a) => <th key={a} className="text-center">{ACTION_LABELS[a]}</th>)}</tr></thead>
                <tbody>
                  {PERMISSION_OBJECTS.map((o) => (
                    <tr key={o}>
                      <td className="font-semibold">{OBJECTS[o].plural}</td>
                      {OBJECT_ACTIONS.map((a) => {
                        const ok = user.access.isAdmin || user.access.permissions[o]?.[a];
                        return <td key={a} className={`text-center font-semibold ${ok ? "text-success" : "text-muted"}`}>{ok ? "✓" : "—"}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
