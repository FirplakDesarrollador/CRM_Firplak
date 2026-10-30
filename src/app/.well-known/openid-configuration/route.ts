import { CORS, authorizationServerMetadata, json } from "@/lib/mcp/oauth";

// Algunos clientes buscan primero el descubrimiento de OpenID: mismos datos del servidor OAuth.
export const GET = () => json(authorizationServerMetadata());
export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });
