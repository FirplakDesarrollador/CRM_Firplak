import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { createClient } from "@/lib/supabase/server";
import { canSystem } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { runAlertsNow, saveAlertSettings } from "../actions";

import { Tr } from "@/components/ui/Tr";
export const metadata: Metadata = { title: "Alertas programadas" };

export default async function AlertsPage() {
  const me = await requireUser();
  if (!canSystem(me.access, "customize")) redirect("/configuracion");
  const supabase = await createClient();
  const { data: s } = await supabase.from("alert_settings").select("*").eq("id", 1).maybeSingle();

  return (
    <>
      <div>
        <h1 className="text-xl font-medium"><Tr>Alertas programadas</Tr></h1>
        <p className="text-sm text-muted">
          Cada día a las 7:00 a. m. (hora de Colombia) el CRM avisa a cada asesor en su campana. Requiere la extensión pg_cron de Supabase
          (Database → Extensions); sin ella puedes ejecutarlas aquí cuando quieras. Cada aviso se envía una sola vez por día.
        </p>
      </div>
      <section className="glass p-5">
        <ActionForm action={saveAlertSettings} className="space-y-3">
          <label className="flex items-center gap-2 font-medium"><input type="checkbox" name="enabled" defaultChecked={s?.enabled ?? true} className="accent-[var(--brand)]" /> <Tr>Alertas activas</Tr></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="notify_overdue_close" defaultChecked={s?.notify_overdue_close ?? true} className="accent-[var(--brand)]" /> <Tr>Oportunidades abiertas con fecha de cierre vencida</Tr></label>
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <input type="checkbox" name="notify_stale" defaultChecked={s?.notify_stale ?? true} className="accent-[var(--brand)]" /> Oportunidades sin actividad ni cambio de etapa en
            <input name="stale_days" type="number" min={3} max={180} className="input h-8 w-20" defaultValue={s?.stale_days ?? 14} aria-label="Días sin actividad" /> días (aviso semanal)
          </label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="notify_overdue_tasks" defaultChecked={s?.notify_overdue_tasks ?? true} className="accent-[var(--brand)]" /> <Tr>Resumen diario de tareas y llamadas vencidas</Tr></label>
          <div className="flex justify-end"><SubmitButton pendingText="Guardando…"><Tr>Guardar</Tr></SubmitButton></div>
        </ActionForm>
      </section>
      <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="text-sm text-ink-2">
          Última ejecución: {s?.last_run_at ? `${formatDateTime(s.last_run_at)} · ${s.last_run_count ?? 0} aviso(s)` : "nunca"}
        </p>
        <ActionForm action={runAlertsNow} className="flex flex-col items-end gap-1">
          <SubmitButton className="btn" pendingText="Ejecutando…"><Tr>Ejecutar ahora</Tr></SubmitButton>
        </ActionForm>
      </section>
    </>
  );
}
