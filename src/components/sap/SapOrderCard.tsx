import { AlertTriangle, Database, Send } from "lucide-react";
import { ActionForm } from "@/components/ui/ActionForm";
import { Fmt } from "@/components/ui/Fmt";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Tr } from "@/components/ui/Tr";
import { getT } from "@/lib/i18n/server";
import { formatCurrency } from "@/lib/format";
import { getQuotationStatus } from "@/lib/sap/quotations";
import { getSapSettings } from "@/lib/sap/settings";
import { sendOrderToSapNow } from "@/lib/sap/actions";

type OrderSap = { id: string; status: string; sap_quotation_entry: number | null; sap_quotation_num: number | null; sap_sent_at: string | null; sap_error: string | null };

/** Pedido ↔ oferta de venta en SAP: número, estado en SAP, error y reintento. */
export async function SapOrderCard({ order, canEdit }: { order: OrderSap; canEdit: boolean }) {
  const t = await getT();
  const settings = await getSapSettings();
  const active = !["Borrador", "Cancelado"].includes(order.status);
  let sapState: string | null = null;
  let total: number | null = null;
  if (order.sap_quotation_entry) {
    try {
      const q = await getQuotationStatus(order.sap_quotation_entry);
      total = q.DocTotal;
      sapState = q.Cancelled === "tYES" ? "Cancelada en SAP"
        : q.DocumentStatus === "bost_Close" ? "Cerrada en SAP (convertida en orden de venta o cerrada)"
          : "Abierta en SAP: pendiente de validación";
    } catch (e) {
      sapState = `${t("No se pudo consultar SAP:")} ${(e as Error).message}`;
    }
  }

  return (
    <section className="card overflow-hidden">
      <div className="card-header flex-wrap gap-1">
        <h2 className="card-title"><Database size={16} /> <Tr>Oferta de venta en SAP</Tr></h2>
        <span className="text-xs text-muted">{t(settings.create_quotations ? "Se crea al activar el pedido" : "Envío automático desactivado en Configuración → SAP Business One")}</span>
      </div>
      <div className="space-y-3 p-4 text-sm">
        {order.sap_quotation_num ? (
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p><span className="text-muted">{t("Oferta N.º")}</span> <strong className="num text-lg">{order.sap_quotation_num}</strong></p>
            {total !== null && <p className="num">{formatCurrency(total)}</p>}
            {order.sap_sent_at && <p className="text-xs text-muted">{t("Enviada")} <Fmt datetime={order.sap_sent_at} /></p>}
            {sapState && <p className="basis-full">{t(sapState)}</p>}
          </div>
        ) : (
          <p className="text-muted">{t(active ? "Este pedido aún no tiene oferta de venta en SAP." : "La oferta de venta se crea en SAP cuando el pedido se activa.")}</p>
        )}
        {order.sap_error && !order.sap_quotation_num && (
          <p className="flex items-start gap-2 text-danger"><AlertTriangle size={15} className="mt-0.5 flex-none" /> {order.sap_error}</p>
        )}
        {active && !order.sap_quotation_num && canEdit && (
          <ActionForm action={sendOrderToSapNow.bind(null, order.id)} className="flex flex-col items-start gap-1">
            <SubmitButton className="btn btn-primary btn-sm" pendingText="Enviando…">
              <Send size={14} /> <Tr>{order.sap_error ? "Reintentar envío a SAP" : "Enviar a SAP como oferta de venta"}</Tr>
            </SubmitButton>
          </ActionForm>
        )}
        <p className="text-xs text-muted"><Tr>El CRM crea solo la oferta de venta: un experto la valida en SAP y la convierte en la orden de venta que inicia la fabricación.</Tr></p>
      </div>
    </section>
  );
}
