-- Firplak CRM · Borrar pedidos según el permiso del perfil.
-- Antes solo se podían eliminar pedidos en borrador o cancelados, aun con el permiso «Eliminar». Ahora
-- lo decide el perfil: quien tiene «Eliminar» en Pedidos (y alcance sobre el pedido, como en los demás
-- objetos) puede borrar un pedido en cualquier estado. Sus productos se borran con él. La oferta de
-- venta que el pedido tenga en SAP no se toca.

drop policy "pedidos: eliminar" on public.orders;
create policy "pedidos: eliminar" on public.orders for delete to authenticated
  using (public.can_delete_record('orders', owner_id));
