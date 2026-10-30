import { ObjectIcon } from "@/components/ui/icons";
import type { ObjectDef } from "@/lib/objects";
import type { Row } from "@/lib/records/data";
import { FieldValue } from "./FieldValue";

export function RecordHeader({
  def,
  row,
  title,
  actions,
  badges,
  children,
}: {
  def: ObjectDef;
  row: Row;
  title: string;
  actions?: React.ReactNode;
  badges?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const highlights = def.highlightFields.map((n) => def.fields.find((f) => f.name === n)!).filter(Boolean);
  return (
    <section className="glass overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="flex min-w-0 items-center gap-3">
          <ObjectIcon object={def.key} size={20} />
          <div className="min-w-0">
            <p className="eyebrow">{def.label}</p>
            <h1 className="flex flex-wrap items-center gap-2 text-xl font-medium leading-tight">
              <span className="break-words">{title}</span>
              {badges}
            </h1>
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line px-4 py-3 sm:grid-cols-3 lg:grid-cols-5">
        {highlights.map((field) => (
          <div key={field.name} className="min-w-0">
            <dt className="text-[0.72rem] font-semibold text-muted">{field.label}</dt>
            <dd className="truncate text-sm font-semibold"><FieldValue field={field} row={row} /></dd>
          </div>
        ))}
      </dl>
      {children}
    </section>
  );
}
