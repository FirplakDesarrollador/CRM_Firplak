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
import { getSapSettings, sapSourceOf } from "@/lib/sap/settings";
import { saveSapQuotationSetting, saveSapSource, testSapConnection } from "@/lib/sap/actions";
import { Fmt } from "@/components/ui/Fmt";
import { getUsers } from "@/lib/records/data";
import { saveSapSeller } from "@/lib/sap/sales";
import { PRODUCT_FAMILIES } from "@/lib/objects/picklists";
import { KIT_PLANT } from "@/lib/objects/products";

export const metadata: Metadata = { title: "SAP Business One" };

/** Administración de la integración con SAP: conexión, ofertas de venta e importación de productos. */
export default async function SapAdminPage() {
  const [me, t] = await Promise.all([requireUser(), getT()]);
  if (!canSystem(me.access, "customize")) redirect("/configuracion");
  const supabase = await createClient();
  const [settings, { data: runs }, { data: lists }, { data: plantDeps }, { data: sellers }, { data: months }, users, { data: fields }] = await Promise.all([
    getSapSettings(),
    supabase.from("sap_sync_runs").select("id, started_at, finished_at, host, partners, items, errors, ok").order("started_at", { ascending: false }).limit(8),
    supabase.from("picklist_values").select("field, value, controlling_map").eq("object", "products").in("field", ["family", "plant"]).eq("is_active", true).order("sort_order"),
    supabase.from("picklist_dependencies").select("field").eq("object", "products").eq("field", "plant").eq("controlling_field", "family"),
    supabase.from("sap_sellers").select("seller, user_id").order("seller"),
    supabase.from("sap_sales_months").select("month, row_count, loaded_at").order("month", { ascending: false }),
    getUsers(),
    supabase.from("custom_field_definitions").select("api_name, label").eq("object", "products").eq("is_active", true).order("sort_order"),
  ]);
  const configured = sapConfigured();
  const source = sapSourceOf(settings);
  const last = runs?.[0];
  // Familia sin filas propias usa los valores de fábrica; la planta «KIT» es solo para kits.
  const families = (lists ?? []).filter((l) => l.field === "family").map((l) => l.value);

  return (
    <>
      <div>
        <h1 className="text-xl font-medium"><Tr>SAP Business One</Tr></h1>
        <p className="text-sm text-muted"><Tr>Consulta de cartera e inventario, ofertas de venta desde los pedidos e importación de productos. Los clientes no se sincronizan: se vinculan por su Código SAP.</Tr></p>
      </div>

      <section className="card space-y-3 p-4">
        <h2 className="card-title"><Tr>Cartera e inventario</Tr></h2>
        <p className="text-sm text-muted"><Tr>SAP solo responde dentro de la red de Firplak. Un agente instalado en un equipo de la red trae la información de lunes a viernes, cada dos horas entre las 7:00 y las 17:30, y el CRM muestra esa copia con su hora.</Tr></p>
        <ActionForm action={saveSapSource} className="space-y-2">
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name="source" value="agent" defaultChecked={source === "agent"} className="mt-0.5 accent-[var(--brand)]" />
            {t("Copia del agente dentro de la red (recomendado)")}
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name="source" value="direct" defaultChecked={source === "direct"} disabled={!configured} className="mt-0.5 accent-[var(--brand)]" />
            {t("Consulta en vivo desde el servidor del CRM (solo si el servidor alcanza a SAP)")}
          </label>
          <SubmitButton className="btn btn-sm" pendingText="…"><Tr>Guardar origen</Tr></SubmitButton>
        </ActionForm>
        <div className="border-t border-line pt-3">
          <h3 className="mb-2 text-sm font-semibold"><Tr>Sincronizaciones del agente</Tr> {last && <span className={`badge ${last.ok ? "badge-success" : last.finished_at ? "badge-danger" : "badge-warning"}`}>{t(last.ok ? "Última correcta" : last.finished_at ? "Última con errores" : "En curso")}</span>}</h3>
          {!runs?.length ? <p className="text-sm text-muted"><Tr>El agente todavía no ha corrido.</Tr></p> : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th><Tr>Inicio</Tr></th><th><Tr>Computador</Tr></th><th className="text-right"><Tr>Clientes</Tr></th><th className="text-right"><Tr>Productos</Tr></th><th><Tr>Resultado</Tr></th></tr></thead>
                <tbody>
                  {runs.map((r) => {
                    const errors = (r.errors ?? []) as { donde?: string; error?: string }[];
                    return (
                      <tr key={r.id}>
                        <td className="whitespace-nowrap"><Fmt datetime={r.started_at} /></td>
                        <td>{r.host ?? "—"}</td>
                        <td className="num text-right">{r.partners}</td>
                        <td className="num text-right">{r.items}</td>
                        <td>{!r.finished_at ? t("En curso") : r.ok ? t("Correcta") : `${errors.length} ${t("errores")}: ${errors.slice(0, 2).map((e) => `${e.donde ?? ""} · ${e.error ?? ""}`).join(" | ")}`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="card-title"><Tr>Ventas reales y vendedores</Tr></h2>
        <p className="text-sm text-muted"><Tr>El agente sube las ventas netas de SAP del año en curso y del anterior. Cada venta se le cuenta al usuario del CRM relacionado con su vendedor de SAP: revisa aquí esa relación.</Tr></p>
        {!months?.length ? <p className="text-sm text-muted"><Tr>Todavía no se han cargado ventas.</Tr></p> : (
          <p className="text-sm">{months.length} {t("meses cargados")} · {months.reduce((n, m) => n + m.row_count, 0).toLocaleString("es-CO")} {t("líneas")} · {t("Actualizado")} <Fmt datetime={months.map((m) => m.loaded_at).sort().at(-1)!} /></p>
        )}
        {Boolean(sellers?.length) && (
          <div className="max-h-[26rem] overflow-auto rounded-[10px] border border-line">
            <table className="table">
              <thead><tr><th><Tr>Vendedor en SAP</Tr></th><th><Tr>Usuario del CRM</Tr></th></tr></thead>
              <tbody>
                {sellers!.map((s) => (
                  <tr key={s.seller}>
                    <td>{s.seller}</td>
                    <td>
                      <ActionForm action={saveSapSeller} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="seller" value={s.seller} />
                        <select name="user_id" defaultValue={s.user_id ?? ""} className="select h-8 min-w-[12rem]" aria-label={`${t("Usuario del CRM para")} ${s.seller}`}>
                          <option value="">{t("Sin relacionar")}</option>
                          {users.filter((u) => u.is_active || u.id === s.user_id).map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                        </select>
                        <SubmitButton className="btn btn-sm" pendingText="…"><Tr>Relacionar</Tr></SubmitButton>
                      </ActionForm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="card-title"><Tr>Conexión directa del servidor</Tr> {configured ? <span className="badge badge-success"><Tr>Lista</Tr></span> : <span className="badge badge-warning"><Tr>Pendiente</Tr></span>}</h2>
        <p className="flex items-center gap-2 text-sm">
          {configured ? <CheckCircle2 size={15} className="text-success" /> : <XCircle size={15} className="text-danger" />}
          {configured ? <>{t("Service Layer configurado · compañía")} <code>{sapCompany()}</code></> : t("El servidor del CRM no tiene credenciales de SAP. No hacen falta para la copia del agente ni para importar productos; sí para crear ofertas de venta, que por ahora solo funcionan con conexión directa.")}
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
        {source === "agent" && <p className="text-xs text-muted"><Tr>La consulta la hace el agente dentro de la red: tarda hasta un minuto en empezar.</Tr></p>}
        {configured || source === "agent" ? (
          <SapImportPanel fields={(fields ?? []).map((f) => ({ api_name: f.api_name, label: f.label }))}
            prefix={settings.product_import.prefix} salesOnly={settings.product_import.sales_only} mappings={settings.product_import.mappings}
            families={families.length ? families : [...PRODUCT_FAMILIES]} plants={(lists ?? []).filter((l) => l.field === "plant" && l.value !== KIT_PLANT).map((l) => ({
              value: l.value,
              // Si Planta depende de Familia, cada planta solo se ofrece con sus familias.
              families: plantDeps?.length ? (((l.controlling_map ?? {}) as Record<string, string[]>).family ?? []) : null,
            }))}
            canBringGroup={source === "agent"} />
        ) : <p className="text-sm text-muted"><Tr>Disponible cuando la conexión esté configurada.</Tr></p>}
      </section>
    </>
  );
}
