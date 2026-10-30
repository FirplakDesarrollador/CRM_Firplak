import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type TeamsMessage = { title: string; text?: string; url?: string; facts?: { title: string; value: string }[] };

/** Tarjeta adaptable para un flujo de Teams «Publicar en un canal cuando se recibe una solicitud de webhook». */
export function teamsCard(m: TeamsMessage) {
  return {
    type: "message",
    attachments: [{
      contentType: "application/vnd.microsoft.card.adaptive",
      content: {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        type: "AdaptiveCard",
        version: "1.4",
        body: [
          { type: "TextBlock", text: m.title, weight: "Bolder", size: "Medium", wrap: true },
          ...(m.text ? [{ type: "TextBlock", text: m.text, wrap: true }] : []),
          ...(m.facts?.length ? [{ type: "FactSet", facts: m.facts }] : []),
        ],
        ...(m.url ? { actions: [{ type: "Action.OpenUrl", title: "Abrir en Firplak CRM", url: m.url }] } : {}),
      },
    }],
  };
}

export async function postToWebhook(url: string, m: TeamsMessage) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(teamsCard(m)) });
  if (!res.ok) throw new Error(`Teams respondió ${res.status}`);
}

/**
 * Publica en un canal configurado. La dirección del webhook solo la lee el servidor con la
 * clave service_role (los usuarios no la ven), porque cualquiera con ella podría publicar.
 */
export async function postToTeams(channelId: string, m: TeamsMessage) {
  const admin = createAdminClient();
  if (!admin) {
    console.warn("Teams: falta SUPABASE_SERVICE_ROLE_KEY; no se publicó el aviso.");
    return false;
  }
  const { data } = await admin.from("teams_channels").select("webhook_url").eq("id", channelId).maybeSingle();
  if (!data) return false;
  await postToWebhook(data.webhook_url, m);
  return true;
}
