import { AlertTriangle, Database } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Fmt } from "@/components/ui/Fmt";
import { Tr } from "@/components/ui/Tr";
import { formatCurrency, formatNumber } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { sapCompany } from "@/lib/sap/client";
import { getCustomerSummary, getItem, invoiceStatus, SapPending } from "@/lib/sap/data";

const Kpi = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
  <div className="rounded-[10px] border border-line p-3">
    <p className="text-xs text-muted">{label}</p>
    <p className={`num mt-0.5 text-lg font-medium ${tone ?? ""}`}>{value}</p>
  </div>
);

function Header({ title, subtitle, syncedAt }: { title: string; subtitle: string; syncedAt?: string }) {
  return (
    <div className="card-header flex-wrap gap-1">
      <h2 className="card-title"><Database size={16} /> {title}</h2>
      <span className="text-xs text-muted">{subtitle}{syncedAt && <> · <Tr>Actualizado</Tr> <Fmt datetime={syncedAt} /></>}</span>
    </div>
  );
}

const Pending = () => (
  <section className="card p-4 text-sm text-muted"><Tr>Todavía no se ha traído de SAP. Llegará con la próxima sincronización (lunes a viernes, cada dos horas).</Tr></section>
);

/** Cliente en SAP Business One: cartera, cupo, pedidos abiertos y facturas (solo lectura). */
export async function SapAccountCard({ cardCode }: { cardCode: string | null }) {
  const t = await getT();
  if (!cardCode) {
    return <section className="card p-4 text-sm text-muted"><Tr>Esta cuenta no tiene Código SAP. Agrégalo con «Editar» para ver su información de SAP.</Tr></section>;
  }
  let data: Awaited<ReturnType<typeof getCustomerSummary>>;
  try {
    data = await getCustomerSummary(cardCode);
  } catch (e) {
    if (e instanceof SapPending) return <Pending />;
    return <section className="card p-4"><Alert tone="error">{t("No se pudo consultar SAP:")} {(e as Error).message}</Alert></section>;
  }
  if (!data) return <section className="card p-4 text-sm text-muted">{t("No existe un socio de negocio con el código")} <code>{cardCode}</code> {t("en SAP.")}</section>;
  const { partner: p, orders, invoices } = data;
  const available = p.CreditLimit - p.CurrentAccountBalance - p.OpenDeliveryNotesBalance - p.OpenOrdersBalance;
  const overdue = invoices.map((i) => invoiceStatus(i)).filter((s) => s.overdue).reduce((sum, s) => sum + s.pending, 0);

  return (
    <section className="card overflow-hidden">
      <Header title={`${t("SAP Business One")} · ${p.CardCode}`} subtitle={[p.CardName, t("Solo lectura"), sapCompany()].filter(Boolean).join(" · ")} syncedAt={data.syncedAt} />
      <div className="grid gap-2 p-4 sm:grid-cols-2 2xl:grid-cols-5">
        <Kpi label={t("Saldo de cartera")} value={formatCurrency(p.CurrentAccountBalance)} />
        <Kpi label={t("Cartera vencida")} value={formatCurrency(overdue)} tone={overdue > 0 ? "text-danger" : undefined} />
        <Kpi label={t("Cupo de crédito")} value={formatCurrency(p.CreditLimit)} />
        <Kpi label={t("Cupo disponible")} value={formatCurrency(available)} tone={available < 0 ? "text-danger" : "text-success"} />
        <Kpi label={t("Pedidos y entregas abiertos")} value={formatCurrency(p.OpenOrdersBalance + p.OpenDeliveryNotesBalance)} />
      </div>
      {available < 0 && (
        <p className="mx-4 mb-3 flex items-center gap-2 text-sm text-danger"><AlertTriangle size={15} /> <Tr>El cliente superó su cupo de crédito: revisa con cartera antes de comprometer nuevos pedidos.</Tr></p>
      )}
      <div className="grid gap-4 border-t border-line p-4">
        <div className="overflow-x-auto">
          <h3 className="mb-2 text-sm font-semibold"><Tr>Pedidos de venta abiertos</Tr> <span className="badge">{orders.length}</span></h3>
          {orders.length === 0 ? <p className="text-sm text-muted"><Tr>Sin pedidos abiertos.</Tr></p> : (
            <table className="table">
              <thead><tr><th>N.º</th><th><Tr>Fecha</Tr></th><th><Tr>Entrega</Tr></th><th><Tr>OC cliente</Tr></th><th className="text-right"><Tr>Total</Tr></th></tr></thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.DocEntry}>
                    <td className="num">{o.DocNum}</td>
                    <td className="whitespace-nowrap"><Fmt date={o.DocDate.slice(0, 10)} /></td>
                    <td className="whitespace-nowrap"><Fmt date={o.DocDueDate.slice(0, 10)} /></td>
                    <td>{o.NumAtCard ?? "—"}</td>
                    <td className="num text-right">{formatCurrency(o.DocTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="overflow-x-auto">
          <h3 className="mb-2 text-sm font-semibold"><Tr>Facturas abiertas y recientes</Tr> <span className="badge">{invoices.length}</span></h3>
          {invoices.length === 0 ? <p className="text-sm text-muted"><Tr>Sin facturas.</Tr></p> : (
            <table className="table">
              <thead><tr><th>N.º</th><th><Tr>Fecha</Tr></th><th><Tr>Vence</Tr></th><th className="text-right"><Tr>Pendiente</Tr></th><th><Tr>Estado</Tr></th></tr></thead>
              <tbody>
                {invoices.map((i) => {
                  const s = invoiceStatus(i);
                  return (
                    <tr key={i.DocEntry}>
                      <td className="num">{i.DocNum}</td>
                      <td className="whitespace-nowrap"><Fmt date={i.DocDate.slice(0, 10)} /></td>
                      <td className="whitespace-nowrap"><Fmt date={i.DocDueDate.slice(0, 10)} /></td>
                      <td className="num text-right">{formatCurrency(s.pending)}</td>
                      <td><span className={`badge ${s.overdue ? "badge-danger" : s.open ? "badge-warning" : "badge-success"}`}>{t(s.overdue ? "Vencida" : s.open ? "Pendiente" : "Pagada")}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}

/** Artículo en SAP: inventario por bodega y listas de precios (solo lectura). */
export async function SapProductCard({ itemCode }: { itemCode: string | null }) {
  const t = await getT();
  if (!itemCode) return <section className="card p-4 text-sm text-muted"><Tr>Este producto no tiene referencia: debe coincidir con el código del artículo en SAP (ItemCode).</Tr></section>;
  let item: Awaited<ReturnType<typeof getItem>>;
  try {
    item = await getItem(itemCode);
  } catch (e) {
    if (e instanceof SapPending) return <Pending />;
    return <section className="card p-4"><Alert tone="error">{t("No se pudo consultar SAP:")} {(e as Error).message}</Alert></section>;
  }
  if (!item) return <section className="card p-4 text-sm text-muted">{t("No existe un artículo con el código")} <code>{itemCode}</code> {t("en SAP.")}</section>;
  const available = item.QuantityOnStock - (item.QuantityOrderedByCustomers ?? 0);

  return (
    <section className="card overflow-hidden">
      <Header title={`${t("SAP Business One")} · ${item.ItemCode}`} subtitle={`${item.ItemName} · ${t("Solo lectura")}`} syncedAt={item.syncedAt} />
      <div className="grid gap-2 p-4 sm:grid-cols-3">
        <Kpi label={t("En inventario")} value={formatNumber(item.QuantityOnStock)} />
        <Kpi label={t("Comprometido con clientes")} value={formatNumber(item.QuantityOrderedByCustomers ?? 0)} />
        <Kpi label={t("Disponible")} value={formatNumber(available)} tone={available <= 0 ? "text-danger" : "text-success"} />
      </div>
      <div className="grid gap-4 border-t border-line p-4 xl:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold"><Tr>Inventario por bodega</Tr></h3>
          <table className="table">
            <thead><tr><th><Tr>Bodega</Tr></th><th className="text-right"><Tr>En inventario</Tr></th><th className="text-right"><Tr>Comprometido</Tr></th><th className="text-right"><Tr>Pedido a proveedor</Tr></th></tr></thead>
            <tbody>
              {(item.ItemWarehouseInfoCollection ?? []).filter((w) => w.InStock || w.Committed || w.Ordered).map((w) => (
                <tr key={w.WarehouseCode}>
                  <td>{w.WarehouseCode}</td>
                  <td className="num text-right">{formatNumber(w.InStock)}</td>
                  <td className="num text-right">{formatNumber(w.Committed)}</td>
                  <td className="num text-right">{formatNumber(w.Ordered)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold"><Tr>Listas de precios en SAP</Tr></h3>
          <table className="table">
            <thead><tr><th><Tr>Lista</Tr></th><th className="text-right"><Tr>Precio</Tr></th></tr></thead>
            <tbody>
              {(item.ItemPrices ?? []).filter((p) => p.Price > 0).map((p) => (
                <tr key={p.PriceList}>
                  <td>{p.PriceListName ?? `${t("Lista")} ${p.PriceList}`}</td>
                  <td className="num text-right">{formatCurrency(p.Price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
