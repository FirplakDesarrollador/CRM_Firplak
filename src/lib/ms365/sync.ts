import "server-only";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/env";
import { getConnection, graph, GraphError, type Connection } from "./graph";
import { ms365Configured } from "./config";

type Activity = {
  id: string; activity_type: string; subject: string; description: string | null; status: string;
  start_at: string | null; end_at: string | null; location: string | null; updated_at: string; owner_id: string | null;
};
type Link = { id: string; external_id: string; record_id: string; origin: string; synced_at: string; external_updated_at: string | null };
type GraphDate = { dateTime: string; timeZone: string };
type GraphEvent = {
  id: string; subject: string | null; bodyPreview?: string; webLink?: string; isCancelled?: boolean; lastModifiedDateTime?: string;
  start: GraphDate; end: GraphDate; location?: { displayName?: string }; attendees?: { emailAddress: { address: string } }[];
};
type GraphMessage = {
  id: string; subject: string | null; bodyPreview?: string; webLink?: string; receivedDateTime: string; sentDateTime?: string;
  from?: { emailAddress: { address: string } }; toRecipients?: { emailAddress: { address: string } }[]; ccRecipients?: { emailAddress: { address: string } }[];
};

const graphTime = (iso: string) => ({ dateTime: new Date(iso).toISOString().replace("Z", ""), timeZone: "UTC" });
/** Graph devuelve la hora en UTC sin zona (por el encabezado Prefer). */
const fromGraph = (d: GraphDate) => new Date(d.dateTime.endsWith("Z") ? d.dateTime : `${d.dateTime}Z`).toISOString();
const lower = (s?: string) => (s ?? "").trim().toLowerCase();

/** Contactos (y si no, prospectos) visibles cuyo correo aparece entre los participantes. */
async function matchPeople(emails: string[]) {
  const wanted = [...new Set(emails.map(lower).filter((e) => e.includes("@")))];
  if (!wanted.length) return { contacts: [] as { id: string; email: string; account_id: string | null }[], leads: [] as { id: string; email: string }[] };
  const supabase = await createClient();
  const or = wanted.map((e) => `email.ilike.${e.replace(/[,()]/g, "")}`).join(",");
  const [contacts, leads] = await Promise.all([
    supabase.from("contacts").select("id, email, account_id").or(or).limit(50),
    supabase.from("leads").select("id, email").or(or).eq("is_converted", false).limit(50),
  ]);
  return { contacts: (contacts.data ?? []) as { id: string; email: string; account_id: string | null }[], leads: (leads.data ?? []) as { id: string; email: string }[] };
}

async function links(kind: string, userId: string, by: { externalIds?: string[]; recordIds?: string[] }) {
  const supabase = await createClient();
  let query = supabase.from("external_links").select("id, external_id, record_id, origin, synced_at, external_updated_at").eq("kind", kind).eq("user_id", userId);
  if (by.externalIds) query = query.in("external_id", by.externalIds.length ? by.externalIds : ["-"]);
  if (by.recordIds) query = query.in("record_id", by.recordIds.length ? by.recordIds : ["00000000-0000-0000-0000-000000000000"]);
  return ((await query).data ?? []) as Link[];
}

// ---------------------------------------------------------------- CRM → Outlook
async function pushMeeting(conn: Connection, a: Activity, link: Link | undefined) {
  const supabase = await createClient();
  if (a.status === "cancelled" || !a.start_at) {
    if (link) {
      await graph(conn, `/me/events/${encodeURIComponent(link.external_id)}`, { method: "DELETE" }).catch(() => undefined);
      await supabase.from("external_links").delete().eq("id", link.id);
    }
    return "deleted";
  }
  const end = a.end_at ?? new Date(new Date(a.start_at).getTime() + 3600_000).toISOString();
  const body = {
    subject: a.subject,
    body: { contentType: "Text", content: `${a.description ?? ""}\n\nFirplak CRM: ${siteUrl}/actividades/${a.id}`.trim() },
    start: graphTime(a.start_at),
    end: graphTime(end),
    location: { displayName: a.location ?? "" },
  };
  if (link) {
    try {
      await graph(conn, `/me/events/${encodeURIComponent(link.external_id)}`, { method: "PATCH", body });
      await supabase.from("external_links").update({ synced_at: new Date().toISOString() }).eq("id", link.id);
      return "updated";
    } catch (e) {
      // Borrado en Outlook: se suelta el vínculo y se vuelve a crear.
      if (!(e instanceof GraphError && e.status === 404)) throw e;
      await supabase.from("external_links").delete().eq("id", link.id);
    }
  }
  const created = await graph<GraphEvent>(conn, "/me/events", { method: "POST", body });
  await supabase.from("external_links").insert({
    user_id: conn.user_id, kind: "outlook_event", external_id: created.id, object: "activities", record_id: a.id,
    web_url: created.webLink ?? null, origin: "crm", external_updated_at: created.lastModifiedDateTime ?? null,
  });
  return "created";
}

/** Reuniones del CRM (propias, desde ayer) nuevas o cambiadas desde la última sincronización. */
async function pushMeetings(conn: Connection) {
  const supabase = await createClient();
  const since = new Date(Date.now() - 86400_000).toISOString();
  const { data } = await supabase.from("activities")
    .select("id, activity_type, subject, description, status, start_at, end_at, location, updated_at, owner_id")
    .eq("owner_id", conn.user_id).eq("activity_type", "meeting").gte("start_at", since).limit(200);
  const acts = (data ?? []) as Activity[];
  const existing = new Map((await links("outlook_event", conn.user_id, { recordIds: acts.map((a) => a.id) })).map((l) => [l.record_id, l]));
  let n = 0;
  for (const a of acts) {
    const link = existing.get(a.id);
    if (link?.origin === "external") continue;
    if (link && new Date(a.updated_at) <= new Date(link.synced_at) && a.status !== "cancelled") continue;
    if (!link && a.status === "cancelled") continue;
    await pushMeeting(conn, a, link);
    n++;
  }
  return n;
}

/** Envía (o actualiza) una reunión del CRM al Outlook de su propietario, si está conectado. */
export async function syncActivityToOutlook(activityId: string) {
  if (!ms365Configured()) return;
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("activities")
      .select("id, activity_type, subject, description, status, start_at, end_at, location, updated_at, owner_id").eq("id", activityId).maybeSingle();
    const a = data as Activity | null;
    if (!a?.owner_id || a.activity_type !== "meeting") return;
    const conn = await getConnection(a.owner_id);
    if (!conn?.settings.calendar_push) return;
    const [link] = await links("outlook_event", a.owner_id, { recordIds: [a.id] });
    if (link?.origin === "external") return;
    await pushMeeting(conn, a, link);
  } catch (e) {
    console.error("Outlook: no se pudo sincronizar la reunión", (e as Error).message);
  }
}

// ---------------------------------------------------------------- Outlook → CRM
async function pullCalendar(conn: Connection) {
  const supabase = await createClient();
  const from = new Date(Date.now() - 7 * 86400_000).toISOString();
  const to = new Date(Date.now() + 30 * 86400_000).toISOString();
  const { value: events } = await graph<{ value: GraphEvent[] }>(conn,
    `/me/calendarView?startDateTime=${from}&endDateTime=${to}&$select=id,subject,start,end,location,attendees,webLink,bodyPreview,isCancelled,lastModifiedDateTime&$top=100`);
  const linked = new Map((await links("outlook_event", conn.user_id, { externalIds: events.map((e) => e.id) })).map((l) => [l.external_id, l]));
  let created = 0, updated = 0;
  for (const ev of events) {
    const link = linked.get(ev.id);
    const fields = {
      subject: ev.subject || "(Sin asunto)",
      start_at: fromGraph(ev.start), end_at: fromGraph(ev.end), location: ev.location?.displayName || null,
    };
    if (link) {
      // Solo se actualizan las reuniones que nacieron en Outlook; las del CRM mandan desde el CRM.
      if (link.origin !== "external" || !ev.lastModifiedDateTime) continue;
      if (link.external_updated_at && new Date(ev.lastModifiedDateTime) <= new Date(link.external_updated_at)) continue;
      await supabase.from("activities").update({ ...fields, ...(ev.isCancelled ? { status: "cancelled" } : {}) }).eq("id", link.record_id);
      await supabase.from("external_links").update({ synced_at: new Date().toISOString(), external_updated_at: ev.lastModifiedDateTime }).eq("id", link.id);
      updated++;
      continue;
    }
    if (ev.isCancelled) continue;
    const others = (ev.attendees ?? []).map((a) => a.emailAddress.address).filter((e) => lower(e) !== lower(conn.email ?? ""));
    const { contacts, leads } = await matchPeople(others);
    if (!contacts.length && !leads.length) continue;
    const contact = contacts[0];
    const { data: act, error } = await supabase.from("activities").insert({
      activity_type: "meeting", ...fields,
      description: [ev.bodyPreview?.trim(), "Importada de Outlook."].filter(Boolean).join("\n\n"),
      status: new Date(fields.end_at) < new Date() ? "completed" : "pending",
      contact_id: contact?.id ?? null, account_id: contact?.account_id ?? null, lead_id: contact ? null : leads[0].id,
      owner_id: conn.user_id,
    }).select("id").single();
    if (error || !act) continue;
    await supabase.from("external_links").insert({
      user_id: conn.user_id, kind: "outlook_event", external_id: ev.id, object: "activities", record_id: act.id,
      web_url: ev.webLink ?? null, origin: "external", external_updated_at: ev.lastModifiedDateTime ?? null,
    });
    created++;
  }
  return { created, updated };
}

async function pullMail(conn: Connection) {
  const supabase = await createClient();
  const since = conn.last_sync_at
    ? new Date(new Date(conn.last_sync_at).getTime() - 86400_000).toISOString()
    : new Date(Date.now() - 14 * 86400_000).toISOString();
  const { value: messages } = await graph<{ value: GraphMessage[] }>(conn,
    `/me/messages?$filter=receivedDateTime ge ${since}&$select=id,subject,bodyPreview,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,webLink&$orderby=receivedDateTime desc&$top=100`);
  const linked = new Set((await links("outlook_message", conn.user_id, { externalIds: messages.map((m) => m.id) })).map((l) => l.external_id));
  const me = lower(conn.email ?? "");
  let created = 0;
  for (const m of messages) {
    if (linked.has(m.id)) continue;
    const to = (m.toRecipients ?? []).map((r) => r.emailAddress.address);
    const cc = (m.ccRecipients ?? []).map((r) => r.emailAddress.address);
    const from = m.from?.emailAddress.address ?? "";
    const { contacts, leads } = await matchPeople([from, ...to, ...cc].filter((e) => lower(e) !== me));
    if (!contacts.length && !leads.length) continue;
    const when = m.sentDateTime ?? m.receivedDateTime;
    // Los correos que el CRM envió por Outlook ya están registrados.
    const { count } = await supabase.from("activities").select("id", { count: "exact", head: true })
      .eq("owner_id", conn.user_id).eq("activity_type", "email").eq("email_delivery", "outlook").eq("subject", m.subject ?? "")
      .gte("created_at", new Date(new Date(when).getTime() - 86400_000).toISOString());
    if (count) continue;
    const contact = contacts[0];
    const { data: act, error } = await supabase.from("activities").insert({
      activity_type: "email", subject: m.subject || "(Sin asunto)",
      description: [lower(from) === me ? null : `De: ${from}`, m.bodyPreview?.trim(), "Registrado desde Outlook."].filter(Boolean).join("\n\n"),
      status: "completed", completed_at: when, email_to: to.join(", ") || null, email_cc: cc.join(", ") || null, email_delivery: "logged",
      contact_id: contact?.id ?? null, account_id: contact?.account_id ?? null, lead_id: contact ? null : leads[0].id,
      owner_id: conn.user_id,
    }).select("id").single();
    if (error || !act) continue;
    await supabase.from("external_links").insert({
      user_id: conn.user_id, kind: "outlook_message", external_id: m.id, object: "activities", record_id: act.id,
      web_url: m.webLink ?? null, origin: "external",
    });
    created++;
  }
  return created;
}

/** Sincronización completa de la persona: reuniones al calendario, y reuniones y correos de Outlook. */
export async function syncUser(userId: string) {
  const conn = await getConnection(userId);
  if (!conn) throw new Error("No has conectado tu cuenta de Microsoft 365.");
  const parts: string[] = [];
  if (conn.settings.calendar_push) parts.push(`${await pushMeetings(conn)} reuniones enviadas a Outlook`);
  if (conn.settings.calendar_pull) {
    const r = await pullCalendar(conn);
    parts.push(`${r.created} reuniones importadas`, `${r.updated} actualizadas`);
  }
  if (conn.settings.mail_pull) parts.push(`${await pullMail(conn)} correos registrados`);
  const summary = parts.join(" · ");
  const supabase = await createClient();
  await supabase.from("ms365_connections").update({ last_sync_at: new Date().toISOString(), last_sync_summary: summary }).eq("user_id", userId);
  return summary;
}

/** Envía un correo desde el buzón de Outlook de la persona (queda en sus Elementos enviados). */
export async function sendViaOutlook(conn: Connection, mail: { to: string[]; cc: string[]; subject: string; body: string }) {
  await graph(conn, "/me/sendMail", {
    method: "POST",
    body: {
      message: {
        subject: mail.subject,
        body: { contentType: "Text", content: mail.body },
        toRecipients: mail.to.map((address) => ({ emailAddress: { address } })),
        ccRecipients: mail.cc.map((address) => ({ emailAddress: { address } })),
      },
      saveToSentItems: true,
    },
  });
}
