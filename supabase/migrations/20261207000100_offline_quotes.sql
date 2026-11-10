-- Modo sin conexión, parte C: cotizaciones hechas sin señal.
--
-- El asesor cotiza en el teléfono con los precios que descargó en la mañana. Si al llegar al CRM la lista ya
-- trae otro precio, se respeta el que cotizó (decisión de Luis) y la línea queda marcada con el precio de lista
-- vigente en ese momento, para que el asesor y quien revise la cotización lo vean.

alter table public.quote_line_items
  add column offline_list_price numeric(18, 2) check (offline_list_price is null or offline_list_price >= 0);

comment on column public.quote_line_items.offline_list_price is
  'Línea cotizada sin señal a un precio distinto al de la lista: precio de lista vigente cuando la cotización llegó al CRM. Nulo si no hubo diferencia. Se borra al cambiar el precio o el producto de la línea.';

-- La marca solo dice algo mientras la línea conserve el precio que se cotizó sin señal.
create or replace function public.quote_line_offline_price()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.offline_list_price = new.unit_price then
      new.offline_list_price := null;
    end if;
  elsif new.unit_price is distinct from old.unit_price or new.product_id is distinct from old.product_id then
    new.offline_list_price := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.quote_line_offline_price() from public, anon, authenticated;

create trigger quote_line_items_offline_price before insert or update of unit_price, product_id on public.quote_line_items
  for each row execute function public.quote_line_offline_price();
