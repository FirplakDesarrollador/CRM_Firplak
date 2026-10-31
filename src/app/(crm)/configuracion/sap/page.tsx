import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { ActionForm } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Tr } from "@/components/ui/Tr";
import { SapImportPanel } from "@/components/sap/SapImportPanel";
import { createClient } from "@/lib/supabase/server";
import { canSystem } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { getT } from "@/lib/i18n/server";
import { sapCompany, sapConfigured } from "@/lib/sap/client";
import { getSapSettings } from "@/lib/sap/settings";
import { saveSapQuotationSetting, testSapConnection } from "@/lib/sap/actions";

export const metadata: Metadata = { title: "SAP Business One" };

/** Administración de la integración con SAP: conexión, ofertas de venta e importación de productos. */
export default async function SapAdminPage() {
  const [me, t] = await Promise.all([requireUser(), getT()]);
  if (!canSystem(me.access, "customize")) redirect("/configuracion");
  const supabase = await createClient();
  const [settings, { data: fields }] = await Promise.all([
    getSapSettings(),
    supabase.from("custom_field_definitions").select("api_name, label").eq("object", "products").eq("is_active", true).order("sort_order"),
  ]);
  const configured = sapConfigured();

  return (
    <>
      <div>
        <h1 className="text-xl font-medium"><Tr>SAP Business One</Tr></h1>
        <p className="text-sm text-muted"><Tr>Consulta de cartera e inventario, ofertas de venta desde los pedidos e importación de productos. Los clientes no se sincronizan: se vinculan por su Código SAP.</Tr></p>
      </div>

      <section className="card space-y-3 p-4">
        <h2 className="card-title"><Tr>Conexión</Tr> {configured ? <span className="badge badge-success"><Tr>Lista</Tr></span> : <span className="badge badge-warning"><Tr>Pendiente</Tr></span>}</h2>
        <p className="flex items-center gap-2 text-sm">
          {configured ? <CheckCircle2 size={15} className="text-success" /> : <XCircle size={15} className="text-danger" />}
          {configured ? <>{t("Service Layer configurado · compañía")} <code>{sapCompany()}</code></> : t("Faltan las variables SAP_SL_URL, SAP_COMPANY_DB, SAP_USER y SAP_PASSWORD en el servidor.")}
        </p>
        {configured && (
          <ActionForm action={testSapConnection} className="flex flex-col items-start gap-1">
            <SubmitButton className="btn btn-sm" pendingText="Probando…"><Tr>Probar conexión</Tr></SubmitButton>
          </ActionForm>
        )}
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="card-title"><Tr>Pedidos → ofertas de venta</Tr></h2>
        <ActionForm action={saveSapQuotationSetting} className="space-y-2">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="create_quotations" defaultChecked={settings.create_quotations} disabled={!configured} className="mt-0.5 accent-[var(--brand)]" />
            {t("Al activar un pedido en el CRM, crear su oferta de venta en SAP")}
          </label>
          <p className="text-xs text-muted"><Tr>Se crea una oferta de venta (no una orden de venta) con el Código SAP de la cuenta y la Referencia (ItemCode) de cada producto. Un experto la valida en SAP y la convierte en la orden que inicia la fabricación. El usuario de SAP necesita permiso para crear ofertas de venta.</Tr></p>
          <SubmitButton className="btn btn-sm" pendingText="…" disabled={!configured}><Tr>Guardar</Tr></SubmitButton>
        </ActionForm>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="card-title"><Tr>Importar productos desde SAP</Tr></h2>
        <p className="text-sm text-muted"><Tr>Tú decides cuándo importar. Se traen el código y la descripción de cada artículo, y los campos personalizados que relaciones con un campo de SAP.</Tr></p>
        {configured ? (
          <SapImportPanel fields={(fields ?? []).map((f) => ({ api_name: f.api_name, label: f.label }))}
            prefix={settings.product_import.prefix} salesOnly={settings.product_import.sales_only} mappings={settings.product_import.mappings} />
        ) : <p className="text-sm text-muted"><Tr>Disponible cuando la conexión esté configurada.</Tr></p>}
      </section>
    </>
  );
}
