import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { mcpSession } from "@/lib/supabase/server";
import { resolveToken } from "@/lib/mcp/auth";
import { buildMcpServer } from "@/lib/mcp/tools";
import { CORS } from "@/lib/mcp/oauth";
import { siteUrl } from "@/lib/env";

// Servidor MCP (Streamable HTTP, sin estado): cada petición trae su token y se atiende como
// el dueño del token, con sus permisos y RLS.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// El 401 indica dónde están los metadatos OAuth (los clientes como ChatGPT o Claude web
// descubren desde ahí cómo pedir autorización).
const unauthorized = (message: string, status = 401) =>
  Response.json(
    { jsonrpc: "2.0", error: { code: -32001, message }, id: null },
    {
      status,
      headers: {
        ...CORS,
        ...(status === 401
          ? { "WWW-Authenticate": `Bearer realm="Firplak CRM", resource_metadata="${siteUrl}/.well-known/oauth-protected-resource/api/mcp"` }
          : {}),
      },
    },
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
      const response = await transport.handleRequest(request);
      Object.entries(CORS).forEach(([k, v]) => response.headers.set(k, v));
      return response;
    } finally {
      await server.close();
    }
  });
}

export { handle as GET, handle as POST, handle as DELETE };
export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });
