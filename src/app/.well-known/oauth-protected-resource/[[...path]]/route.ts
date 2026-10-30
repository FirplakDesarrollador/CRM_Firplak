import { CORS, json, protectedResourceMetadata } from "@/lib/mcp/oauth";

// Metadatos del recurso protegido (RFC 9728), también en /.well-known/oauth-protected-resource/api/mcp.
export const GET = () => json(protectedResourceMetadata());
export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });
