"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/session";
import {
  CAMPAIGN_MEMBER_STATUSES, CAMPAIGN_STATUSES, CASE_STATUSES, LEAD_STATUSES, QUOTE_STATUSES,
} from "@/lib/objects/picklists";
import { parseAmount, type FormState } from "./form";
import { validateRecord } from "@/lib/rules/server";
import { runAutomations } from "@/lib/rules/automation";

function friendly(message: string) {
  if (message.includes("row-level security") || message.includes("42501")) return "No tienes permiso para realizar esta acción.";
  if (message.includes("duplicate key")) return "Ese registro ya existe.";
  if (message.includes("violates foreign key")) return "El registro está relacionado con otros datos.";
  return message;
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

// ---------------------------------------------------------------------------
// Estados (ruta de estados en la ficha). Solo campos de la lista blanca.
// ---------------------------------------------------------------------------
const STATUS_FIELDS = {
  leads: LEAD_STATUSES.filter((s) => s !== "Convertido"),
  quotes: QUOTE_STATUSES,
  cases: CASE_STATUSES,
  campaigns: CAMPAIGN_STATUSES,
} as const;

export async function setStatus(object: keyof typeof STATUS_FIELDS, id: string, status: string): Promise<FormState> {
  if (!(STATUS_FIELDS[object] as readonly string[]).includes(status)) return { message: "Estado no válido" };
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const supabase = await createClient();
  const { data: before } = await supabase.from(object).select("*").eq("id", id).maybeSingle();
  if (!before) return { message: "El registro no existe o no tienes acceso." };
  const candidate: Record<string, unknown> = { ...before, status };
  if (object === "cases") candidate.is_closed = status === "Cerrado";
  const invalid = await validateRecord(object, candidate, user.id);
  if (invalid) return { message: invalid.message };
  const { data, error } = await supabase.from(object).update({ status }).eq("id", id).select("id");
  if (error) return { message: friendly(error.message) };
  if (!data?.length) return { message: "No tienes permiso para cambiar el estado." };
  await runAutomations(object, "update", id, before as Record<string, unknown>, user.id);
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Conversión de prospectos
// ---------------------------------------------------------------------------
export async function convertLead(leadId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const mode = str(fd, "account_mode");
  const accountId = mode === "existing" ? str(fd, "account_id") : "";
  if (mode === "existing" && !isUuid(accountId)) return { errors: { account_id: "Elige una cuenta existente" } };
  const createOpp = fd.get("create_opportunity") === "on";
  const stageId = str(fd, "stage_id");
  if (createOpp && !isUuid(stageId)) return { errors: { stage_id: "Elige la etapa" } };
  const ownerId = str(fd, "owner_id");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("convert_lead", {
    p_lead: leadId,
    p_account_id: accountId || undefined,
    p_account_name: str(fd, "account_name") || undefined,
    p_create_opportunity: createOpp,
    p_opportunity_name: str(fd, "opportunity_name") || undefined,
    p_stage_id: createOpp ? stageId : undefined,
    p_amount: parseAmount(str(fd, "amount")) ?? 0,
    p_close_date: str(fd, "close_date") || undefined,
    p_owner: isUuid(ownerId) ? ownerId : undefined,
  });
  if (error) return { message: friendly(error.message) };
  const result = data as { account_id: string; contact_id: string; opportunity_id: string | null };
  revalidatePath("/", "layout");
  redirect(result.opportunity_id ? `/oportunidades/${result.opportunity_id}` : `/cuentas/${result.account_id}`);
}

// ---------------------------------------------------------------------------
// Productos y listas de precios
// ---------------------------------------------------------------------------
export async function saveProductPrice(productId: string, priceBookId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const price = parseAmount(str(fd, "unit_price"));
  if (price === null || price < 0) return { message: "Precio no válido" };
  const supabase = await createClient();
  const { error } = await supabase.from("price_book_entries").upsert(
    { product_id: productId, price_book_id: priceBookId, unit_price: price, is_active: fd.get("is_active") === "on" },
    { onConflict: "price_book_id,product_id" },
  );
  if (error) return { message: friendly(error.message) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Precio guardado" };
}

export async function removeProductPrice(entryId: string, _prev?: FormState, _fd?: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("price_book_entries").delete().eq("id", entryId).select("id");
  if (error) return { message: friendly(error.message) };
  if (!data?.length) return { message: "No tienes permiso para quitar este precio." };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function savePriceBook(id: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const name = str(fd, "name");
  if (!name) return { message: "Escribe el nombre de la lista" };
  const supabase = await createClient();
  const payload = { name, description: str(fd, "description") || null, is_active: id ? fd.get("is_active") === "on" : true };
  const result = id
    ? await supabase.from("price_books").update(payload).eq("id", id).select("id").single()
    : await supabase.from("price_books").insert(payload).select("id").single();
  if (result.error) return { message: friendly(result.error.message) };
  if (fd.get("is_standard") === "on") {
    await supabase.from("price_books").update({ is_standard: false }).neq("id", result.data.id).eq("is_standard", true);
    await supabase.from("price_books").update({ is_standard: true, is_active: true }).eq("id", result.data.id);
  }
  revalidatePath("/", "layout");
  return { ok: true, message: id ? "Lista actualizada" : "Lista creada" };
}

// ---------------------------------------------------------------------------
// Cotizaciones
// ---------------------------------------------------------------------------
export async function addQuoteLine(quoteId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const productId = str(fd, "product_id");
  if (!isUuid(productId)) return { errors: { product_id: "Elige un producto" } };
  const quantity = parseAmount(str(fd, "quantity")) ?? 1;
  if (quantity <= 0) return { errors: { quantity: "Cantidad no válida" } };
  const discount = Math.min(100, Math.max(0, Number(str(fd, "discount").replace(",", ".")) || 0));

  const supabase = await createClient();
  const { data: quote } = await supabase.from("quotes").select("price_book_id").eq("id", quoteId).maybeSingle();
  if (!quote) return { message: "Cotización no encontrada" };
  const [{ data: entry }, { data: product }, { count }] = await Promise.all([
    supabase.from("price_book_entries").select("unit_price")
      .eq("product_id", productId).eq("price_book_id", quote.price_book_id ?? "").eq("is_active", true).maybeSingle(),
    supabase.from("products").select("name").eq("id", productId).maybeSingle(),
    supabase.from("quote_line_items").select("id", { count: "exact", head: true }).eq("quote_id", quoteId),
  ]);
  const manualPrice = parseAmount(str(fd, "unit_price"));
  const unitPrice = manualPrice ?? entry?.unit_price;
  if (unitPrice === undefined || unitPrice === null) {
    return { errors: { unit_price: "El producto no tiene precio en la lista de esta cotización; escribe el precio." } };
  }
  const { error } = await supabase.from("quote_line_items").insert({
    quote_id: quoteId,
    product_id: productId,
    description: str(fd, "description") || product?.name || null,
    quantity,
    unit_price: unitPrice,
    discount,
    sort_order: (count ?? 0) + 1,
  });
  if (error) return { message: friendly(error.message) };
  revalidatePath("/", "layout");
  // `nonce` permite al formulario reiniciar el buscador de producto tras cada alta.
  return { ok: true, values: { nonce: crypto.randomUUID() } };
}

export async function updateQuoteLine(lineId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const quantity = parseAmount(str(fd, "quantity"));
  const unitPrice = parseAmount(str(fd, "unit_price"));
  const discount = Number(str(fd, "discount").replace(",", "."));
  if (!quantity || quantity <= 0 || unitPrice === null || unitPrice < 0 || !(discount >= 0 && discount <= 100)) {
    return { message: "Revisa cantidad, precio y descuento" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("quote_line_items")
    .update({ quantity, unit_price: unitPrice, discount }).eq("id", lineId).select("id");
  if (error) return { message: friendly(error.message) };
  if (!data?.length) return { message: "No tienes permiso para editar esta línea." };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeQuoteLine(lineId: string, _prev?: FormState, _fd?: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("quote_line_items").delete().eq("id", lineId).select("id");
  if (error) return { message: friendly(error.message) };
  if (!data?.length) return { message: "No tienes permiso para quitar esta línea." };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function syncQuote(quoteId: string, _prev?: FormState, _fd?: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("sync_quote", { p_quote: quoteId });
  if (error) return { message: friendly(error.message) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Valor de la oportunidad actualizado con esta cotización" };
}

// ---------------------------------------------------------------------------
// Miembros de campaña
// ---------------------------------------------------------------------------
export async function addCampaignMember(campaignId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const contactId = str(fd, "contact_id");
  const leadId = str(fd, "lead_id");
  if (!isUuid(contactId) && !isUuid(leadId)) return { message: "Elige un contacto o un prospecto" };
  const status = CAMPAIGN_MEMBER_STATUSES.includes(str(fd, "status")) ? str(fd, "status") : "Enviado";
  const supabase = await createClient();
  const { error } = await supabase.from("campaign_members").insert({
    campaign_id: campaignId,
    contact_id: isUuid(contactId) ? contactId : null,
    lead_id: isUuid(contactId) ? null : leadId,
    status,
  });
  if (error) return { message: friendly(error.message) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Miembro agregado", values: { nonce: crypto.randomUUID() } };
}

export async function setMemberStatus(memberId: string, status: string): Promise<FormState> {
  if (!CAMPAIGN_MEMBER_STATUSES.includes(status)) return { message: "Estado no válido" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("campaign_members").update({ status }).eq("id", memberId).select("id");
  if (error) return { message: friendly(error.message) };
  if (!data?.length) return { message: "No tienes permiso para editar la campaña." };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeCampaignMember(memberId: string, _prev?: FormState, _fd?: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("campaign_members").delete().eq("id", memberId).select("id");
  if (error) return { message: friendly(error.message) };
  if (!data?.length) return { message: "No tienes permiso para editar la campaña." };
  revalidatePath("/", "layout");
  return { ok: true };
}
