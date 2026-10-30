import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { mcpSession } from "@/lib/supabase/server";
import { resolveToken } from "@/lib/mcp/auth";
import { buildMcpServer } from "@/lib/mcp/tools";

// Servidor MCP (Streamable HTTP, sin estado): cada petición trae su token y se atiende como
// el dueño del token, con sus permisos y RLS.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const unauthorized = (message: string, status = 401) =>
  Response.json(
    { jsonrpc: "2.0", error: { code: -32001, message }, id: null },
    { status, headers: status === 401 ? { "WWW-Authenticate": 'Bearer realm="Firplak CRM"' } : undefined },
  );

async function handle(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return unauthorized("Falta el token: envía «Authorization: Bearer <token>» (créalo en Mis preferencias → Asistentes de IA).");

  const identity = await resolveToken(token);
  if ("error" in identity) return unauthorized(identity.error, identity.status);

  return mcpSession.run({ accessToken: identity.accessToken }, async () => {
    const server = buildMcpServer(identity);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    try {
      return await transport.handleRequest(request);
    } finally {
      await server.close();
    }
  });
}

export { handle as GET, handle as POST, handle as DELETE };
