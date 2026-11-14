// Tipos de la información de SAP que muestra el CRM (los usan el servidor y los componentes de cliente).
export type SapPartner = {
  CardCode: string; CardName: string; FederalTaxID?: string | null; Phone1?: string | null; EmailAddress?: string | null;
  CurrentAccountBalance: number; OpenOrdersBalance: number; OpenDeliveryNotesBalance: number; CreditLimit: number;
};
/** Línea de un pedido de venta: cantidades y fecha plan de despacho (cada línea puede tener la suya). */
export type SapOrderLine = {
  Line: number; ItemCode: string; ItemDescription: string; Quantity: number; Invoiced: number;
  /** Lo que producción ya entregó a despacho y no se ha facturado. Nulo: no se calcula (artículos de compra). */
  InDispatch: number | null;
  ShipDate: string | null; ClientDate: string | null; Open: boolean; LineTotal: number;
};
export type SapDocument = {
  DocEntry: number; DocNum: number; DocDate: string; DocDueDate: string; DocTotal: number; VatSum?: number; PaidToDate?: number;
  DocCurrency?: string; DocumentStatus: string; Cancelled?: string; NumAtCard?: string | null;
  /** Solo pedidos traídos por el agente: próxima fecha de despacho pendiente y líneas. */
  NextShipDate?: string | null; Lines?: SapOrderLine[];
};
export type SapItem = {
  ItemCode: string; ItemName: string; QuantityOnStock: number; QuantityOrderedByCustomers?: number; QuantityOrderedFromVendors?: number;
  SalesUnit?: string | null;
  ItemPrices?: { PriceList: number; PriceListName?: string; Price: number; Currency?: string | null }[];
  ItemWarehouseInfoCollection?: { WarehouseCode: string; InStock: number; Committed: number; Ordered: number }[];
};
export type SapCustomerSummary = { partner: SapPartner; orders: SapDocument[]; deliveries: SapDocument[]; invoices: SapDocument[]; syncedAt?: string };
