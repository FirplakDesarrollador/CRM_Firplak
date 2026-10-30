import { PieChart } from "lucide-react";
import { ActionForm } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Tr } from "@/components/ui/Tr";
import { createClient } from "@/lib/supabase/server";
import { getUsers } from "@/lib/records/data";
import { getT } from "@/lib/i18n/server";
import { formatCurrency } from "@/lib/format";
import { canManageTeam } from "@/lib/teams/server";
import { saveSplits } from "@/lib/splits/actions";
import { SplitsEditor } from "./SplitsEditor";

type Split = { user_id: string; percent: number; note: string | null; user: { full_name: string; email: string } | null };

export async function getSplits(opportunityId: string): Promise<Split[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("opportunity_splits")
    .select("user_id, percent, note, user:profiles!opportunity_splits_user_id_fkey(full_name, email)")
    .eq("opportunity_id", opportunityId)
    .order("percent", { ascending: false });
  return (data ?? []) as unknown as Split[];
}

/** Reparto de ingresos: qué parte del valor se acredita a cada vendedor. */
export async function SplitsCard({ opportunityId, ownerId, ownerName, amount }: {
  opportunityId: string; ownerId: string | null; ownerName: string | null; amount: number;
}) {
  const [splits, canManage, users, t] = await Promise.all([
    getSplits(opportunityId), canManageTeam("opportunities", opportunityId), getUsers(), getT(),
  ]);
  // Orden estable: el propietario primero, luego por porcentaje.
  splits.sort((a, b) => Number(b.user_id === ownerId) - Number(a.user_id === ownerId) || Number(b.percent) - Number(a.percent));
  const rows = splits.length
    ? splits.map((s) => ({ name: s.user?.full_name || s.user?.email || "—", percent: Number(s.percent), note: s.note }))
    : [{ name: ownerName ?? "—", percent: 100, note: t("Propietario") }];

  return (
    <section className="card overflow-hidden">
      <div className="card-header">
        <h2 className="card-title"><PieChart size={16} /> {t("Reparto de ingresos")}</h2>
        <span className="text-xs text-muted">{t("Cuenta para metas, pronóstico e Indicadores")}</span>
      </div>
      {canManage ? (
        <ActionForm action={saveSplits.bind(null, opportunityId)} className="space-y-3 p-4">
          {/* La clave cambia al guardar: el editor se rehace con lo guardado (React reinicia el formulario). */}
          <SplitsEditor key={splits.map((s) => `${s.user_id}:${s.percent}:${s.note ?? ""}`).join("|") || "vacío"}
            amount={amount} ownerId={ownerId} users={users}
            initial={splits.map((s) => ({ user_id: s.user_id, percent: Number(s.percent), note: s.note ?? "" }))} />
          <div className="flex justify-end border-t border-line pt-3">
            <SubmitButton className="btn btn-primary btn-sm" pendingText="Guardando…"><Tr>Guardar reparto</Tr></SubmitButton>
          </div>
        </ActionForm>
      ) : (
        <table className="table">
          <thead><tr><th><Tr>Vendedor</Tr></th><th className="text-right">%</th><th className="text-right"><Tr>Valor</Tr></th><th><Tr>Motivo</Tr></th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="font-medium">{r.name}</td>
                <td className="num text-right">{r.percent} %</td>
                <td className="num text-right">{formatCurrency((amount * r.percent) / 100)}</td>
                <td className="text-sm text-muted">{r.note ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
        {t("Úsalo cuando dos vendedores comparten un negocio, p. ej. el cliente es de un asesor y la obra está en la zona de otro. Quien recibe una parte entra al equipo de la oportunidad.")}
      </p>
    </section>
  );
}
