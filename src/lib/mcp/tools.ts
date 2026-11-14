import "server-only";
import { createHash } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/session";
import { siteUrl } from "@/lib/env";
import { OBJECTS, fieldValue, recordTitle, type FieldDef, type Filter, type FilterOp, type ObjectDef, type ObjectKey } from "@/lib/objects";
import { getObjectDef, getRecord, listRecords, untypedClient, type Row } from "@/lib/records/data";
import { editableFields } from "@/lib/records/form";
import { persistRecord } from "@/lib/records/persist";
import { moveOpportunityStage, setActivityStatus } from "@/lib/records/actions";
import { validateRecord, withStageEffects } from "@/lib/rules/server";
import { periodStart } from "@/lib/goals/periods";
import type { McpIdentity } from "./auth";
import { canSystem } from "@/lib/permissions";
import { getCustomerSummary, invoiceStatus, sapAvailable } from "@/lib/sap/data";

const READ_OBJECTS = ["accounts", "contacts", "opportunities", "leads", "quotes", "orders", "cases", "campaigns", "products", "activities"] as const;
const WRITE_OBJECTS = ["accounts", "contacts", "opportunities", "leads", "cases", "activities"] as const;
const OPS = [
  "eq", "neq", "contains", "starts", "empty", "not_empty", "gt", "gte", "lt", "lte",
  "today", "this_week", "this_month", "this_quarter", "this_year", "last_n_days", "next_n_days", "overdue", "me",
] as const satisfies readonly FilterOp[];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MCP_INSTRUCTIONS = `CRM comercial de Firplak (muebles de baño, cocinas y superficies; Colombia, valores en COP).
Actúas como la persona dueña del token: solo ves y cambias lo que ella puede en el CRM.
- Para encontrar registros usa «buscar» o «listar»; para ver todo un registro, «ver».
- Antes de crear o actualizar, usa «describir_objeto» para conocer los campos y sus valores válidos.
- Todo cambio se hace en dos pasos: la primera llamada devuelve una VISTA PREVIA sin guardar nada.
  Muéstrala a la persona y pregúntale si confirma. Solo si responde que sí, repite la llamada con el
  mismo contenido y el código «confirmacion». Nunca confirmes por tu cuenta.
- Incluye el enlace «url» de los registros cuando los menciones.`;

class ToolError extends Error {}

const text = (value: unknown) => ({ content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });
const fail = (message: string) => ({ content: [{ type: "text" as const, text: message }], isError: true });
const urlOf = (def: ObjectDef, id: string) => `${siteUrl}${def.path}/${id}`;

/** Valor legible de un campo (nombres en lugar de ids, etiquetas de listas). */
function plain(f: FieldDef, row: Row): unknown {
  if (f.relation) {
    const rel = row[f.relation] as { name?: string; full_name?: string; email?: string } | null;
    if (rel || ["lookup", "user", "stage"].includes(f.type) || f.name === "pipeline_id") return rel ? rel.name ?? rel.full_name ?? rel.email ?? null : null;
  }
  const v = fieldValue(row, f.name);
  if (typeof v === "string" && f.optionLabels?.[v]) return f.optionLabels[v];
  return v ?? null;
}

function serialize(def: ObjectDef, row: Row, fields?: string[]) {
  const out: Record<string, unknown> = { id: row.id, nombre: recordTitle(def, row), url: urlOf(def, String(row.id)) };
  for (const f of def.fields) {
    if ((fields && !fields.includes(f.name)) || f.name === def.nameField) continue;
    const v = plain(f, row);
    if (v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)) out[f.name] = v;
  }
  return out;
}

async function log(identity: McpIdentity, tool: string, extra: { object?: string; record_id?: string | null; summary?: string; is_change?: boolean } = {}) {
  const supabase = await createClient();
  await supabase.from("mcp_activity").insert({
    user_id: identity.userId, token_id: identity.tokenId, tool, object: extra.object ?? null,
    record_id: extra.record_id ?? null, summary: extra.summary?.slice(0, 500) ?? null, is_change: extra.is_change ?? false,
  });
}

// ---------------------------------------------------------------------------- Cambios
/** Convierte un valor dado por el asistente (nombre o id) al id que espera el campo. */
async function resolveValue(def: ObjectDef, f: FieldDef, value: unknown, base: Row | null): Promise<unknown> {
  if (typeof value !== "string" || value === "" || UUID.test(value)) return value;
  const db = await untypedClient();
  if (f.type === "stage") {
    const pipelineId = base?.pipeline_id ?? (await db.from("pipelines").select("id").eq("is_default", true).maybeSingle()).data?.id;
    const { data } = await db.from("pipeline_stages").select("id, name").eq("pipeline_id", pipelineId).ilike("name", value);
    if (data?.length === 1) return data[0].id;
    throw new ToolError(`No encontré la etapa «${value}» en el pipeline de la oportunidad.`);
  }
  if (f.type === "user") {
    const { data } = await db.from("profiles").select("id").eq("is_active", true).or(`full_name.ilike.${value},email.ilike.${value}`);
    if (data?.length === 1) return data[0].id;
    throw new ToolError(`No encontré un único usuario activo «${value}» para ${f.label}.`);
  }
  if (f.type === "lookup" && f.lookup) {
    const target = OBJECTS[f.lookup];
    const { data } = await db.from(target.table).select("id").ilike(target.nameField, value).limit(2);
    if (data?.length === 1) return data[0].id;
    throw new ToolError(data?.length ? `Hay varios registros llamados «${value}» para ${f.label}; usa su id.` : `No encontré «${value}» para ${f.label}.`);
  }
  return value;
}

function append(fd: FormData, f: FieldDef, v: unknown) {
  if (v === null || v === undefined || v === "") return;
  if (Array.isArray(v)) return v.forEach((x) => fd.append(f.name, String(x)));
  if (f.type === "checkbox") {
    if (v === true || v === "true" || v === "on") fd.append(f.name, "on");
    return;
  }
  if (typeof v === "number" && f.type === "currency") return fd.append(f.name, String(Math.round(v * 100) / 100));
  fd.append(f.name, String(v));
}

/** FormData con el estado actual del registro (si existe) más los campos pedidos. */
async function buildForm(def: ObjectDef, base: Row | null, campos: Record<string, unknown>) {
  const editable = new Map(editableFields(def).map((f) => [f.name, f]));
  const unknown = Object.keys(campos).filter((k) => !editable.has(k));
  if (unknown.length) throw new ToolError(`Campos desconocidos o de solo lectura: ${unknown.join(", ")}. Usa «describir_objeto» para ver los campos editables.`);
  const fd = new FormData();
  if (base) for (const f of editable.values()) append(fd, f, fieldValue(base, f.name));
  const resolved: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(campos)) {
    const f = editable.get(k)!;
    resolved[k] = await resolveValue(def, f, v, base);
    fd.delete(k);
    append(fd, f, resolved[k]);
  }
  return fd;
}

function describeChanges(def: ObjectDef, base: Row | null, campos: Record<string, unknown>) {
  return Object.entries(campos).map(([k, v]) => {
    const f = def.fields.find((x) => x.name === k)!;
    const label = (x: unknown) => (typeof x === "string" && f.optionLabels?.[x]) || String(x);
    const after = Array.isArray(v) ? v.map(label).join(", ") : v === "" || v === null ? "(vacío)" : label(v);
    const before = base ? plain(f, base) : null;
    return base ? `- ${f.label}: ${before ?? "(vacío)"} → ${after}` : `- ${f.label}: ${after}`;
  }).join("\n");
}

/** Valores iniciales de un registro nuevo, como en los formularios «Nuevo…» de la app. */
async function createDefaults(object: ObjectKey): Promise<Record<string, unknown>> {
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  switch (object) {
    case "accounts": return { account_type: "Prospecto", billing_country: "Colombia" };
    case "leads": return { status: "Nuevo", country: "Colombia" };
    case "cases": return { status: "Nuevo", priority: "Media" };
    case "activities": return { activity_type: "task", status: "pending", priority: "normal" };
    case "opportunities": {
      const db = await untypedClient();
      const { data: pipeline } = await db.from("pipelines").select("id").eq("is_default", true).maybeSingle();
      const { data: stage } = await db.from("pipeline_stages").select("id")
        .eq("pipeline_id", pipeline?.id).eq("category", "open").order("sort_order").limit(1).maybeSingle();
      return { stage_id: stage?.id, close_date: in30, opportunity_type: "Nuevo negocio" };
    }
    default: return {};
  }
}

/** Dos pasos: sin código devuelve la vista previa; con el código aplica el cambio una sola vez. */
async function confirmFlow(identity: McpIdentity, tool: string, args: Record<string, unknown>, preview: string, apply: () => Promise<string>) {
  if (identity.scope !== "write") {
    return fail("Este token es de solo consulta: no puede hacer cambios. Pide un token con cambios (requiere el permiso «Hacer cambios con asistentes de IA»).");
  }
  const { confirmacion, ...rest } = args;
  const argsHash = createHash("sha256").update(JSON.stringify({ tool, rest })).digest("hex");
  const supabase = await createClient();
  if (!confirmacion) {
    const { data, error } = await supabase.from("mcp_confirmations")
      .insert({ user_id: identity.userId, token_id: identity.tokenId, tool, args_hash: argsHash, summary: preview }).select("id").single();
    if (error) return fail(error.message);
    return text(`VISTA PREVIA — todavía no se ha guardado nada.\n${preview}\n\nMuéstrale esto a la persona y pregúntale si confirma. Solo si responde que sí, llama de nuevo a «${tool}» con exactamente los mismos datos y "confirmacion": "${data.id}" (vence en 10 minutos).`);
  }
  const { data: used } = await supabase.from("mcp_confirmations")
    .update({ used_at: new Date().toISOString() })
    .eq("id", String(confirmacion)).eq("tool", tool).eq("args_hash", argsHash).is("used_at", null).gt("expires_at", new Date().toISOString())
    .select("id");
  if (!used?.length) return fail("Código de confirmación no válido, vencido, ya usado o para otros datos. Vuelve a pedir la vista previa.");
  return text(await apply());
}

// ---------------------------------------------------------------------------- Servidor
export function buildMcpServer(identity: McpIdentity) {
  const server = new McpServer({ name: "firplak-crm", version: "1.0.0" }, { instructions: MCP_INSTRUCTIONS });
  const readOnly = { readOnlyHint: true, openWorldHint: false };
  const objectRead = z.enum(READ_OBJECTS).describe("Objeto del CRM: accounts (cuentas), contacts (contactos), opportunities (oportunidades), leads (prospectos), quotes (cotizaciones), orders (pedidos), cases (casos), campaigns (campañas), products (productos), activities (actividades)");
  const objectWrite = z.enum(WRITE_OBJECTS).describe("Objeto a crear o modificar");
  const confirmacion = z.string().optional().describe("Código devuelto por la vista previa, solo después de que la persona confirme");

  // Envoltura común: errores legibles y registro de uso.
  const run = <A,>(tool: string, fn: (args: A) => Promise<ReturnType<typeof text> | ReturnType<typeof fail>>) => async (args: A) => {
    try {
      const result = await fn(args);
      const a = args as Record<string, unknown>;
      await log(identity, tool, {
        object: typeof a.objeto === "string" ? a.objeto : undefined,
        record_id: [a.id, a.oportunidad_id, a.actividad_id].find((v): v is string => typeof v === "string" && UUID.test(v)) ?? null,
        summary: JSON.stringify(a),
        is_change: Boolean(a.confirmacion) && !("isError" in result && result.isError),
      });
      return result;
    } catch (e) {
      return fail(e instanceof ToolError ? e.message : `Error: ${(e as Error).message}`);
    }
  };

  server.registerTool("describir_objeto", {
    title: "Describir objeto",
    description: "Campos de un objeto del CRM: nombre interno, etiqueta, tipo, si es obligatorio o editable y valores válidos de las listas.",
    inputSchema: { objeto: objectRead },
    annotations: readOnly,
  }, run("describir_objeto", async ({ objeto }: { objeto: ObjectKey }) => {
    const def = await getObjectDef(objeto);
    const editable = new Set(editableFields(def).map((f) => f.name));
    return text({
      objeto, etiqueta: def.label, plural: def.plural,
      campos: def.fields.map((f) => ({
        campo: f.name, etiqueta: f.label, tipo: f.type, obligatorio: Boolean(f.required), editable: editable.has(f.name),
        ...(f.options?.length ? { valores: f.options } : {}),
        ...(f.lookup ? { relacionado_con: f.lookup, acepta: "id o nombre exacto" } : {}),
        ...(f.type === "stage" ? { acepta: "id o nombre de la etapa" } : {}),
        ...(f.type === "user" ? { acepta: "id, nombre o correo del usuario" } : {}),
        ...(f.help ? { ayuda: f.help } : {}),
      })),
    });
  }));

  server.registerTool("buscar", {
    title: "Buscar en el CRM",
    description: "Búsqueda global por texto en cuentas, contactos, oportunidades, prospectos, cotizaciones, pedidos, casos, campañas y productos.",
    inputSchema: { texto: z.string().min(2).describe("Texto a buscar (nombre, NIT, correo, número…)") },
    annotations: readOnly,
  }, run("buscar", async ({ texto }: { texto: string }) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("global_search", { p_query: texto, p_limit: 8 });
    if (error) return fail(error.message);
    return text((data ?? []).map((r) => {
      const def = OBJECTS[r.object as ObjectKey];
      return { objeto: r.object, id: r.id, nombre: r.title, detalle: r.subtitle, url: def ? urlOf(def, r.id) : null };
    }));
  }));

  server.registerTool("listar", {
    title: "Listar registros",
    description: "Lista registros de un objeto con filtros, orden y alcance (todos, míos o de mis equipos). Máximo 50.",
    inputSchema: {
      objeto: objectRead,
      filtros: z.array(z.object({
        campo: z.string().describe("Nombre interno del campo (ver describir_objeto)"),
        operador: z.enum(OPS).describe("eq, neq, contains, starts, empty, not_empty, gt, gte, lt, lte, today, this_week, this_month, this_quarter, this_year, last_n_days, next_n_days, overdue, me"),
        valor: z.string().optional(),
      })).optional(),
      texto: z.string().optional().describe("Búsqueda dentro de la lista"),
      alcance: z.enum(["all", "mine", "team"]).optional().describe("all = todo lo visible, mine = míos, team = donde estoy en el equipo"),
      orden: z.object({ campo: z.string(), dir: z.enum(["asc", "desc"]) }).optional(),
      limite: z.number().int().min(1).max(50).optional(),
    },
    annotations: readOnly,
  }, run("listar", async (a: { objeto: ObjectKey; filtros?: { campo: string; operador: FilterOp; valor?: string }[]; texto?: string; alcance?: "all" | "mine" | "team"; orden?: { campo: string; dir: "asc" | "desc" }; limite?: number }) => {
    const def = await getObjectDef(a.objeto);
    const names = new Set(def.fields.map((f) => f.name));
    const bad = (a.filtros ?? []).filter((f) => !names.has(f.campo)).map((f) => f.campo);
    if (bad.length) return fail(`Campos desconocidos en los filtros: ${bad.join(", ")}. Usa describir_objeto.`);
    const user = await getCurrentUser();
    const { rows, count, error } = await listRecords(def, {
      q: a.texto ?? "", viewId: null,
      filters: (a.filtros ?? []).map((f): Filter => ({ field: f.campo, op: f.operador, value: f.valor ?? "" })),
      columns: def.defaultColumns,
      sort: a.orden && names.has(a.orden.campo) ? { field: a.orden.campo, dir: a.orden.dir } : def.defaultSort,
      scope: a.alcance === "team" && (a.objeto === "accounts" || a.objeto === "opportunities") ? "team" : a.alcance === "mine" ? "mine" : "all",
      credit: null, page: 1, pageSize: a.limite ?? 20,
    }, user!.id);
    if (error) return fail(error);
    return text({ total: count, mostrando: rows.length, registros: rows.map((r) => serialize(def, r, [...def.defaultColumns, ...(def.highlightFields ?? [])])) });
  }));

  server.registerTool("ver", {
    title: "Ver registro",
    description: "Todos los campos de un registro y sus actividades abiertas.",
    inputSchema: { objeto: objectRead, id: z.string().uuid() },
    annotations: readOnly,
  }, run("ver", async ({ objeto, id }: { objeto: ObjectKey; id: string }) => {
    const def = await getObjectDef(objeto);
    const row = await getRecord(def, id);
    if (!row) return fail("El registro no existe o no tienes acceso.");
    const link: Partial<Record<ObjectKey, string>> = { accounts: "account_id", contacts: "contact_id", opportunities: "opportunity_id", leads: "lead_id", cases: "case_id" };
    let actividades: unknown[] = [];
    if (link[objeto]) {
      const supabase = await createClient();
      const { data } = await supabase.from("activities")
        .select("id, activity_type, subject, due_date, start_at, status, priority")
        .eq(link[objeto]!, id).in("status", ["pending", "in_progress"]).order("due_date", { nullsFirst: false }).limit(15);
      actividades = data ?? [];
    }
    return text({ ...serialize(def, row), actividades_abiertas: actividades });
  }));

  server.registerTool("mis_pendientes", {
    title: "Mis pendientes",
    description: "Tareas, llamadas y reuniones vencidas y de los próximos 7 días, y aprobaciones que esperan mi decisión.",
    inputSchema: {},
    annotations: readOnly,
  }, run("mis_pendientes", async () => {
    const supabase = await createClient();
    const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const [acts, approvals] = await Promise.all([
      supabase.from("activities").select("id, activity_type, subject, due_date, start_at, priority, account:accounts(name), opportunity:opportunities(name)")
        .eq("owner_id", identity.userId).in("status", ["pending", "in_progress"])
        .or(`due_date.lte.${in7},start_at.lte.${in7}T23:59:59`).order("due_date", { nullsFirst: false }).limit(40),
      supabase.from("approval_requests").select("id, object, record_id, record_name, process_name, current_step_name, submitted_at")
        .eq("approver_id", identity.userId).eq("status", "pending").limit(20),
    ]);
    return text({
      actividades: (acts.data ?? []).map((a) => ({ ...a, url: `${siteUrl}${OBJECTS.activities.path}/${a.id}` })),
      aprobaciones: (approvals.data ?? []).map((r) => ({ ...r, url: `${siteUrl}${OBJECTS[r.object as ObjectKey]?.path ?? ""}/${r.record_id}` })),
    });
  }));

  const period = z.enum(["month", "quarter", "year"]).describe("month = mes, quarter = trimestre, year = año");
  server.registerTool("pronostico", {
    title: "Pronóstico de ventas",
    description: "Cerrado, compromiso, mejor caso y pipeline por asesor frente a su meta, para un periodo (con reparto de ingresos).",
    inputSchema: { periodo: period, inicio: z.string().optional().describe("Fecha AAAA-MM-DD dentro del periodo; por defecto, hoy") },
    annotations: readOnly,
  }, run("pronostico", async ({ periodo, inicio }: { periodo: "month" | "quarter" | "year"; inicio?: string }) => {
    const start = periodStart(periodo, inicio ?? new Date().toISOString().slice(0, 10));
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("forecast_summary", { p_period_type: periodo, p_period_start: start });
    if (error) return fail(error.message);
    return text({ periodo, inicio: start, asesores: (data ?? []).map(({ can_adjust: _c, ...r }) => r) });
  }));

  server.registerTool("metas", {
    title: "Avance de metas",
    description: "Metas del periodo (ventas ganadas, negocios, oportunidades, prospectos, actividades) con su avance real.",
    inputSchema: { periodo: period, inicio: z.string().optional() },
    annotations: readOnly,
  }, run("metas", async ({ periodo, inicio }: { periodo: "month" | "quarter" | "year"; inicio?: string }) => {
    const start = periodStart(periodo, inicio ?? new Date().toISOString().slice(0, 10));
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("goal_progress", { p_period_type: periodo, p_period_start: start });
    if (error) return fail(error.message);
    return text({ periodo, inicio: start, metas: data ?? [] });
  }));

  server.registerTool("indicadores", {
    title: "Indicadores comerciales",
    description: "KPIs de un rango de fechas (ventas ganadas, pipeline, ponderado, tasa de éxito, ticket promedio…) y ranking por asesor.",
    inputSchema: {
      desde: z.string().describe("AAAA-MM-DD"), hasta: z.string().describe("AAAA-MM-DD"),
      asesor_id: z.string().uuid().optional().describe("Solo este asesor (con su parte del reparto de ingresos)"),
    },
    annotations: readOnly,
  }, run("indicadores", async ({ desde, hasta, asesor_id }: { desde: string; hasta: string; asesor_id?: string }) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("crm_dashboard", { p_from: desde, p_to: hasta, p_owner: asesor_id });
    if (error) return fail(error.message);
    const d = data as { kpis: unknown; by_owner: unknown[] };
    return text({ desde, hasta, kpis: d.kpis, ranking_asesores: d.by_owner.slice(0, 15) });
  }));

  server.registerTool("sap_cliente", {
    title: "Cliente en SAP Business One",
    description: "Cartera, cupo de crédito, pedidos de venta abiertos y facturas recientes de una cuenta en SAP (por su Código SAP). Solo lectura; requiere el permiso «Ver información de SAP».",
    inputSchema: { cuenta_id: z.string().uuid().optional(), codigo_sap: z.string().optional().describe("CardCode, si no se da la cuenta") },
    annotations: readOnly,
  }, run("sap_cliente", async ({ cuenta_id, codigo_sap }: { cuenta_id?: string; codigo_sap?: string }) => {
    const user = await getCurrentUser();
    if (!(await sapAvailable())) return fail("SAP Business One no está configurado en el CRM.");
    if (!user || !canSystem(user.access, "view_sap")) return fail("Tu perfil no tiene el permiso «Ver información de SAP».");
    let code = codigo_sap?.trim().toUpperCase() ?? "";
    if (cuenta_id) {
      const supabase = await createClient();
      const { data } = await supabase.from("accounts").select("sap_card_code").eq("id", cuenta_id).maybeSingle();
      if (!data) return fail("La cuenta no existe o no tienes acceso.");
      if (!data.sap_card_code) return fail("La cuenta no tiene Código SAP.");
      code = data.sap_card_code;
    }
    if (!code) return fail("Indica la cuenta o el Código SAP.");
    const summary = await getCustomerSummary(code);
    if (!summary) return fail(`No existe un socio de negocio ${code} en SAP.`);
    const p = summary.partner;
    return text({
      ...(summary.syncedAt ? { actualizado: summary.syncedAt } : {}),
      codigo: p.CardCode, nombre: p.CardName, saldo_cartera: p.CurrentAccountBalance, cupo_credito: p.CreditLimit,
      cupo_disponible: p.CreditLimit - p.CurrentAccountBalance - p.OpenDeliveryNotesBalance - p.OpenOrdersBalance,
      pedidos_abiertos: summary.orders.map((o) => ({ numero: o.DocNum, fecha: o.DocDate.slice(0, 10), entrega: o.DocDueDate.slice(0, 10), oc_cliente: o.NumAtCard, total: o.DocTotal })),
      facturas: summary.invoices.map((i) => {
        const st = invoiceStatus(i);
        return { numero: i.DocNum, fecha: i.DocDate.slice(0, 10), vence: i.DocDueDate.slice(0, 10), total: i.DocTotal, pendiente: st.pending, abierta: st.open, vencida: st.overdue };
      }),
    });
  }));

  // ---------------------------------------------------------------- Herramientas de cambio
  const change = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

  server.registerTool("crear_registro", {
    title: "Crear registro",
    description: "Crea una cuenta, contacto, oportunidad, prospecto, caso o actividad. Primero devuelve una vista previa; requiere la confirmación de la persona.",
    inputSchema: {
      objeto: objectWrite,
      campos: z.record(z.string(), z.unknown()).describe("Campo → valor (nombres internos de describir_objeto)"),
      ignorar_duplicados: z.boolean().optional().describe("Crear aunque haya registros parecidos (solo si la persona lo pide)"),
      confirmacion,
    },
    annotations: change,
  }, run("crear_registro", async (a: { objeto: ObjectKey; campos: Record<string, unknown>; ignorar_duplicados?: boolean; confirmacion?: string }) => {
    const def = await getObjectDef(a.objeto);
    const user = (await getCurrentUser())!;
    // Lo que no indique el asistente toma el valor inicial de los formularios.
    const campos = { ...(await createDefaults(a.objeto)), ...a.campos };
    const fd = await buildForm(def, null, campos);
    const check = await persistRecord(a.objeto, null, fd, user, { dryRun: true, ignoreDuplicates: a.ignorar_duplicados });
    if (!check.ok) {
      const dups = check.state.duplicates?.map((d) => `- ${d.label}: ${siteUrl}${d.href}`).join("\n");
      const errs = check.state.errors ? Object.entries(check.state.errors).map(([k, v]) => `- ${k}: ${v}`).join("\n") : "";
      return fail([check.state.message, errs, dups].filter(Boolean).join("\n"));
    }
    return confirmFlow(identity, "crear_registro", a, `Crear ${def.label.toLowerCase()}:\n${describeChanges(def, null, campos)}`, async () => {
      const done = await persistRecord(a.objeto, null, await buildForm(def, null, campos), user, { ignoreDuplicates: a.ignorar_duplicados });
      if (!done.ok) throw new ToolError(done.state.message ?? "No se pudo crear el registro.");
      return `Creado: ${urlOf(def, done.id!)}`;
    });
  }));

  server.registerTool("actualizar_registro", {
    title: "Actualizar registro",
    description: "Cambia campos de un registro existente. Primero devuelve una vista previa (antes → después); requiere la confirmación de la persona.",
    inputSchema: { objeto: objectWrite, id: z.string().uuid(), campos: z.record(z.string(), z.unknown()), confirmacion },
    annotations: change,
  }, run("actualizar_registro", async (a: { objeto: ObjectKey; id: string; campos: Record<string, unknown>; confirmacion?: string }) => {
    const def = await getObjectDef(a.objeto);
    const user = (await getCurrentUser())!;
    const base = await getRecord(def, a.id);
    if (!base) return fail("El registro no existe o no tienes acceso.");
    if (!Object.keys(a.campos).length) return fail("Indica al menos un campo a cambiar.");
    const check = await persistRecord(a.objeto, a.id, await buildForm(def, base, a.campos), user, { dryRun: true });
    if (!check.ok) return fail([check.state.message, ...Object.entries(check.state.errors ?? {}).map(([k, v]) => `- ${k}: ${v}`)].filter(Boolean).join("\n"));
    const { data: canEdit } = await (await createClient()).rpc("can_edit_team_record", { p_object: a.objeto, p_owner: String(base.owner_id ?? "00000000-0000-0000-0000-000000000000"), p_id: a.id });
    if (!canEdit) return fail("No tienes permiso para editar este registro.");
    return confirmFlow(identity, "actualizar_registro", a, `Actualizar «${recordTitle(def, base)}» (${urlOf(def, a.id)}):\n${describeChanges(def, base, a.campos)}`, async () => {
      const done = await persistRecord(a.objeto, a.id, await buildForm(def, await getRecord(def, a.id), a.campos), user);
      if (!done.ok) throw new ToolError(done.state.message ?? "No se pudo actualizar el registro.");
      return `Actualizado: ${urlOf(def, a.id)}`;
    });
  }));

  server.registerTool("mover_etapa", {
    title: "Mover oportunidad de etapa",
    description: "Cambia la etapa de una oportunidad (también ganada o perdida). Primero devuelve una vista previa; requiere confirmación.",
    inputSchema: {
      oportunidad_id: z.string().uuid(),
      etapa: z.string().describe("Nombre o id de la etapa"),
      motivo_perdida: z.string().optional().describe("Obligatorio al marcarla perdida si una regla lo exige"),
      confirmacion,
    },
    annotations: change,
  }, run("mover_etapa", async (a: { oportunidad_id: string; etapa: string; motivo_perdida?: string; confirmacion?: string }) => {
    const def = await getObjectDef("opportunities");
    const user = (await getCurrentUser())!;
    const base = await getRecord(def, a.oportunidad_id);
    if (!base) return fail("La oportunidad no existe o no tienes acceso.");
    const stageField = def.fields.find((f) => f.type === "stage")!;
    const stageId = String(await resolveValue(def, stageField, a.etapa, base));
    const supabase = await createClient();
    const { data: stage } = await supabase.from("pipeline_stages").select("name, probability, pipeline_id").eq("id", stageId).maybeSingle();
    if (!stage || stage.pipeline_id !== base.pipeline_id) return fail("La etapa no pertenece al pipeline de la oportunidad.");
    const candidate = await withStageEffects({ ...base, stage_id: stageId, ...(a.motivo_perdida ? { loss_reason: a.motivo_perdida } : {}) }, true);
    const invalid = await validateRecord("opportunities", candidate, user.id);
    if (invalid) return fail(invalid.message);
    const current = (base.stage as { name?: string } | null)?.name ?? "—";
    return confirmFlow(identity, "mover_etapa", a,
      `Mover «${recordTitle(def, base)}» (${urlOf(def, a.oportunidad_id)}):\n- Etapa: ${current} → ${stage.name} (probabilidad ${stage.probability} %)${a.motivo_perdida ? `\n- Motivo de pérdida: ${a.motivo_perdida}` : ""}`,
      async () => {
        const r = await moveOpportunityStage(a.oportunidad_id, stageId, a.motivo_perdida);
        if (!r.ok) throw new ToolError(r.message ?? "No se pudo mover la oportunidad.");
        return `Oportunidad movida a «${stage.name}»: ${urlOf(def, a.oportunidad_id)}`;
      });
  }));

  server.registerTool("completar_actividad", {
    title: "Completar actividad",
    description: "Marca como completada una tarea, llamada o reunión. Primero devuelve una vista previa; requiere confirmación.",
    inputSchema: { actividad_id: z.string().uuid(), confirmacion },
    annotations: change,
  }, run("completar_actividad", async (a: { actividad_id: string; confirmacion?: string }) => {
    const supabase = await createClient();
    const { data: act } = await supabase.from("activities").select("id, subject, activity_type, status").eq("id", a.actividad_id).maybeSingle();
    if (!act) return fail("La actividad no existe o no tienes acceso.");
    if (act.status === "completed") return fail("La actividad ya está completada.");
    return confirmFlow(identity, "completar_actividad", a, `Completar la actividad «${act.subject}» (${act.activity_type}).`, async () => {
      const r = await setActivityStatus(a.actividad_id, "completed");
      if (!r.ok) throw new ToolError(r.message ?? "No se pudo completar la actividad.");
      return `Actividad «${act.subject}» completada.`;
    });
  }));

  return server;
}
