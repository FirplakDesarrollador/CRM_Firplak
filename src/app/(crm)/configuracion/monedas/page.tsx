import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { createClient } from "@/lib/supabase/server";
import { canSystem } from "@/lib/permissions";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { getLocale } from "@/lib/i18n/server";
import { refreshExchangeRatesNow, saveManualExchangeRate } from "../actions";
import { Tr } from "@/components/ui/Tr";
import { AmountInput } from "@/components/ui/AmountInput";

export const metadata: Metadata = { title: "Monedas" };

export default async function CurrenciesPage() {
  const me = await requireUser();
  const locale = await getLocale();
  if (!canSystem(me.access, "customize")) redirect("/configuracion");
  const supabase = await createClient();
  const [{ data: current }, { data: rates }] = await Promise.all([
    supabase.rpc("exchange_rate_on", { p_currency: "USD" }),
    supabase.from("exchange_rates").select("valid_from, valid_to, rate, source, fetched_at").eq("currency", "USD")
      .order("valid_from", { ascending: false }).limit(10),
  ]);

  return (
    <>
      <div>
        <h1 className="text-xl font-medium"><Tr>Monedas</Tr></h1>
        <p className="text-sm text-muted">
          <Tr>Las cuentas del mercado Internacional se cotizan en dólares y sin IVA. Para que indicadores, metas y pronóstico sumen en pesos, cada valor en USD se convierte con la TRM oficial del día (Superfinanciera), que se consulta sola a las 6:00 a. m. y a las 12:00 m. Las oportunidades abiertas se recalculan con cada TRM nueva; las cerradas conservan la TRM con la que se cerraron.</Tr>
        </p>
      </div>
      <section className="glass flex flex-wrap items-end justify-between gap-4 p-5">
        <div>
          <p className="eyebrow"><Tr>TRM vigente hoy</Tr></p>
          <p className="kpi-value mt-1 text-[1.9rem]" data-testid="trm-vigente">
            {current ? `$${formatNumber(Number(current))}` : <span className="text-muted"><Tr>Sin TRM registrada</Tr></span>}
          </p>
          <p className="text-xs text-muted"><Tr>pesos por dólar (USD → COP)</Tr></p>
        </div>
        <ActionForm action={refreshExchangeRatesNow} className="flex flex-col items-end gap-1">
          <SubmitButton className="btn" pendingText="Consultando…"><Tr>Consultar TRM oficial ahora</Tr></SubmitButton>
        </ActionForm>
      </section>
      <section className="card p-5">
        <h2 className="card-title"><Tr>Registrar la TRM a mano</Tr></h2>
        <p className="mt-1 text-sm text-muted"><Tr>Solo si la consulta automática falla. Queda vigente desde hoy hasta que llegue la siguiente TRM oficial.</Tr></p>
        <ActionForm action={saveManualExchangeRate} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="label"><Tr>TRM (pesos por dólar)</Tr></span>
            <AmountInput name="rate" className="input num w-40" placeholder="4,000.00" required />
          </label>
          <SubmitButton pendingText="Guardando…"><Tr>Guardar TRM</Tr></SubmitButton>
        </ActionForm>
      </section>
      <section className="card overflow-x-auto">
        <div className="card-header"><h2 className="card-title"><Tr>Últimas TRM</Tr></h2></div>
        <table className="table">
          <thead>
            <tr>
              <th><Tr>Vigente desde</Tr></th><th><Tr>Hasta</Tr></th><th className="text-right"><Tr>TRM</Tr></th>
              <th><Tr>Fuente</Tr></th><th><Tr>Registrada</Tr></th>
            </tr>
          </thead>
          <tbody>
            {(rates ?? []).map((r) => (
              <tr key={r.valid_from}>
                <td>{formatDate(r.valid_from, locale)}</td>
                <td>{r.valid_to ? formatDate(r.valid_to, locale) : "—"}</td>
                <td className="num text-right">${formatNumber(Number(r.rate))}</td>
                <td>{r.source}</td>
                <td className="text-muted">{formatDateTime(r.fetched_at, locale)}</td>
              </tr>
            ))}
            {!rates?.length && <tr><td colSpan={5} className="py-6 text-center text-muted"><Tr>Aún no hay TRM registradas.</Tr></td></tr>}
          </tbody>
        </table>
      </section>
    </>
  );
}
