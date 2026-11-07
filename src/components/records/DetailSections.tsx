import type { ObjectDef } from "@/lib/objects";
import type { Row } from "@/lib/records/data";
import { FieldValue } from "./FieldValue";

export function DetailSections({ def, row, hide = [] }: { def: ObjectDef; row: Row; hide?: string[] }) {
  return (
    <div className="space-y-4">
      {def.sections.map((section) => {
        const fields = def.fields.filter((f) => (f.section ?? "info") === section.key && !hide.includes(f.name)
          && !(f.hideEmpty && (row[f.name] === null || row[f.name] === undefined || row[f.name] === "")));
        if (!fields.length) return null;
        return (
          <section key={section.key} className="card">
            <div className="card-header"><h2 className="card-title">{section.label}</h2></div>
            <dl className="grid gap-x-6 sm:grid-cols-2">
              {fields.map((field) => (
                <div key={field.name} className={`border-b border-line px-4 py-2.5 ${field.wide ? "sm:col-span-2" : ""}`}>
                  <dt className="text-[0.72rem] font-semibold text-muted">{field.label}</dt>
                  <dd className="mt-0.5 min-h-5 text-sm"><FieldValue field={field} row={row} /></dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
    </div>
  );
}
