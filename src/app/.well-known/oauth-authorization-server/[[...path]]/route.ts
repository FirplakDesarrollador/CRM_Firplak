import { CORS, authorizationServerMetadata, json } from "@/lib/mcp/oauth";

// Metadatos del servidor de autorización (RFC 8414).
export const GET = () => json(authorizationServerMetadata());
export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });
