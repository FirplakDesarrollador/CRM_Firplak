"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import { Opt } from "@/components/ui/Opt";
import { Tr } from "@/components/ui/Tr";
import { TRIGGERS } from "@/lib/rules/automation-types";

type Option = { name: string; label: string };


/** Cuándo corre una automatización: al guardar (con campo vigilado) o en una fecha del registro. */
export function TriggerFields({ id, trigger, watchField, scheduleField, offsetDays, watchable, dateFields }: {
  id: string;
  trigger: keyof typeof TRIGGERS;
  watchField: string | null;
  scheduleField: string | null;
  offsetDays: number;
  watchable: Option[];
  dateFields: Option[];
}) {
  const t = useT();
  const [value, setValue] = useState(trigger);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor={`at-${id}`}><Tr>Cuándo se ejecuta</Tr></label>
        <select id={`at-${id}`} name="trigger_on" className="select" value={value} onChange={(e) => setValue(e.target.value as keyof typeof TRIGGERS)}>
          {Object.entries(TRIGGERS).map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
        </select>
      </div>
      {value === "scheduled" ? (
        <div>
          <span className="label"><Tr>Fecha de ejecución</Tr></span>
          <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2">
            <input name="schedule_days" type="number" min={0} max={365} className="input" aria-label={t("Días")} defaultValue={Math.abs(offsetDays)} />
            <select name="schedule_when" className="select" aria-label={t("Antes o después")} defaultValue={offsetDays < 0 ? "before" : "after"}>
              <Opt value="before">días antes de</Opt>
              <Opt value="after">días después de</Opt>
            </select>
            <select name="schedule_field" className="select col-span-2" aria-label={t("Fecha de referencia")} defaultValue={scheduleField ?? ""}>
              <Opt value="">Fecha de referencia…</Opt>
              {dateFields.map((f) => <option key={f.name} value={f.name}>{t(f.label)}</option>)}
            </select>
          </div>
        </div>
      ) : (
        <div>
          <label className="label" htmlFor={`aw-${id}`}><Tr>Al actualizar, solo si cambia</Tr></label>
          <select id={`aw-${id}`} name="watch_field" className="select" defaultValue={watchField ?? ""} disabled={value === "create"}>
            <Opt value="">Cualquier cambio</Opt>
            {watchable.map((f) => <option key={f.name} value={f.name}>{t(f.label)}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
