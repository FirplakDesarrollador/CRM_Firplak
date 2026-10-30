import { Ban, Bot } from "lucide-react";
import { ActionForm, ConfirmSubmit } from "@/components/ui/ActionForm";
import { Fmt } from "@/components/ui/Fmt";
import { Tr } from "@/components/ui/Tr";
import { createClient } from "@/lib/supabase/server";
import { canSystem } from "@/lib/permissions";
import { siteUrl } from "@/lib/env";
import { getT } from "@/lib/i18n/server";
import { mcpConfigured } from "@/lib/mcp/auth";
import { revokeMcpToken, revokeOauthGrant } from "@/lib/mcp/actions";
import type { CurrentUser } from "@/lib/session";
import { TokenCreator } from "./TokenCreator";

type Token = { id: string; name: string; token_prefix: string; scope: string; created_at: string; last_used_at: string | null; expires_at: string | null; revoked_at: string | null; user?: { full_name: string } | null };

export function tokenStatus(tk: Token) {
  if (tk.revoked_at) return { label: "Revocado", badge: "" };
  if (tk.expires_at && tk.expires_at < new Date().toISOString()) return { label: "Vencido", badge: "" };
  return { label: "Activo", badge: "badge-success" };
}

/** Tabla de tokens (propios o de todos, para administración) con opción de revocar. */
export async function TokenTable({ tokens, showUser, path }: { tokens: Token[]; showUser?: boolean; path: string }) {
  const t = await getT();
  if (!tokens.length) return <p className="px-4 py-6 text-sm text-muted"><Tr>Aún no hay tokens.</Tr></p>;
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            {showUser && <th><Tr>Usuario</Tr></th>}
            <th><Tr>Nombre</Tr></th><th><Tr>Alcance</Tr></th><th><Tr>Estado</Tr></th><th><Tr>Último uso</Tr></th><th><Tr>Vence</Tr></th><th />
          </tr>
        </thead>
        <tbody>
          {tokens.map((tk) => {
            const st = tokenStatus(tk);
            return (
              <tr key={tk.id}>
                {showUser && <td>{tk.user?.full_name ?? "—"}</td>}
                <td><p className="font-medium">{tk.name}</p><code className="text-xs text-muted">{tk.token_prefix}…</code></td>
                <td>{t(tk.scope === "write" ? "Consulta y cambios" : "Solo consulta")}</td>
                <td><span className={`badge ${st.badge}`}>{t(st.label)}</span></td>
                <td className="whitespace-nowrap">{tk.last_used_at ? <Fmt datetime={tk.last_used_at} /> : "—"}</td>
                <td className="whitespace-nowrap">{tk.expires_at ? <Fmt date={tk.expires_at.slice(0, 10)} /> : t("Nunca")}</td>
                <td className="text-right">
                  {st.label === "Activo" && (
                    <ActionForm action={revokeMcpToken.bind(null, tk.id, path)} className="flex flex-col items-end">
                      <ConfirmSubmit message={t("¿Revocar este token? Los asistentes que lo usan dejarán de tener acceso.")} className="btn btn-sm btn-ghost">
                        <Ban size={14} /> <Tr>Revocar</Tr>
                      </ConfirmSubmit>
                    </ActionForm>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type Grant = { id: string; scope: string; created_at: string; last_used_at: string | null; revoked_at: string | null; client: { name: string } | null; user?: { full_name: string } | null };

/** Aplicaciones conectadas por OAuth (ChatGPT, Claude web…), con opción de desconectarlas. */
export async function GrantTable({ grants, showUser, path }: { grants: Grant[]; showUser?: boolean; path: string }) {
  const t = await getT();
  if (!grants.length) return <p className="px-4 py-6 text-sm text-muted"><Tr>Ninguna aplicación conectada.</Tr></p>;
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            {showUser && <th><Tr>Usuario</Tr></th>}
            <th><Tr>Aplicación</Tr></th><th><Tr>Alcance</Tr></th><th><Tr>Conectada</Tr></th><th><Tr>Último uso</Tr></th><th />
          </tr>
        </thead>
        <tbody>
          {grants.map((g) => (
            <tr key={g.id}>
              {showUser && <td>{g.user?.full_name ?? "—"}</td>}
              <td className="font-medium">{g.client?.name ?? "—"}</td>
              <td>{t(g.scope === "write" ? "Consulta y cambios" : "Solo consulta")}</td>
              <td className="whitespace-nowrap"><Fmt datetime={g.created_at} /></td>
              <td className="whitespace-nowrap">{g.last_used_at ? <Fmt datetime={g.last_used_at} /> : "—"}</td>
              <td className="text-right">
                {g.revoked_at ? <span className="badge">{t("Desconectada")}</span> : (
                  <ActionForm action={revokeOauthGrant.bind(null, g.id, path)} className="flex flex-col items-end">
                    <ConfirmSubmit message={t("¿Desconectar esta aplicación? Dejará de tener acceso al CRM.")} className="btn btn-sm btn-ghost">
                      <Ban size={14} /> <Tr>Desconectar</Tr>
                    </ConfirmSubmit>
                  </ActionForm>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const GRANT_SELECT = "id, scope, created_at, last_used_at, revoked_at, client:oauth_clients!oauth_grants_client_id_fkey(name)";

/** Mis preferencias → Asistentes de IA. */
export async function McpSettings({ user }: { user: CurrentUser }) {
  const t = await getT();
  if (!canSystem(user.access, "use_mcp")) {
    return (
      <div className="p-4 text-sm text-muted">
        <Tr>Tu perfil no tiene activado el uso de asistentes de IA. Pídele a administración que active «Usar asistentes de IA (MCP)» en tu perfil de permisos.</Tr>
      </div>
    );
  }
  const supabase = await createClient();
  const [{ data: tokens }, { data: grants }, { data: activity }] = await Promise.all([
    // Los tokens de las aplicaciones OAuth se renuevan cada hora: se muestran como aplicación conectada.
    supabase.from("mcp_tokens").select("id, name, token_prefix, scope, created_at, last_used_at, expires_at, revoked_at")
      .eq("user_id", user.id).is("grant_id", null).order("created_at", { ascending: false }),
    supabase.from("oauth_grants").select(GRANT_SELECT).eq("user_id", user.id).is("revoked_at", null).order("created_at", { ascending: false }),
    supabase.from("mcp_activity").select("id, tool, object, summary, is_change, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(15),
  ]);
  const url = `${siteUrl}/api/mcp`;

  return (
    <div className="space-y-5 p-4">
      <div className="flex gap-3">
        <Bot size={20} className="mt-0.5 flex-none text-[var(--brand)]" />
        <div className="space-y-1 text-sm">
          <p><Tr>Conecta Claude, Cursor, Antigravity o Grok al CRM. El asistente actúa como tú: solo ve y cambia lo que tú puedes, y cada cambio te pide confirmación antes de guardarse.</Tr></p>
          <p className="text-muted"><Tr>ChatGPT y Claude en la web no usan token: agrega el CRM como conector con la dirección del servidor MCP e inicia sesión cuando te lo pida.</Tr></p>
          <p className="text-muted">{t("Dirección del servidor MCP:")} <code className="text-ink">{url}</code></p>
          {!mcpConfigured() && (
            <p className="text-danger"><Tr>Falta configurar el servidor: agrega SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_JWT_SECRET) en el servidor.</Tr></p>
          )}
        </div>
      </div>
      <section className="space-y-2">
        <h2 className="card-title"><Tr>Nuevo token</Tr></h2>
        <TokenCreator url={url} canWrite={canSystem(user.access, "mcp_write")} />
      </section>
      <section className="rounded-[14px] border border-line">
        <h2 className="card-title border-b border-line px-4 py-3"><Tr>Aplicaciones conectadas</Tr></h2>
        <GrantTable grants={(grants ?? []) as unknown as Grant[]} path="/preferencias" />
      </section>
      <section className="rounded-[14px] border border-line">
        <h2 className="card-title border-b border-line px-4 py-3"><Tr>Mis tokens</Tr></h2>
        <TokenTable tokens={(tokens ?? []) as Token[]} path="/preferencias" />
      </section>
      {(activity?.length ?? 0) > 0 && (
        <section className="rounded-[14px] border border-line">
          <h2 className="card-title border-b border-line px-4 py-3"><Tr>Uso reciente</Tr></h2>
          <ul className="divide-y divide-[var(--border)] text-sm">
            {activity!.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                <span className={`badge ${a.is_change ? "badge-warning" : ""}`}>{a.tool}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted">{a.summary}</span>
                <span className="text-xs text-muted"><Fmt datetime={a.created_at} /></span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
