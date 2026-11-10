import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/session";
import { getObjectDef, untypedClient } from "@/lib/records/data";
import { insertActivity } from "@/lib/records/activities";
import { friendlyError, persistRecord } from "@/lib/records/persist";
import type { FormState } from "@/lib/records/form";

/**
 * Recibe un registro creado sin señal (un cliente, una actividad o una cotización) y lo guarda con las mismas
 * comprobaciones del CRM. El id lo trae el dispositivo: si el registro ya existe (un reenvío tras perder la respuesta), se
 * responde «enviado» sin crear otro.
 *
 * El resultado va en el cuerpo: `sent` (guardado) o `rejected` (el CRM no lo aceptó, con el motivo). Un 4xx o
 * 5xx es un problema del envío, no del registro: el dispositivo lo conserva.
 *
 * Una cotización llega con sus líneas y con el precio que vio el cliente: ese precio se respeta. Si la lista
 * ya trae otro, la línea queda marcada (`offline_list_price`) y la respuesta lo cuenta en `changed`.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = { account: "accounts", activity: "activities", quote: "quotes" } as const;
/** Lo que el dispositivo puede decidir de una cotización; el resto lo pone el CRM. */
const QUOTE_FIELDS = ["name", "account_id", "opportunity_id", "contact_id", "description"];
const MAX_LINES = 200;
const NO_STORE = { "Cache-Control": "no-store" };

type Body = { id?: unknown; userId?: unknown; kind?: unknown; values?: unknown; lines?: unknown; ignoreDuplicates?: unknown };
type Line = { product_id: string; name: string; quantity: number; unit_price: number; discount: number };
type Db = Awaited<ReturnType<typeof untypedClient>>;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "No autenticado" }, 401);

  const body = (await request.json().catch(() => null)) as Body | null;
  const id = typeof body?.id === "string" ? body.id.toLowerCase() : "";
  const kind = typeof body?.kind === "string" && body.kind in KINDS ? (body.kind as keyof typeof KINDS) : null;
  const raw = body?.values;
  if (!UUID.test(id) || !kind || !raw || typeof raw !== "object" || Array.isArray(raw)) {
    return json({ error: "Envío no válido" }, 400);
  }
  const lines = kind === "quote" ? parseLines(body?.lines) : [];
  if (!lines) return json({ error: "Envío no válido" }, 400);
  // Lo que escribió otra persona en este dispositivo no se guarda a nombre de quien tiene la sesión.
  if (body?.userId !== user.id) return json({ status: "other-user" }, 403);

  const objectKey = KINDS[kind];
  const db = await untypedClient();
  const exists = async () => Boolean((await db.from(objectKey).select("id").eq("id", id).maybeSingle()).data);
  if (await exists()) return kind === "quote" ? finishQuote(db, id, lines) : json({ status: "sent", id });

  const formData = new FormData();
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (kind === "quote" && !QUOTE_FIELDS.includes(name)) continue;
    if (typeof value === "string" && value !== "") formData.set(name, value);
  }
  // Quien lo creó es quien lo envía: el propietario no se elige desde el dispositivo.
  formData.delete("owner_id");
  formData.delete("id");

  const def = await getObjectDef(objectKey);
  let state: FormState;
  if (kind === "account") {
    const result = await persistRecord("accounts", null, formData, user, { ignoreDuplicates: body?.ignoreDuplicates === true, newId: id });
    if (result.ok) return sent(id);
    state = result.state;
  } else if (kind === "quote") {
    const gone = await unavailable(db, lines);
    if (gone.length) {
      return json({
        status: "rejected",
        reason: "Hay productos que ya no están disponibles en el CRM. Quítalos de la cotización y vuelve a enviarla.",
        errors: gone.map((line) => ({ field: `line:${line.product_id}`, label: line.name, message: "Ya no está disponible" })),
      });
    }
    // Nace en borrador, con el IVA del mercado (en dólares la base lo deja en 0 %) y sin flete.
    formData.set("status", "Borrador");
    formData.set("tax_rate", "19");
    formData.set("shipping", "0");
    const result = await persistRecord("quotes", null, formData, user, { newId: id });
    if (result.ok) return finishQuote(db, id, lines);
    if (await exists()) return finishQuote(db, id, lines);
    state = result.state;
  } else {
    const result = await insertActivity(formData, user, id);
    if (result.ok) return sent(id);
    state = result.state;
  }

  // El primer intento sí guardó y solo se perdió la respuesta.
  if (await exists()) return sent(id);

  const errors = Object.entries(state.errors ?? {}).map(([field, message]) => ({
    field,
    label: def.fields.find((f) => f.name === field)?.label ?? field,
    message,
  }));
  return json({
    status: "rejected",
    reason: state.message ?? (errors.length ? "Revisa los campos marcados." : "El CRM no aceptó el registro."),
    errors: errors.length ? errors : undefined,
    duplicates: state.duplicates?.map((d) => ({ id: d.id, label: d.label })),
  });
}

function sent(id: string, extra: Record<string, unknown> = {}) {
  revalidatePath("/", "layout");
  return json({ status: "sent", id, ...extra });
}

const amount = (value: unknown, max: number) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max ? Math.round(value * 100) / 100 : null;

/** Las líneas de la cotización, o `null` si no son válidas (una cotización sin productos no se envía). */
function parseLines(raw: unknown): Line[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_LINES) return null;
  const lines: Line[] = [];
  for (const entry of raw as (Record<string, unknown> | null)[]) {
    const product_id = typeof entry?.product_id === "string" ? entry.product_id.toLowerCase() : "";
    const quantity = amount(entry?.quantity, 9_999_999_999);
    const unit_price = amount(entry?.unit_price, 9_999_999_999_999);
    const discount = amount(entry?.discount, 100);
    if (!UUID.test(product_id) || !quantity || unit_price === null || discount === null) return null;
    const name = typeof entry?.name === "string" ? entry.name.trim().slice(0, 200) : "";
    lines.push({ product_id, name: name || "Producto", quantity, unit_price, discount });
  }
  return lines;
}

/** Líneas cuyo producto ya no existe o se desactivó desde la descarga. */
async function unavailable(db: Db, lines: Line[]) {
  const { data } = await db.from("products").select("id").in("id", [...new Set(lines.map((line) => line.product_id))]).eq("is_active", true);
  const active = new Set(((data ?? []) as { id: string }[]).map((product) => product.id));
  return lines.filter((line) => !active.has(line.product_id));
}

/**
 * Deja la cotización con sus líneas y responde con su número oficial y los precios que cambiaron. Si la
 * cotización ya tenía líneas (un reenvío), no agrega nada.
 */
async function finishQuote(db: Db, id: string, lines: Line[]) {
  const { count, error: countError } = await db.from("quote_line_items").select("id", { count: "exact", head: true }).eq("quote_id", id);
  if (countError) return json({ error: "No se pudo revisar la cotización" }, 500);

  if (!count) {
    // El precio de lista de hoy, para marcar las líneas que se cotizaron a otro precio.
    const prices = await Promise.all(lines.map((line) => db.rpc("quote_line_price", { p_quote: id, p_product: line.product_id })));
    const { data: products } = await db.from("products").select("id, name").in("id", [...new Set(lines.map((line) => line.product_id))]);
    const names = new Map(((products ?? []) as { id: string; name: string }[]).map((product) => [product.id, product.name]));
    const { error } = await db.from("quote_line_items").insert(lines.map((line, index) => ({
      quote_id: id,
      product_id: line.product_id,
      description: names.get(line.product_id) ?? line.name,
      quantity: line.quantity,
      unit_price: line.unit_price,
      discount: line.discount,
      sort_order: index + 1,
      offline_list_price: (prices[index].data as { unit_price: number | null } | null)?.unit_price ?? null,
    })));
    if (error) {
      // Un dato que la base no acepta es un rechazo; cualquier otra falla se reintenta (la cotización ya existe
      // sin líneas, y el reenvío las agrega).
      if (/^(22|23|42501)/.test(error.code ?? "")) return json({ status: "rejected", reason: friendlyError(error.message) });
      return json({ error: "No se pudieron guardar los productos de la cotización" }, 500);
    }
  }

  const [{ data: quote }, { data: marked }] = await Promise.all([
    db.from("quotes").select("quote_number").eq("id", id).maybeSingle(),
    db.from("quote_line_items").select("product_id, description, unit_price, offline_list_price")
      .eq("quote_id", id).not("offline_list_price", "is", null).order("sort_order"),
  ]);
  const changed = ((marked ?? []) as { product_id: string | null; description: string | null; unit_price: number; offline_list_price: number }[])
    .map((line) => ({ product_id: line.product_id ?? "", name: line.description ?? "Producto", quoted: Number(line.unit_price), current: Number(line.offline_list_price) }));
  return sent(id, { quote_number: (quote as { quote_number: string | null } | null)?.quote_number ?? null, changed });
}
