import Link from "next/link";
import { Plus } from "lucide-react";
import type { FieldDef, ObjectDef } from "@/lib/objects";
import type { Row } from "@/lib/records/data";
import { FieldValue } from "./FieldValue";

import { Tr } from "@/components/ui/Tr";
export function RelatedList({
  def,
  title,
  rows,
  columns,
  newHref,
  viewAllHref,
  emptyText,
}: {
  def: ObjectDef;
  title: string;
  rows: Row[];
  columns: string[];
  newHref?: string;
  viewAllHref?: string;
  emptyText?: string;
}) {
  const fields = columns.map((c) => def.fields.find((f) => f.name === c)).filter((f): f is FieldDef => Boolean(f));
  return (
    <section className="card overflow-hidden">
      <div className="card-header">
        <h2 className="card-title"><Tr>{title}</Tr> <span className="badge">{rows.length}</span></h2>
        <div className="flex gap-2">
          {viewAllHref && rows.length > 0 && <Link href={viewAllHref} className="btn btn-sm btn-ghost"><Tr>Ver todo</Tr></Link>}
          {newHref && <Link href={newHref} className="btn btn-sm"><Plus size={14} /> <Tr>Nuevo</Tr></Link>}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted"><Tr>{emptyText ?? "Sin registros relacionados."}</Tr></p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>{fields.map((f) => <th key={f.name}>{f.label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  {fields.map((f, i) => (
                    <td key={f.name} className={["currency", "number", "percent"].includes(f.type) ? "text-right" : undefined}>
                      <FieldValue field={f} row={row} linkName={i === 0 ? `${def.path}/${row.id}` : undefined} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
