"use client";

import { useActionState, useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { createMcpToken, type TokenState } from "@/lib/mcp/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";

function CopyBox({ value, label }: { value: string; label: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-[10px] border border-line bg-surface-2 p-3 pr-12 text-xs leading-relaxed"><code>{value}</code></pre>
      <button type="button" className="btn btn-sm btn-ghost absolute right-1.5 top-1.5" aria-label={t(label)}
        onClick={() => { navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }); }}>
        {done ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}

/** Configuración de cada cliente con la URL del servidor y el token. */
export function clientSnippets(url: string, token: string) {
  const json = (o: unknown) => JSON.stringify(o, null, 2);
  return [
    { key: "claude-code", label: "Claude Code", hint: "En la terminal:", code: `claude mcp add --transport http firplak-crm ${url} --header "Authorization: Bearer ${token}"` },
    { key: "claude-desktop", label: "Claude Desktop", hint: "Configuración → Desarrollador → Editar configuración (claude_desktop_config.json):",
      code: json({ mcpServers: { "firplak-crm": { command: "npx", args: ["-y", "mcp-remote@0.15.1", url, "--header", `Authorization: Bearer ${token}`] } } }) },
    { key: "cursor", label: "Cursor", hint: "~/.cursor/mcp.json (o .cursor/mcp.json del proyecto):",
      code: json({ mcpServers: { "firplak-crm": { url, headers: { Authorization: `Bearer ${token}` } } } }) },
    { key: "antigravity", label: "Antigravity", hint: "Agente → Servidores MCP → Gestionar → Ver configuración (mcp_config.json):",
      code: json({ mcpServers: { "firplak-crm": { serverUrl: url, headers: { Authorization: `Bearer ${token}` } } } }) },
    { key: "grok", label: "Grok (API de xAI)", hint: "Herramienta MCP remota en la API de respuestas:",
      code: json({ type: "mcp", server_url: url, server_label: "firplak-crm", authorization: token }) },
  ];
}

export function TokenCreator({ url, canWrite }: { url: string; canWrite: boolean }) {
  const t = useT();
  const [state, action] = useActionState<TokenState, FormData>(createMcpToken, {});
  const [client, setClient] = useState("claude-code");
  const snippets = state.token ? clientSnippets(url, state.token) : [];
  const current = snippets.find((s) => s.key === client);

  return (
    <div className="space-y-3">
      <form action={action} className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_9rem_auto]">
        <div>
          <label className="label" htmlFor="mcp-name">{t("Nombre del token")}</label>
          <input id="mcp-name" name="name" className="input" placeholder={t("Ej. Claude en mi portátil")} required />
        </div>
        <div>
          <label className="label" htmlFor="mcp-scope">{t("Alcance")}</label>
          <select id="mcp-scope" name="scope" className="select" defaultValue={canWrite ? "write" : "read"}>
            <option value="read">{t("Solo consulta")}</option>
            {canWrite && <option value="write">{t("Consulta y cambios (con confirmación)")}</option>}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="mcp-exp">{t("Vence en")}</label>
          <select id="mcp-exp" name="expires" className="select" defaultValue="90">
            <option value="30">{t("30 días")}</option>
            <option value="90">{t("90 días")}</option>
            <option value="365">{t("1 año")}</option>
            <option value="never">{t("Sin vencimiento")}</option>
          </select>
        </div>
        <SubmitButton className="btn btn-primary mb-px" pendingText="Creando…"><KeyRound size={15} /> {t("Crear token")}</SubmitButton>
        {state.message && <p role="status" className={`text-xs font-semibold sm:col-span-4 ${state.ok ? "text-success" : "text-danger"}`}>{t(state.message)}</p>}
      </form>

      {state.token && (
        <div className="space-y-3 rounded-[14px] border border-[var(--brand)] p-3">
          <div>
            <p className="label">{t("Tu token (cópialo ahora)")}</p>
            <CopyBox value={state.token} label="Copiar token" />
          </div>
          <div>
            <p className="label">{t("Configúralo en tu asistente")}</p>
            <div role="tablist" className="mb-2 flex flex-wrap gap-1">
              {snippets.map((s) => (
                <button key={s.key} type="button" role="tab" aria-selected={client === s.key}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold ${client === s.key ? "bg-brand text-[var(--brand-contrast)]" : "text-muted hover:text-ink"}`}
                  onClick={() => setClient(s.key)}>{s.label}</button>
              ))}
            </div>
            {current && (
              <>
                <p className="mb-1 text-xs text-muted">{t(current.hint)}</p>
                <CopyBox value={current.code} label="Copiar configuración" />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
