import { dispatchPendingPush } from "@/lib/push/send";

// Envía las notificaciones push pendientes. La despierta el webhook de la base al crear una
// notificación y, de respaldo, un cron («Authorization: Bearer $CRON_SECRET»).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  const totals = await dispatchPendingPush();
  if (!totals) return Response.json({ error: "Push o la service_role no están configurados" }, { status: 503 });
  return Response.json(totals);
}

export const POST = GET;
