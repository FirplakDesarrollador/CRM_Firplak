import { createAdminClient } from "@/lib/supabase/admin";
import { mcpSession } from "@/lib/supabase/server";
import { sessionForUser } from "@/lib/mcp/auth";
import { ms365Configured } from "@/lib/ms365/config";
import { syncUser } from "@/lib/ms365/sync";

// Sincronización programada de todas las cuentas de Microsoft 365 conectadas. La llama un cron
// (Vercel Cron envía «Authorization: Bearer $CRON_SECRET») cada 15–30 minutos.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin || !ms365Configured()) return Response.json({ error: "Microsoft 365 o la service_role no están configurados" }, { status: 503 });

  const { data: connections } = await admin.from("ms365_connections").select("user_id, profile:profiles!ms365_connections_user_id_fkey(email, is_active)");
  const results: { user: string; ok: boolean; summary: string }[] = [];
  for (const c of connections ?? []) {
    const profile = c.profile as { email: string; is_active: boolean } | null;
    if (!profile?.is_active) continue;
    try {
      // Cada cuenta se sincroniza como su dueño: mismos permisos y visibilidad.
      const accessToken = await sessionForUser(c.user_id, profile.email);
      if (!accessToken) throw new Error("No se pudo abrir la sesión del usuario");
      const summary = await mcpSession.run({ accessToken }, () => syncUser(c.user_id));
      results.push({ user: profile.email, ok: true, summary });
    } catch (e) {
      results.push({ user: profile.email, ok: false, summary: (e as Error).message });
    }
  }
  return Response.json({ synced: results.filter((r) => r.ok).length, results });
}

export const POST = GET;
