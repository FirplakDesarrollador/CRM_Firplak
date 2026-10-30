-- Firplak CRM · Código SAP de los clientes.
-- Cada cuenta puede llevar el código de su socio de negocio en SAP Business One (CardCode),
-- para vincularla con el mismo cliente en SAP antes de que exista una sincronización.
-- Se guarda en mayúsculas y sin espacios, y no se repite entre cuentas.

alter table public.accounts add column sap_card_code text;

create or replace function public.normalize_sap_card_code()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.sap_card_code := nullif(upper(regexp_replace(coalesce(new.sap_card_code, ''), '\s', '', 'g')), '');
  return new;
end;
$$;
create trigger accounts_sap_card_code before insert or update of sap_card_code on public.accounts
  for each row execute function public.normalize_sap_card_code();

create unique index accounts_sap_card_code_key on public.accounts (sap_card_code) where sap_card_code is not null;
