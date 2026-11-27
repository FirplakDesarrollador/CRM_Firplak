-- Cierre de facturación del cliente (Luis, 2026-11-26): el día del mes hasta el que el cliente recibe facturas
-- (su corte). Con él se sabe hasta cuándo entregar para facturar en el mismo mes: si cierra el 25, la entrega debe
-- quedar hecha a más tardar el 24, para enviar la factura al día siguiente con la remisión firmada.
-- Es propio de las empresas (B2B); a una persona natural no le aplica y se deja vacío.

alter table public.accounts
  add column billing_cutoff_day smallint check (billing_cutoff_day between 1 and 31);
comment on column public.accounts.billing_cutoff_day is
  'Día del mes en que el cliente cierra la recepción de facturas. Vacío: no tiene corte. Sale en el pedido impreso y avisa si la entrega solicitada cae después.';
