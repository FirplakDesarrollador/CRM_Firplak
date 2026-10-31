-- Firplak CRM · Fase 23: pedidos del CRM → ofertas de venta en SAP Business One.
-- Al activar un pedido (si administración lo habilita) se crea una OFERTA de venta en SAP —no una
-- orden de venta—: un experto la valida en SAP antes de convertirla en la orden formal que inicia
-- la fabricación. El pedido guarda el número de la oferta y el último error, para reintentar.

alter table public.orders
  add column sap_quotation_entry int,
  add column sap_quotation_num int,
  add column sap_sent_at timestamptz,
  add column sap_error text;
create unique index orders_sap_quotation_key on public.orders (sap_quotation_entry) where sap_quotation_entry is not null;
