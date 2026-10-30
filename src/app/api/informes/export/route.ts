import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { canSystem } from "@/lib/permissions";
import { isObjectKey } from "@/lib/objects";
import { getObjectDef } from "@/lib/records/data";
import { runReport } from "@/lib/reports/engine";
import { parseDefinition } from "@/lib/reports/types";

const escape = (s: string) => (/[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** Exporta el resumen de un informe (filas × columnas) a CSV. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!canSystem(user.access, "export")) return NextResponse.json({ error: "Sin permiso para exportar" }, { status: 403 });
  const sp = request.nextUrl.searchParams;
  const object = sp.get("objeto") ?? "";
  if (!isObjectKey(object)) return NextResponse.json({ error: "Objeto no válido" }, { status: 400 });
  const report = parseDefinition(sp.get("def"));
  const def = await getObjectDef(object);
  const result = await runReport(def, report, user.id);
  const g1 = def.fields.find((f) => f.name === report.groupBy);

  const header = [g1?.label ?? "Grupo", ...result.columns.map((c) => c.label), result.measureLabel, "Registros"];
  const lines = [
    header.map(escape).join(";"),
    ...result.groups.map((g) => [g.label, ...result.columns.map((c) => String(g.cells[c.key]?.value ?? "")), String(g.value), String(g.count)].map(escape).join(";")),
  ];
  const name = (sp.get("nombre") ?? "informe").normalize("NFD").replace(/[^\w-]+/g, "-").toLowerCase();
  return new NextResponse(`﻿${lines.join("\n")}`, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` },
  });
}
