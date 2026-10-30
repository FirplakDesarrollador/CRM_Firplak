import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { fieldValue, OBJECTS, type FieldDef } from "@/lib/objects";
import { formatCurrency, formatDate, formatDateTime, formatNumber, formatPercent } from "@/lib/format";

import { Tr } from "@/components/ui/Tr";
type Rel = { id?: string; name?: string; full_name?: string; email?: string; color?: string; category?: string } | null;

export function StageBadge({ stage }: { stage: Rel }) {
  if (!stage?.name) return <span className="text-muted">—</span>;
  const tone = stage.category === "won" ? "badge-success" : stage.category === "lost" ? "badge-danger" : "";
  return (
    <span className={`badge ${tone}`}>
      {stage.category === "open" && <span className="h-2 w-2 rounded-full" style={{ background: stage.color }} />}
      {stage.name}
    </span>
  );
}

/** Representación de solo lectura de un campo según su tipo. */
export function FieldValue({ field, row, linkName }: { field: FieldDef; row: Record<string, unknown>; linkName?: string }) {
  const value = fieldValue(row, field.name);
  const rel = (field.relation ? row[field.relation] : null) as Rel;

  if (linkName) {
    return <Link href={linkName} className="link">{String(value ?? "(sin nombre)")}</Link>;
  }

  switch (field.type) {
    case "lookup": {
      if (!rel?.id) return <span className="text-muted">—</span>;
      const target = OBJECTS[field.lookup!];
      return <Link href={`${target.path}/${rel.id}`} className="link">{rel.name ?? rel.full_name}</Link>;
    }
    case "user":
      return rel ? <span>{rel.full_name || rel.email}</span> : <span className="text-muted">—</span>;
    case "stage":
      return <StageBadge stage={rel} />;
    default:
      break;
  }

  if (field.relation && rel) return <span>{rel.name ?? rel.full_name}</span>;
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
    return field.type === "checkbox" ? <span><Tr>No</Tr></span> : <span className="text-muted">—</span>;
  }

  switch (field.type) {
    case "currency":
      return <span className="num">{formatCurrency(value as number)}</span>;
    case "number":
      return <span className="num">{formatNumber(value as number)}</span>;
    case "percent":
      return <span className="num">{formatPercent(value as number)}</span>;
    case "date":
      return <span>{formatDate(String(value))}</span>;
    case "datetime":
      return <span>{formatDateTime(String(value))}</span>;
    case "checkbox":
      return <span>{value === true || value === "true" ? "Sí" : "No"}</span>;
    case "email":
      return <a href={`mailto:${value}`} className="link">{String(value)}</a>;
    case "phone":
      return <a href={`tel:${String(value).replace(/\s/g, "")}`} className="link whitespace-nowrap">{String(value)}</a>;
    case "url":
      return (
        <a href={String(value)} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1">
          {String(value).replace(/^https?:\/\//, "")} <ExternalLink size={12} />
        </a>
      );
    case "multiselect":
      return (
        <span className="flex flex-wrap gap-1">
          {(value as string[]).map((v) => <span key={v} className="badge badge-brand">{v}</span>)}
        </span>
      );
    case "select":
      return <span>{field.optionLabels?.[String(value)] ?? String(value)}</span>;
    case "textarea":
      return <span className="whitespace-pre-line">{String(value)}</span>;
    default:
      return <span>{String(value)}</span>;
  }
}
