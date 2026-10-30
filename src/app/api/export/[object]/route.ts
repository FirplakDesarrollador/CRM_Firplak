import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { canSystem } from "@/lib/permissions";
import { fieldValue, isObjectKey, type FieldDef } from "@/lib/objects";
import { getListViews, getObjectDef, listRecords } from "@/lib/records/data";
import { parseListParams } from "@/lib/records/filters";

function cell(field: FieldDef, row: Record<string, unknown>) {
  const rel = field.relation ? (row[field.relation] as { name?: string; full_name?: string } | null) : null;
  if (rel) return rel.name ?? rel.full_name ?? "";
  const v = fieldValue(row, field.name);
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.join("; ");
  if (field.type === "checkbox") return v ? "Sí" : "No";
  return field.optionLabels?.[String(v)] ?? String(v);
}

const escape = (s: string) => (/[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** Exporta la vista actual (mismos filtros y columnas) a CSV. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/export/[object]">) {
  const { object } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!canSystem(user.access, "export")) return NextResponse.json({ error: "Sin permiso para exportar" }, { status: 403 });
  if (!isObjectKey(object)) return NextResponse.json({ error: "Objeto no válido" }, { status: 400 });

  const sp = Object.fromEntries(request.nextUrl.searchParams.entries());
  const [def, views] = await Promise.all([getObjectDef(object), getListViews(object)]);
  const view = views.find((v) => v.id === sp.view) ?? null;
  const params = parseListParams(def, sp, view?.definition ?? null, 5000);
  const { rows, error } = await listRecords(def, params, user.id, { all: true });
  if (error) return NextResponse.json({ error }, { status: 400 });

  const fields = params.columns.map((c) => def.fields.find((f) => f.name === c)!).filter(Boolean);
  const lines = [fields.map((f) => escape(f.label)).join(";"), ...rows.map((r) => fields.map((f) => escape(cell(f, r))).join(";"))];
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(`﻿${lines.join("\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${object}-${date}.csv"`,
    },
  });
}
