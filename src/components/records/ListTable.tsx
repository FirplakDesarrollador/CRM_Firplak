import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import type { FieldDef, ObjectDef } from "@/lib/objects";
import type { ListParams } from "@/lib/records/filters";
import type { Row } from "@/lib/records/data";
import { FieldValue } from "./FieldValue";

export function hrefWith(path: string, current: Record<string, string>, patch: Record<string, string | null>) {
  const qs = new URLSearchParams(current);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === "") qs.delete(k);
    else qs.set(k, v);
  }
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

const UNSORTABLE = new Set(["lookup", "user", "stage", "multiselect"]);

export function ListTable({
  def,
  rows,
  count,
  params,
  current,
  basePath,
  emptyText,
}: {
  def: ObjectDef;
  rows: Row[];
  count: number;
  params: ListParams;
  current: Record<string, string>;
  basePath: string;
  emptyText?: string;
}) {
  const columns = params.columns
    .map((c) => def.fields.find((f) => f.name === c))
    .filter((f): f is FieldDef => Boolean(f));
  const pages = Math.max(1, Math.ceil(count / params.pageSize));
  const from = count === 0 ? 0 : (params.page - 1) * params.pageSize + 1;
  const to = Math.min(count, params.page * params.pageSize);

  return (
    <div className="card overflow-hidden">
      <div className="max-h-[calc(100dvh-16rem)] overflow-auto">
        <table className="table">
          <thead>
            <tr>
              {columns.map((col) => {
                const sortable = col.sortable !== false && !UNSORTABLE.has(col.type);
                const active = params.sort.field === col.name;
                const nextDir = active && params.sort.dir === "asc" ? "desc" : "asc";
                return (
                  <th key={col.name} aria-sort={active ? (params.sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                    {sortable ? (
                      <Link href={hrefWith(basePath, current, { sort: col.name, dir: nextDir, page: null })}
                        className="inline-flex items-center gap-1 no-underline hover:text-ink">
                        {col.label}
                        {active && (params.sort.dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                      </Link>
                    ) : (
                      col.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="py-14 text-center text-muted">
                  {emptyText ?? "No hay registros que coincidan con esta vista."}
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id}>
                {columns.map((col, i) => (
                  <td key={col.name} className={["currency", "number", "percent"].includes(col.type) ? "text-right" : undefined}>
                    <FieldValue field={col} row={row} linkName={i === 0 ? `${def.path}/${row.id}` : undefined} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-sm text-muted">
        <span>{count === 0 ? "0 registros" : `${from}–${to} de ${count.toLocaleString("es-CO")}`}</span>
        <div className="flex items-center gap-1">
          <PageLink disabled={params.page <= 1} href={hrefWith(basePath, current, { page: String(params.page - 1) })} label="Anterior">
            <ChevronLeft size={15} />
          </PageLink>
          <span className="px-2">Página {params.page} de {pages}</span>
          <PageLink disabled={params.page >= pages} href={hrefWith(basePath, current, { page: String(params.page + 1) })} label="Siguiente">
            <ChevronRight size={15} />
          </PageLink>
        </div>
      </div>
    </div>
  );
}

function PageLink({ disabled, href, label, children }: { disabled: boolean; href: string; label: string; children: React.ReactNode }) {
  if (disabled) return <span className="btn btn-sm btn-icon opacity-40" aria-disabled>{children}</span>;
  return <Link href={href} className="btn btn-sm btn-icon" aria-label={label}>{children}</Link>;
}
