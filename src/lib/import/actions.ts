"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { OBJECTS, columnFor, isObjectKey, type ObjectKey } from "@/lib/objects";
import { getObjectDef, getPipelines, getUsers, untypedClient } from "@/lib/records/data";
import { editableFields } from "@/lib/records/form";
import { validateRecord, withStageEffects } from "@/lib/rules/server";
import { addDaysISO, todayISO } from "@/lib/format";
import { convertCell } from "./convert";
import { IMPORTABLE, MATCH_FIELDS } from "./config";

export type ChunkResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
  fatal?: string;
};

type ChunkInput = {
  object: string;
  mode: "create" | "upsert";
  matchField: string | null;
  /** índice de columna → nombre de campo */
  mapping: Record<string, string>;
  rows: string[][];
  /** número de fila (1 = primera fila de datos) del primer elemento de `rows` */
  startRow: number;
};

const norm = (s: string) => s.trim().toLowerCase();

/** Importa un lote de filas. Se llama varias veces desde el asistente. */
export async function importChunk(input: ChunkInput): Promise<ChunkResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const result: ChunkResult = { created: 0, updated: 0, skipped: 0, errors: [] };
  if (!isObjectKey(input.object) || !IMPORTABLE.includes(input.object)) return { ...result, fatal: "Objeto no importable" };
  const object: ObjectKey = input.object;
  const def = await getObjectDef(object);
  if (!can(user.access, def.permission, "create") && input.mode === "create") return { ...result, fatal: "No tienes permiso para crear estos registros." };
  if (input.mode === "upsert" && !can(user.access, def.permission, "edit")) return { ...result, fatal: "No tienes permiso para actualizar estos registros." };

  const allowed = new Map(editableFields(def).map((f) => [f.name, f]));
  const mapped = Object.entries(input.mapping)
    .filter(([, field]) => allowed.has(field))
    .map(([col, field]) => ({ col: Number(col), field: allowed.get(field)! }));
  const matchField = input.mode === "upsert" && input.matchField && (MATCH_FIELDS[object] ?? []).includes(input.matchField) ? input.matchField : null;
  const matchColKey = matchField ? Object.entries(input.mapping).find(([, f]) => f === matchField)?.[0] : undefined;
  const matchCol = matchColKey === undefined ? -1 : Number(matchColKey);

  const db = await untypedClient();

  // ----- Resolución de relaciones por nombre (en lote) -----
  const lookupMaps = new Map<string, Map<string, string>>();
  const [users, pipelines] = await Promise.all([getUsers(), getPipelines()]);
  const userByKey = new Map<string, string>();
  users.forEach((u) => { userByKey.set(norm(u.full_name), u.id); userByKey.set(norm(u.email), u.id); });
  const stageByName = new Map<string, { id: string; pipeline_id: string }>();
  const defaultPipeline = pipelines.find((p) => p.is_default) ?? pipelines[0];
  // Las etapas del pipeline por defecto tienen prioridad cuando el nombre se repite.
  [...pipelines].reverse().forEach((p) => p.stages.forEach((s) => stageByName.set(norm(s.name), { id: s.id, pipeline_id: p.id })));
  defaultPipeline?.stages.forEach((s) => stageByName.set(norm(s.name), { id: s.id, pipeline_id: defaultPipeline.id }));

  for (const { col, field } of mapped) {
    if (field.type !== "lookup" || !field.lookup) continue;
    const target = OBJECTS[field.lookup];
    const names = [...new Set(input.rows.map((r) => (r[col] ?? "").trim()).filter(Boolean))];
    const map = new Map<string, string>();
    if (names.length) {
      const { data } = await db.from(target.table).select(`id, ${target.nameField}`).in(target.nameField, names);
      for (const row of (data ?? []) as unknown as Record<string, string>[]) map.set(norm(row[target.nameField]), row.id);
      // Segundo intento sin distinguir mayúsculas para los que no aparecieron.
      for (const name of names.filter((n) => !map.has(norm(n))).slice(0, 50)) {
        const { data: found } = await db.from(target.table).select("id").ilike(target.nameField, name.replace(/[%_]/g, "")).limit(1);
        const hit = (found as { id: string }[] | null)?.[0];
        if (hit) map.set(norm(name), hit.id);
      }
    }
    lookupMaps.set(field.name, map);
  }

  // ----- Registros existentes para actualizar -----
  const existing = new Map<string, Record<string, unknown>>();
  // El NIT se compara solo por sus dígitos ("860.045.998-1" = "860045998-1").
  const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
  const keyOf = (v: unknown) => (matchField === "tax_id" ? digits(v) : norm(String(v ?? "")));
  if (matchField === "tax_id" && matchCol >= 0) {
    const wanted = new Set(input.rows.map((r) => digits(r[matchCol])).filter((d) => d.length >= 6));
    if (wanted.size) {
      const { data: all } = await db.from(def.table).select("id, tax_id").not("tax_id", "is", null).limit(20000);
      const ids = ((all ?? []) as { id: string; tax_id: string }[]).filter((a) => wanted.has(digits(a.tax_id))).map((a) => a.id);
      if (ids.length) {
        const { data } = await db.from(def.table).select("*").in("id", ids);
        for (const row of (data ?? []) as Record<string, unknown>[]) existing.set(digits(row.tax_id), row);
      }
    }
  } else if (matchField && matchCol >= 0) {
    const keys = [...new Set(input.rows.map((r) => (r[matchCol] ?? "").trim()).filter(Boolean))];
    if (keys.length) {
      const { data } = await db.from(def.table).select("*").in(columnFor(matchField), keys);
      for (const row of (data ?? []) as Record<string, unknown>[]) existing.set(norm(String(row[matchField] ?? "")), row);
      if (matchField === "email" || matchField === "name" || matchField === "full_name") {
        for (const key of keys.filter((k) => !existing.has(norm(k))).slice(0, 100)) {
          const { data: found } = await db.from(def.table).select("*").ilike(matchField, key.replace(/[%_]/g, "")).limit(1);
          const hit = (found as Record<string, unknown>[] | null)?.[0];
          if (hit) existing.set(norm(key), hit);
        }
      }
    }
  }

  const required = editableFields(def).filter((f) => f.required);

  for (let i = 0; i < input.rows.length; i++) {
    const rowNumber = input.startRow + i;
    const raw = input.rows[i];
    const values: Record<string, unknown> = {};
    const custom: Record<string, unknown> = {};
    const errors: string[] = [];

    for (const { col, field } of mapped) {
      const cell = (raw[col] ?? "").trim();
      let value: unknown;
      if (field.type === "lookup") {
        if (!cell) value = null;
        else {
          value = lookupMaps.get(field.name)?.get(norm(cell)) ?? null;
          if (!value) errors.push(`${field.label}: no se encontró “${cell}”`);
        }
      } else if (field.type === "user") {
        value = cell ? userByKey.get(norm(cell)) ?? null : null;
        if (cell && !value) errors.push(`${field.label}: usuario “${cell}” no encontrado`);
      } else if (field.type === "stage") {
        const stage = cell ? stageByName.get(norm(cell)) : undefined;
        if (cell && !stage) errors.push(`${field.label}: etapa “${cell}” no encontrada`);
        if (stage) { value = stage.id; values.pipeline_id = stage.pipeline_id; }
      } else {
        const converted = convertCell(field, cell);
        if (!converted.ok) errors.push(converted.error);
        else value = converted.value;
      }
      if (value === undefined) continue;
      if (field.custom) custom[field.name.slice(3)] = value;
      else values[field.name] = value;
    }

    const key = matchCol >= 0 ? keyOf(raw[matchCol]) : "";
    const before = key ? existing.get(key) ?? null : null;

    if (!before) {
      // Valores por defecto para crear oportunidades sin etapa / fecha / valor.
      if (object === "opportunities") {
        if (!values.stage_id && defaultPipeline) {
          const first = defaultPipeline.stages.find((s) => s.category === "open");
          if (first) { values.stage_id = first.id; values.pipeline_id = defaultPipeline.id; }
        }
        values.close_date ??= addDaysISO(todayISO(), 30);
        values.amount ??= 0;
      }
      if (object === "accounts") values.account_type ??= "Prospecto";
      if (object === "leads") values.status ??= "Nuevo";
      if (object === "products") values.unit ??= "Unidad";
      for (const f of required) {
        const v = f.custom ? custom[f.name.slice(3)] : values[f.name];
        if (v === null || v === undefined || v === "") errors.push(`${f.label}: obligatorio`);
      }
    }
    if (errors.length) {
      result.errors.push({ row: rowNumber, message: errors.join(" · ") });
      result.skipped += 1;
      continue;
    }

    if (Object.keys(custom).length || !before) {
      values.custom_fields = { ...((before?.custom_fields as object) ?? {}), ...custom };
    }
    let candidate: Record<string, unknown> = { ...(before ?? {}), owner_id: before?.owner_id ?? values.owner_id ?? user.id, ...values };
    if (object === "opportunities") candidate = await withStageEffects(candidate, !before || before.stage_id !== values.stage_id);
    const invalid = await validateRecord(object, candidate, user.id);
    if (invalid) {
      result.errors.push({ row: rowNumber, message: invalid.message });
      result.skipped += 1;
      continue;
    }

    const { error, data } = before
      ? await db.from(def.table).update(values).eq("id", String(before.id)).select("id")
      : await db.from(def.table).insert(values).select("id");
    if (error || !data?.length) {
      result.errors.push({ row: rowNumber, message: error ? error.message : "Sin permiso para actualizar este registro" });
      result.skipped += 1;
    } else if (before) result.updated += 1;
    else {
      result.created += 1;
      // Si el mismo archivo trae la clave repetida, la siguiente fila actualiza este registro.
      if (key) existing.set(key, { ...values, id: (data[0] as { id: string }).id });
    }
  }
  return result;
}

export async function logImport(summary: {
  object: string; fileName: string; mode: "create" | "upsert"; matchField: string | null;
  total: number; created: number; updated: number; skipped: number; errors: { row: number; message: string }[];
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const supabase = await createClient();
  await supabase.from("import_jobs").insert({
    object: summary.object,
    file_name: summary.fileName,
    mode: summary.mode,
    match_field: summary.matchField,
    total: summary.total,
    created: summary.created,
    updated: summary.updated,
    skipped: summary.skipped,
    errors: summary.errors.slice(0, 500),
    created_by: user.id,
  });
  revalidatePath("/", "layout");
}

