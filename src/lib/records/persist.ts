import "server-only";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import type { ObjectKey } from "@/lib/objects";
import type { CurrentUser } from "@/lib/session";
import { validateRecord, withStageEffects } from "@/lib/rules/server";
import { runAutomations } from "@/lib/rules/automation";
import { syncActivityToMicrosoft } from "@/lib/ms365/sync";
import { getObjectDef, untypedClient } from "./data";
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
 * guardar (vista previa de los asistentes de IA).
 */
export async function persistRecord(
  objectKey: ObjectKey,
  id: string | null,
  formData: FormData,
  user: CurrentUser,
  opts: { dryRun?: boolean; ignoreDuplicates?: boolean } = {},
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

  const result = id
    ? await db.from(def.table).update(values).eq("id", id).select("id").maybeSingle()
    : await db.from(def.table).insert(values).select("id").single();
  if (result.error || !result.data) {
    return {
      ok: false,
      state: { values: echo, message: result.error ? friendlyError(result.error.message) : "No tienes permiso para editar este registro." },
    };
  }

  await runAutomations(objectKey, id ? "update" : "create", result.data.id, before, user.id);
  // Reuniones a Outlook y tareas a Planner del propietario, si conectó su cuenta de Microsoft.
  if (objectKey === "activities") await syncActivityToMicrosoft(result.data.id);
  return { ok: true, id: result.data.id, values, before };
}
