import "server-only";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import type { ObjectKey } from "@/lib/objects";
import type { CurrentUser } from "@/lib/session";
import { validateRecord, withStageEffects } from "@/lib/rules/server";
import { runAutomations } from "@/lib/rules/automation";
import { syncActivityToMicrosoft } from "@/lib/ms365/sync";
import { addDaysISO, todayISO } from "@/lib/format";
import { getObjectDef, getPipelines, untypedClient } from "./data";
import { parseRecordForm, type FormState } from "./form";

export function friendlyError(message: string) {
  if (message.includes("row-level security")) return "No tienes permiso para realizar esta acción.";
  if (message.includes("violates foreign key")) return "El registro está relacionado con otros datos y no se puede completar la acción.";
  if (message.includes("accounts_sap_card_code_key")) return "Ese código SAP ya está asignado a otra cuenta.";
  if (message.includes("duplicate key")) return "Ya existe un registro con ese valor.";
  return message;
}

export type PersistResult =
  | { ok: true; id: string | null; values: Record<string, unknown>; before: Record<string, unknown> | null }
  | { ok: false; state: FormState };

/**
 * Crea o actualiza un registro con las mismas comprobaciones de los formularios: permisos,
 * campos, duplicados, reglas de validación y automatizaciones. Con `dryRun` valida todo sin
 * guardar (vista previa de los asistentes de IA). Con `newId`, el registro nuevo se crea con ese id: lo trae
 * el dispositivo que lo escribió sin señal, para que reenviarlo no lo duplique.
 */
export async function persistRecord(
  objectKey: ObjectKey,
  id: string | null,
  formData: FormData,
  user: CurrentUser,
  opts: { dryRun?: boolean; ignoreDuplicates?: boolean; newId?: string } = {},
): Promise<PersistResult> {
  const def = await getObjectDef(objectKey);
  if (!can(user.access, def.permission, id ? "edit" : "create")) {
    return { ok: false, state: { message: "No tienes permiso para realizar esta acción." } };
  }

  const db = await untypedClient();
  let existingCustom: Record<string, unknown> = {};
  let before: Record<string, unknown> | null = null;
  if (id) {
    const { data } = await db.from(def.table).select("*").eq("id", id).maybeSingle();
    if (!data) return { ok: false, state: { message: "El registro no existe o no tienes acceso." } };
    before = data as Record<string, unknown>;
    existingCustom = (data.custom_fields ?? {}) as Record<string, unknown>;
  }

  const { values, errors, echo } = parseRecordForm(def, formData, existingCustom);
  if (Object.keys(errors).length) {
    return { ok: false, state: { errors, values: echo, message: "Revisa los campos marcados." } };
  }

  if (objectKey === "opportunities" && values.stage_id) {
    const supabase = await createClient();
    const { data: stage } = await supabase
      .from("pipeline_stages").select("pipeline_id").eq("id", String(values.stage_id)).maybeSingle();
    if (!stage) return { ok: false, state: { errors: { stage_id: "Etapa no válida" }, values: echo } };
    values.pipeline_id = stage.pipeline_id;
  }
  if (!values.owner_id) delete values.owner_id;

  // Cotización sin oportunidad: al crearla se crea una oportunidad con su nombre (ver más abajo). Al editar, es obligatoria.
  const newOpportunityForQuote = objectKey === "quotes" && !values.opportunity_id;
  if (newOpportunityForQuote) {
    if (id) return { ok: false, state: { errors: { opportunity_id: "Campo obligatorio" }, values: echo, message: "Revisa los campos marcados." } };
    if (!can(user.access, "opportunities", "create")) {
      return { ok: false, state: { errors: { opportunity_id: "Elige la oportunidad (no tienes permiso para crear oportunidades)." }, values: echo } };
    }
    delete values.opportunity_id;
  }

  // Moneda según el Mercado de la cuenta: en USD se pide el Valor en USD y el Valor en pesos lo calcula la
  // base con la TRM del día; en pesos se pide el Valor. (La base aplica lo mismo en cualquier otra vía.)
  let usdPreview: number | null = null;
  if (objectKey === "opportunities") {
    const accountChanged = !before || (values.account_id ?? null) !== (before.account_id ?? null);
    let currency = String(before?.currency ?? "COP");
    if (accountChanged) {
      const { data: account } = values.account_id
        ? await db.from("accounts").select("market").eq("id", String(values.account_id)).maybeSingle()
        : { data: null };
      currency = account?.market === "Internacional" ? "USD" : "COP";
    }
    if (currency === "COP") {
      if (values.amount === null || values.amount === undefined) {
        return { ok: false, state: { errors: { amount: "Campo obligatorio" }, values: echo, message: "Revisa los campos marcados." } };
      }
      values.foreign_amount = null;
    } else {
      if (values.foreign_amount === null || values.foreign_amount === undefined) {
        return {
          ok: false,
          state: { errors: { foreign_amount: "Campo obligatorio" }, values: echo, message: "La cuenta es del mercado Internacional: indica el valor en USD." },
        };
      }
      delete values.amount;
      const { data: rate } = await db.rpc("exchange_rate_on", { p_currency: currency });
      usdPreview = rate ? Math.round(Number(values.foreign_amount) * Number(rate) * 100) / 100 : null;
    }
  }

  // Posibles duplicados al crear cuentas, contactos o prospectos.
  if (!id && ["accounts", "contacts", "leads"].includes(objectKey) && !opts.ignoreDuplicates) {
    const supabase = await createClient();
    const name = objectKey === "accounts" ? String(values.name ?? "")
      : objectKey === "contacts" ? `${values.first_name ?? ""} ${values.last_name ?? ""}`
        : `${values.first_name ?? ""} ${values.last_name ?? ""}${values.company ?? ""}`;
    const { data: dups } = await supabase.rpc("possible_duplicates", {
      p_object: objectKey,
      p_name: name,
      p_email: (values.email as string | null) ?? undefined,
      p_tax_id: (values.tax_id as string | null) ?? undefined,
    });
    if (dups?.length) {
      return {
        ok: false,
        state: {
          values: echo,
          message: "Encontramos registros que podrían ser el mismo. Revísalos o guarda de todas formas.",
          duplicates: dups.map((d) => ({ id: d.id, label: d.label, href: `${def.path}/${d.id}` })),
        },
      };
    }
  }

  // Reglas de validación sobre el estado final del registro.
  let candidate: Record<string, unknown> = { ...(before ?? {}), owner_id: before?.owner_id ?? user.id, ...values };
  if (objectKey === "opportunities") candidate = await withStageEffects(candidate, !before || before.stage_id !== values.stage_id);
  if (usdPreview !== null) candidate.amount = usdPreview;
  const invalid = await validateRecord(objectKey, candidate, user.id);
  if (invalid) {
    return {
      ok: false,
      state: { values: echo, message: invalid.message, errors: invalid.field ? { [invalid.field]: invalid.message } : undefined },
    };
  }
  if (opts.dryRun) return { ok: true, id, values, before };

  // La oportunidad nueva va al pipeline del canal de la cuenta (la base lleva la etapa al de ese canal), cierra
  // cuando vence la cotización y su valor queda sincronizado con ella.
  let createdOpportunity: string | null = null;
  if (newOpportunityForQuote) {
    const pipelines = await getPipelines();
    const pipeline = pipelines.find((p) => p.is_default && p.is_active) ?? pipelines.find((p) => p.is_active);
    const stage = pipeline?.stages.find((s) => s.category === "open");
    if (!stage) return { ok: false, state: { values: echo, message: "No hay un pipeline activo con etapas abiertas para crear la oportunidad." } };
    const { data: opp, error: oppError } = await db.from("opportunities").insert({
      name: values.name,
      account_id: values.account_id,
      contact_id: values.contact_id ?? null,
      stage_id: stage.id,
      pipeline_id: stage.pipeline_id,
      amount: 0,
      close_date: values.expiration_date ?? addDaysISO(todayISO(), 30),
      owner_id: values.owner_id ?? user.id,
    }).select("id").single();
    if (oppError || !opp) {
      return { ok: false, state: { values: echo, message: `No se pudo crear la oportunidad: ${friendlyError(oppError?.message ?? "sin permiso")}` } };
    }
    createdOpportunity = String(opp.id);
    values.opportunity_id = createdOpportunity;
  }

  if (!id && opts.newId) values.id = opts.newId;
  const result = id
    ? await db.from(def.table).update(values).eq("id", id).select("id").maybeSingle()
    : await db.from(def.table).insert(values).select("id").single();
  if (result.error || !result.data) {
    if (createdOpportunity) await db.from("opportunities").delete().eq("id", createdOpportunity);
    return {
      ok: false,
      state: { values: echo, message: result.error ? friendlyError(result.error.message) : "No tienes permiso para editar este registro." },
    };
  }

  if (createdOpportunity) {
    // Su valor es la suma de sus partes (cotizaciones): lo calcula la base al cambiar las líneas.
    await runAutomations("opportunities", "create", createdOpportunity, null, user.id);
  }
  await runAutomations(objectKey, id ? "update" : "create", result.data.id, before, user.id);
  // Reuniones a Outlook y tareas a Planner del propietario, si conectó su cuenta de Microsoft.
  if (objectKey === "activities") await syncActivityToMicrosoft(result.data.id);
  return { ok: true, id: result.data.id, values, before };
}
