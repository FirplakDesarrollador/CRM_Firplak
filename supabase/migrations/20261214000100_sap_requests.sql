-- Firplak CRM · SAP por agente, fase 2: solicitudes a demanda (importar productos).
-- El servidor del CRM no alcanza a SAP, así que lo que antes hacía en vivo (vista previa e importación
-- de productos) ahora lo pide: deja una solicitud aquí y el agente dentro de la red la atiende en
-- menos de un minuto, lee SAP y deja el resultado. La administración solo crea y lee solicitudes;
-- quien las toma, las cierra y crea los productos es el agente, por las funciones de abajo.

create table public.sap_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('product_preview', 'product_import')),
  params jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'error')),
  result jsonb,
  error text,
  requested_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index sap_requests_pending on public.sap_requests (created_at) where status = 'pending';

alter table public.sap_requests enable row level security;
create policy "sap solicitudes: leer" on public.sap_requests for select to authenticated
  using (public.has_perm('system', 'customize'));
create policy "sap solicitudes: crear" on public.sap_requests for insert to authenticated
  with check (public.has_perm('system', 'customize') and status = 'pending' and requested_by = auth.uid()
    and result is null and error is null and started_at is null and finished_at is null);
-- Sin políticas de actualización ni de borrado: solo el agente cambia una solicitud.

-- Toma la solicitud pendiente más antigua (o nada). De paso cierra las que nadie atendió.
create or replace function public.sap_agent_next_request()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare r public.sap_requests;
begin
  if not public.is_sap_agent() then raise exception 'Solo el agente de SAP' using errcode = '42501'; end if;
  update public.sap_requests set status = 'error', finished_at = now(),
         error = 'El agente no atendió la solicitud a tiempo. Revisa que el equipo del agente esté encendido y en la red.'
   where (status = 'pending' and created_at < now() - interval '15 minutes')
      or (status = 'running' and started_at < now() - interval '30 minutes');
  select * into r from public.sap_requests where status = 'pending' order by created_at limit 1 for update skip locked;
  if not found then return null; end if;
  update public.sap_requests set status = 'running', started_at = now() where id = r.id;
  return jsonb_build_object('id', r.id, 'kind', r.kind, 'params', r.params);
end;
$$;

create or replace function public.sap_agent_finish_request(p_id uuid, p_result jsonb, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_sap_agent() then raise exception 'Solo el agente de SAP' using errcode = '42501'; end if;
  update public.sap_requests
     set status = case when p_error is null then 'done' else 'error' end,
         result = p_result, error = left(p_error, 500), finished_at = now()
   where id = p_id and status = 'running';
  -- Historial corto: las últimas 100 solicitudes.
  delete from public.sap_requests where id in (select id from public.sap_requests order by created_at desc offset 100);
end;
$$;

-- Crea o actualiza productos por Referencia = ItemCode: solo el nombre y los campos personalizados
-- que vengan. No toca precios, familia ni el resto. Filas: [{ "code", "name", "custom": {…} }].
create or replace function public.sap_agent_import_products(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_created int; v_total int;
begin
  if not public.is_sap_agent() then raise exception 'Solo el agente de SAP' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'Lote no válido' using errcode = '22023';
  end if;
  with filas as (
    select distinct on (r ->> 'code') r ->> 'code' as code,
           coalesce(nullif(trim(r ->> 'name'), ''), r ->> 'code') as name,
           case when jsonb_typeof(r -> 'custom') = 'object' then r -> 'custom' else '{}'::jsonb end as custom
    from jsonb_array_elements(p_rows) r
    where coalesce(r ->> 'code', '') <> ''
  ), escritas as (
    insert into public.products (name, product_code, unit, is_active, custom_fields)
    select f.name, f.code, 'Unidad', true, f.custom from filas f
    on conflict (product_code) do update
      set name = excluded.name, custom_fields = public.products.custom_fields || excluded.custom_fields
    returning (xmax = 0) as nueva
  )
  select count(*) filter (where nueva), count(*) into v_created, v_total from escritas;
  return jsonb_build_object('created', v_created, 'updated', v_total - v_created);
end;
$$;

revoke execute on function public.sap_agent_next_request() from public, anon;
revoke execute on function public.sap_agent_finish_request(uuid, jsonb, text) from public, anon;
revoke execute on function public.sap_agent_import_products(jsonb) from public, anon;
grant execute on function public.sap_agent_next_request() to authenticated;
grant execute on function public.sap_agent_finish_request(uuid, jsonb, text) to authenticated;
grant execute on function public.sap_agent_import_products(jsonb) to authenticated;
