import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Tr } from "@/components/ui/Tr";
import { getT } from "@/lib/i18n/server";
import { canSystem } from "@/lib/permissions";
import { COMPANY, getPrintSettings } from "@/lib/print/documento";
import { requireUser } from "@/lib/session";
import { savePrintSettings } from "../actions";

export const metadata: Metadata = { title: "Documentos impresos" };

export default async function PrintSettingsPage() {
  const me = await requireUser();
  if (!canSystem(me.access, "customize")) redirect("/configuracion");
  const [settings, t] = await Promise.all([getPrintSettings(), getT()]);

  return (
    <>
      <div>
        <h1 className="text-xl font-medium"><Tr>Documentos impresos</Tr></h1>
        <p className="max-w-[75ch] text-sm text-muted">
          <Tr>Lo que escribas aquí sale en el PDF de las cotizaciones y los pedidos, junto a los totales. Cada documento imprime las cuentas del mercado de su cliente, nunca las del otro; si las de su mercado están vacías, ese bloque no se imprime.</Tr>
        </p>
      </div>
      <ActionForm action={savePrintSettings} className="space-y-4">
        {([
          { key: "nacional", title: "Forma de pago y consignación · mercado Nacional", lines: "payment_lines", note: "payment_note",
            help: "Sale en los documentos de las cuentas del mercado Nacional (pesos)." },
          { key: "internacional", title: "Forma de pago y consignación · mercado Internacional", lines: "payment_lines_intl", note: "payment_note_intl",
            help: "Sale en los documentos de las cuentas del mercado Internacional (dólares): banco, cuenta, SWIFT, banco intermediario." },
        ] as const).map((m) => (
          <section key={m.key} className="card p-5">
            <h2 className="card-title"><Tr>{m.title}</Tr></h2>
            <p className="mt-1 text-sm text-muted"><Tr>{m.help}</Tr></p>
            <div className="mt-3 grid max-w-[46rem] gap-4">
              <label className="block">
                <span className="label"><Tr>Cuentas bancarias</Tr></span>
                <textarea name={m.lines} className="textarea" rows={5} defaultValue={settings[m.key].payment_lines.join("\n")}
                  placeholder={t("Un banco por renglón: banco, tipo y número de cuenta, convenio o código de recaudo")} />
                <span className="help"><Tr>Un renglón por banco, hasta 8.</Tr></span>
              </label>
              <label className="block">
                <span className="label"><Tr>Nota bajo las cuentas</Tr></span>
                <input name={m.note} type="text" className="input" maxLength={240} defaultValue={settings[m.key].payment_note}
                  placeholder={t("P. ej. a qué correo enviar el soporte de pago")} />
              </label>
            </div>
          </section>
        ))}
        <div><SubmitButton pendingText="Guardando…"><Tr>Guardar</Tr></SubmitButton></div>
      </ActionForm>
      <section className="card p-5">
        <h2 className="card-title"><Tr>Pie de página</Tr></h2>
        <p className="mt-1 text-sm text-muted"><Tr>Textos fijos de la empresa que cierran cada documento.</Tr></p>
        <div className="mt-3 max-w-[75ch] space-y-2 text-sm">
          <p>{COMPANY.privacy}</p>
          <p>{COMPANY.withholding}</p>
          <p>{COMPANY.address}</p>
        </div>
      </section>
    </>
  );
}
