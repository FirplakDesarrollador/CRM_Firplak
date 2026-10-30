import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

/**
 * Sesión de una petición del servidor MCP: mientras corre una herramienta, `createClient`
 * habla con Supabase con el JWT del dueño del token (RLS y permisos de esa persona).
 */
export const mcpSession = new AsyncLocalStorage<{ accessToken: string }>();

export async function createClient() {
  const mcp = mcpSession.getStore();
  if (mcp) {
    return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
      cookies: { getAll: () => [], setAll() {} },
      global: { headers: { Authorization: `Bearer ${mcp.accessToken}` } },
    });
  }
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Llamado desde un Server Component: el proxy se encarga de refrescar la sesión.
        }
      },
    },
  });
}

export type ServerClient = Awaited<ReturnType<typeof createClient>>;
