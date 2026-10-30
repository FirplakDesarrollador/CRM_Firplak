"use client";

import { useState } from "react";
import { Equal, Plus, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { formatCurrency } from "@/lib/format";
import type { UserOption } from "@/lib/records/data";

export type SplitRow = { user_id: string; percent: number; note: string };
type Row = SplitRow & { id: number };
let nextId = 0;
const withId = (r: SplitRow): Row => ({ ...r, id: ++nextId });

/** Filas del reparto (persona, %, nota) con total en vivo; viajan en el campo oculto `splits`. */
export function SplitsEditor({ initial, users, ownerId, amount }: {
  initial: SplitRow[]; users: UserOption[]; ownerId: string | null; amount: number;
}) {
  const t = useT();
  const [rows, setRows] = useState<Row[]>(() => initial.map(withId));
  const total = Math.round(rows.reduce((s, r) => s + (Number(r.percent) || 0), 0) * 100) / 100;
  const set = (i: number, patch: Partial<SplitRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const data = rows.filter((r) => r.user_id).map(({ user_id, percent, note }) => ({ user_id, percent, note }));
  const active = users.filter((u) => u.is_active || rows.some((r) => r.user_id === u.id));

  const add = () => setRows(rows.length
    // Primer reparto: el caso típico es mitad y mitad con otro vendedor.
    ? [...rows, withId({ user_id: "", percent: Math.max(0, Math.round((100 - total) * 100) / 100), note: "" })]
    : [withId({ user_id: ownerId ?? "", percent: 50, note: "" }), withId({ user_id: "", percent: 50, note: "" })]);
  const equal = () => {
    const n = rows.length;
    const base = Math.floor((10000 / n)) / 100;
    setRows(rows.map((r, i) => ({ ...r, percent: i === 0 ? Math.round((100 - base * (n - 1)) * 100) / 100 : base })));
  };

  return (
    <div className="space-y-2">
      <input type="hidden" name="splits" value={JSON.stringify(data)} />
      {rows.length === 0 && <p className="text-sm text-muted">{t("Sin reparto: el 100 % del valor es del propietario.")}</p>}
      {rows.map((r, i) => (
        <div key={r.id} className="grid items-end gap-2 sm:grid-cols-[minmax(0,1.3fr)_6rem_minmax(0,1fr)_7.5rem_auto]">
          <div>
            <label className="label" htmlFor={`sp-u-${i}`}>{t("Vendedor")}</label>
            {/* defaultValue (no value): al reiniciarse el formulario tras guardar, la lista conserva su vendedor. */}
            <select id={`sp-u-${i}`} className="select" defaultValue={r.user_id} onChange={(e) => set(i, { user_id: e.target.value })} required>
              <option value="" disabled>{t("Selecciona…")}</option>
              {active.map((u) => <option key={u.id} value={u.id}>{u.full_name}{u.id === ownerId ? ` (${t("propietario")})` : ""}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor={`sp-p-${i}`}>%</label>
            <input id={`sp-p-${i}`} type="number" min={0.01} max={100} step={0.01} className="input num" value={r.percent}
              onChange={(e) => set(i, { percent: Number(e.target.value) })} required />
          </div>
          <div>
            <label className="label" htmlFor={`sp-n-${i}`}>{t("Motivo (opcional)")}</label>
            <input id={`sp-n-${i}`} className="input" value={r.note} placeholder={t("Ej. Obra en su zona")} onChange={(e) => set(i, { note: e.target.value })} />
          </div>
          <p className="num pb-2 text-right text-sm font-medium">{formatCurrency((amount * (Number(r.percent) || 0)) / 100)}</p>
          <button type="button" className="btn btn-sm btn-ghost mb-1" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label={t("Quitar")}>
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button type="button" className="btn btn-sm" onClick={add}>
          <Plus size={14} /> {rows.length ? t("Agregar vendedor") : t("Compartir negocio")}
        </button>
        {rows.length > 1 && <button type="button" className="btn btn-sm btn-ghost" onClick={equal}><Equal size={14} /> {t("Partes iguales")}</button>}
        {rows.length > 0 && (
          <span className={`badge ml-auto ${total === 100 ? "badge-success" : "badge-danger"}`}>
            {t("Total")}: {total} %{total !== 100 ? ` · ${t("debe sumar 100 %")}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}
