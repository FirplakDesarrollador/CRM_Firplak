import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Fmt } from "@/components/ui/Fmt";
import { Tr } from "@/components/ui/Tr";
import { GRANT_SELECT, GrantTable, TokenTable } from "@/components/mcp/McpSettings";
import { createClient } from "@/lib/supabase/server";
import { canSystem } from "@/lib/permissions";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Asistentes de IA" };

/** Administración: tokens MCP de todos los usuarios y registro de lo que hacen los asistentes. */
export default async function AssistantsPage({ searchParams }: PageProps<"/configuracion/asistentes">) {
  const [me, sp] = await Promise.all([requireUser(), searchParams]);
  if (!canSystem(me.access, "manage_users")) redirect("/configuracion");
  const onlyChanges = sp.cambios === "1";
  const supabase = await createClient();
  let activityQuery = supabase.from("mcp_activity")
    .select("id, tool, object, record_id, summary, is_change, created_at, user:profiles!mcp_activity_user_id_fkey(full_name)")
    .order("created_at", { ascending: false }).limit(100);
  if (onlyChanges) activityQuery = activityQuery.eq("is_change", true);
  const [{ data: tokens }, { data: grants }, { data: activity }] = await Promise.all([
    supabase.from("mcp_tokens")
      .select("id, name, token_prefix, scope, created_at, last_used_at, expires_at, revoked_at, user:profiles!mcp_tokens_user_id_fkey(full_name)")
      .is("grant_id", null).order("created_at", { ascending: false }),
    supabase.from("oauth_grants").select(`${GRANT_SELECT}, user:profiles!oauth_grants_user_id_fkey(full_name)`).order("created_at", { ascending: false }).limit(100),
    activityQuery,
  ]);

  return (
    <>
      <div>
        <h1 className="text-xl font-medium"><Tr>Asistentes de IA</Tr></h1>
        <p className="text-sm text-muted">
          <Tr>Tokens MCP de los usuarios y lo que hacen los asistentes con ellos. El uso se activa por perfil en «Perfiles y permisos» (Usar asistentes de IA y Hacer cambios con asistentes de IA).</Tr>
        </p>
      </div>
      <section className="card overflow-hidden">
        <div className="card-header"><h2 className="card-title"><Tr>Tokens</Tr> <span className="badge">{tokens?.length ?? 0}</span></h2></div>
        <TokenTable tokens={(tokens ?? []) as never} showUser path="/configuracion/asistentes" />
      </section>
      <section className="card overflow-hidden">
        <div className="card-header"><h2 className="card-title"><Tr>Aplicaciones conectadas</Tr> <span className="badge">{grants?.filter((g) => !g.revoked_at).length ?? 0}</span></h2></div>
        <GrantTable grants={(grants ?? []) as never} showUser path="/configuracion/asistentes" />
      </section>
      <section className="card overflow-hidden">
        <div className="card-header">
          <h2 className="card-title"><Tr>Actividad</Tr></h2>
          <a href={onlyChanges ? "/configuracion/asistentes" : "/configuracion/asistentes?cambios=1"} className="btn btn-sm">
            <Tr>{onlyChanges ? "Ver todo" : "Solo cambios"}</Tr>
          </a>
        </div>
        {!activity?.length ? <p className="px-4 py-6 text-sm text-muted"><Tr>Sin actividad todavía.</Tr></p> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th><Tr>Fecha</Tr></th><th><Tr>Usuario</Tr></th><th><Tr>Herramienta</Tr></th><th><Tr>Detalle</Tr></th></tr></thead>
              <tbody>
                {activity.map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap"><Fmt datetime={a.created_at} /></td>
                    <td>{a.user?.full_name ?? "—"}</td>
                    <td><span className={`badge ${a.is_change ? "badge-warning" : ""}`}>{a.tool}</span></td>
                    <td className="max-w-[28rem] truncate text-xs text-muted" title={a.summary ?? ""}>{a.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
