"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { FieldDef, Filter } from "@/lib/objects";
import { opsForField } from "@/lib/records/filters";
import type { PipelineWithStages, UserOption } from "@/lib/records/data";
import { FilterRow } from "@/components/records/ListToolbar";

/** Editor de condiciones (todas deben cumplirse). Envía el JSON en un input oculto. */
export function ConditionsEditor({ name, fields, users, pipelines, initial = [] }: {
  name: string; fields: FieldDef[]; users: UserOption[]; pipelines: PipelineWithStages[]; initial?: Filter[];
}) {
  const [conditions, setConditions] = useState<Filter[]>(initial);
  const usable = fields.filter((f) => f.type !== "textarea");
  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={JSON.stringify(conditions)} />
      {conditions.length === 0 && <p className="text-sm text-muted">Sin condiciones.</p>}
      {conditions.map((c, i) => (
        <FilterRow key={i} filter={c} fields={usable} ctx={{ users, pipelines }}
          onChange={(nc) => setConditions(conditions.map((x, j) => (j === i ? nc : x)))}
          onRemove={() => setConditions(conditions.filter((_, j) => j !== i))} />
      ))}
      <button type="button" className="btn btn-sm" onClick={() => {
        const f = usable[0];
        setConditions([...conditions, { field: f.name, op: opsForField(f)[0], value: "" }]);
      }}>
        <Plus size={14} /> Agregar condición
      </button>
    </div>
  );
}
