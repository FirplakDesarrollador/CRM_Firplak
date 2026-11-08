-- Cotizaciones como partes del negocio y cómo mueven la oportunidad (decisiones de Luis, 7 nov 2026).
--
--   · Las cotizaciones de una oportunidad son partes del negocio (p. ej. torre 1, torre 2), no alternativas.
--   · Valor de la oportunidad abierta = suma de sus partes abiertas (sin las Aceptadas, Rechazadas ni
--     Reemplazadas), en su moneda; se recalcula solo. Ganada: suma de sus partes aceptadas. Perdida: conserva
--     su valor. Sin cotizaciones (o solo borradores vacíos), el valor lo escribe el asesor. Ya no hay
--     «sincronizar» una sola cotización.
--   · Una parte Aceptada mientras quedan otras abiertas se separa en su propia oportunidad Ganada (misma
--     cuenta, asesor, pipeline y reparto; cierre hoy; enlazada a la original) y se lleva sus pedidos. La
--     original sigue abierta con lo que falta. Si era la última abierta, la original pasa a Ganada.
--   · Etapas solo hacia adelante: cada pipeline marca qué etapa es «propuesta» y cuál «negociación». La
--     primera parte Presentada lleva a la de propuesta; una Aceptada con otras abiertas, a la de negociación.
--   · Si se rechaza la última parte abierta sin ninguna aceptada, se avisa al asesor y a su jefe (no se
--     cierra sola). «Reemplazada» es la versión anterior de una parte: no suma ni avisa.
--   · Marcar Perdida a mano rechaza las partes abiertas; no se permite si hay partes aceptadas o pedidos activos.
--   · Una oportunidad cerrada no admite cotizaciones nuevas. Un pedido cancelado avisa al asesor y a su jefe.

-- ---------------------------------------------------------------------------
-- Estructura
-- ---------------------------------------------------------------------------
alter table public.pipeline_stages add column stage_role text check (stage_role in ('propuesta', 'negociacion'));
comment on column public.pipeline_stages.stage_role is 'Etapa a la que avanza la oportunidad: propuesta (primera cotización presentada) o negociacion (primera parte aceptada con otras abiertas).';
create unique index pipeline_stages_one_role on public.pipeline_stages (pipeline_id, stage_role) where stage_role is not null;

-- Marcas por defecto en los pipelines con las etapas estándar (se cambian en Configuración → Pipelines).
update public.pipeline_stages set stage_role = 'propuesta'
where id in (select distinct on (pipeline_id) id from public.pipeline_stages
             where category = 'open' and name in ('Cotización enviada', 'Propuesta comercial')
             order by pipeline_id, sort_order)
  and not exists (select 1 from public.pipeline_stages x where x.pipeline_id = pipeline_stages.pipeline_id and x.stage_role = 'propuesta');
update public.pipeline_stages set stage_role = 'negociacion'
where id in (select distinct on (pipeline_id) id from public.pipeline_stages
             where category = 'open' and name in ('Negociación', 'Pedido en negociación')
             order by pipeline_id, sort_order)
  and not exists (select 1 from public.pipeline_stages x where x.pipeline_id = pipeline_stages.pipeline_id and x.stage_role = 'negociacion');

alter table public.quotes drop constraint quotes_status_check;
alter table public.quotes add constraint quotes_status_check
  check (status in ('Borrador', 'En revisión', 'Aprobada', 'Presentada', 'Aceptada', 'Rechazada', 'Reemplazada'));

alter table public.opportunities add column parent_opportunity_id uuid
  references public.opportunities (id) on delete set null;
comment on column public.opportunities.parent_opportunity_id is 'Oportunidad original de la que se separó esta parte ganada.';
create index opportunities_parent_idx on public.opportunities (parent_opportunity_id) where parent_opportunity_id is not null;

-- Duplicar un pipeline también copia las marcas de sus etapas.
create or replace function public.duplicate_pipeline(p_pipeline uuid, p_name text, p_market text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_src public.pipelines%rowtype;
  v_id uuid;
begin
  select * into v_src from public.pipelines where id = p_pipeline;
  if not found then
    raise exception 'El pipeline no existe.' using errcode = '23514';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Escribe el nombre del pipeline nuevo.' using errcode = '23514';
  end if;
  insert into public.pipelines (name, description, channel, market, is_default, is_active, sort_order)
  values (trim(p_name), v_src.description, v_src.channel, public.market_of(p_market), false, true, v_src.sort_order + 1)
  returning id into v_id;
  insert into public.pipeline_stages (pipeline_id, name, name_en, sort_order, probability, category, forecast_category, color, stage_role)
  select v_id, s.name, s.name_en, s.sort_order, s.probability, s.category, s.forecast_category, s.color, s.stage_role
  from public.pipeline_stages s where s.pipeline_id = p_pipeline;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ayudas internas
-- ---------------------------------------------------------------------------
create or replace function public.quote_is_open_part(p_status text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select p_status not in ('Aceptada', 'Rechazada', 'Reemplazada');
$$;
revoke execute on function public.quote_is_open_part(text) from public, anon;
grant execute on function public.quote_is_open_part(text) to authenticated;

-- Aviso al asesor y a su jefe (directo en la tabla: corre también sin sesión de usuario).
create or replace function public.notify_owner_and_manager(p_owner uuid, p_title text, p_body text, p_link text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, title, body, link, created_by)
  select distinct u, left(p_title, 200), left(p_body, 1000), p_link, auth.uid()
  from (select p_owner u union select manager_id from public.profiles where id = p_owner) x
  join public.profiles p on p.id = x.u and p.is_active
  where x.u is not null;
end;
$$;
revoke execute on function public.notify_owner_and_manager(uuid, text, text, text) from public, anon, authenticated;

-- Valor de la oportunidad según sus partes.
create or replace function public.opportunity_parts_value(p_opp uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_opp record;
  v_n int;
  v_sum numeric;
begin
  select o.id, o.currency, o.is_closed, o.is_won into v_opp from public.opportunities o where o.id = p_opp;
  if not found or (v_opp.is_closed and not v_opp.is_won) then
    return;  -- Perdida: conserva el valor con el que se perdió.
  end if;
  -- Cuentan las cotizaciones de su moneda con contenido (un borrador vacío no borra el valor escrito a mano).
  select count(*),
         coalesce(sum(q.net_total) filter (where case when v_opp.is_won then q.status = 'Aceptada' else public.quote_is_open_part(q.status) end), 0)
    into v_n, v_sum
  from public.quotes q
  where q.opportunity_id = p_opp and q.currency = v_opp.currency
    and not (q.status = 'Borrador' and q.net_total = 0)
    and (not v_opp.is_won or q.status = 'Aceptada');
  if v_n = 0 then
    return;
  end if;
  if v_opp.currency = 'COP' then
    update public.opportunities set amount = v_sum where id = p_opp and amount is distinct from v_sum;
  else
    update public.opportunities set foreign_amount = v_sum where id = p_opp and foreign_amount is distinct from v_sum;
  end if;
end;
$$;
revoke execute on function public.opportunity_parts_value(uuid) from public, anon, authenticated;

-- Avanza la oportunidad a la etapa marcada con ese rol, solo si está antes (nunca retrocede).
create or replace function public.opportunity_advance_to_role(p_opp uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target record;
  v_current int;
begin
  select s.id, s.sort_order into v_target
  from public.opportunities o join public.pipeline_stages s on s.pipeline_id = o.pipeline_id and s.stage_role = p_role
  where o.id = p_opp and not o.is_closed;
  if not found then
    return;
  end if;
  select s.sort_order into v_current
  from public.opportunities o join public.pipeline_stages s on s.id = o.stage_id
  where o.id = p_opp and s.category = 'open';
  if v_current is not null and v_current < v_target.sort_order then
    update public.opportunities set stage_id = v_target.id where id = p_opp;
  end if;
end;
$$;
revoke execute on function public.opportunity_advance_to_role(uuid, text) from public, anon, authenticated;

create or replace function public.won_stage_of(p_pipeline uuid)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select s.id from public.pipeline_stages s where s.pipeline_id = p_pipeline and s.category = 'won' order by s.sort_order limit 1;
$$;
revoke execute on function public.won_stage_of(uuid) from public, anon;
grant execute on function public.won_stage_of(uuid) to authenticated;

-- Separa una parte aceptada en su propia oportunidad Ganada; devuelve la nueva.
create or replace function public.opportunity_split_part(p_opp uuid, p_quote uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.opportunities%rowtype;
  v_q public.quotes%rowtype;
  v_id uuid;
begin
  select * into v_o from public.opportunities where id = p_opp;
  select * into v_q from public.quotes where id = p_quote;
  insert into public.opportunities (name, account_id, contact_id, owner_id, created_by, pipeline_id, stage_id, amount, foreign_amount,
                                    close_date, opportunity_type, lead_source, description, custom_fields, is_demo, parent_opportunity_id)
  values (left(v_o.name || ' · ' || v_q.name, 250), v_o.account_id, coalesce(v_q.contact_id, v_o.contact_id), v_o.owner_id, auth.uid(),
          v_o.pipeline_id, public.won_stage_of(v_o.pipeline_id),
          case when v_o.currency = 'COP' then v_q.net_total else 0 end,
          case when v_o.currency = 'COP' then null else v_q.net_total end,
          (now() at time zone 'America/Bogota')::date, v_o.opportunity_type, v_o.lead_source,
          format('Parte ganada de «%s» (cotización %s).', v_o.name, v_q.quote_number), v_o.custom_fields, v_o.is_demo, v_o.id)
  returning id into v_id;
  -- El reparto de ingresos de la original vale para la parte ganada.
  insert into public.opportunity_splits (opportunity_id, user_id, percent, note)
  select v_id, s.user_id, s.percent, s.note from public.opportunity_splits s where s.opportunity_id = p_opp;
  update public.quotes set opportunity_id = v_id where id = p_quote;
  update public.orders set opportunity_id = v_id where quote_id = p_quote;
  return v_id;
end;
$$;
revoke execute on function public.opportunity_split_part(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- La cotización mueve la oportunidad
-- ---------------------------------------------------------------------------
create or replace function public.quote_status_moves_opportunity(p_quote uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_q public.quotes%rowtype;
  v_o public.opportunities%rowtype;
  v_open_others boolean;
  v_won_parts boolean;
begin
  select * into v_q from public.quotes where id = p_quote;
  select * into v_o from public.opportunities where id = v_q.opportunity_id;
  if not found or v_o.is_closed or v_q.currency <> v_o.currency then
    return;
  end if;
  v_open_others := exists (select 1 from public.quotes x
                           where x.opportunity_id = v_o.id and x.id <> v_q.id and x.currency = v_o.currency
                             and public.quote_is_open_part(x.status) and not (x.status = 'Borrador' and x.net_total = 0));
  if v_q.status = 'Presentada' then
    perform public.opportunity_advance_to_role(v_o.id, 'propuesta');
  elsif v_q.status = 'Aceptada' then
    if v_open_others then
      perform public.opportunity_split_part(v_o.id, v_q.id);
      perform public.opportunity_advance_to_role(v_o.id, 'negociacion');
    else
      update public.opportunities
        set stage_id = public.won_stage_of(v_o.pipeline_id), close_date = (now() at time zone 'America/Bogota')::date
        where id = v_o.id;
    end if;
  elsif v_q.status = 'Rechazada' and not v_open_others then
    v_won_parts := exists (select 1 from public.opportunities c where c.parent_opportunity_id = v_o.id);
    perform public.notify_owner_and_manager(v_o.owner_id,
      format('Partes rechazadas: %s', v_o.name),
      case when v_won_parts
        then 'Las partes pendientes quedaron rechazadas; las ganadas siguen en sus oportunidades. Márcala Perdida con su motivo o cotiza otra versión.'
        else 'Todas sus cotizaciones quedaron rechazadas. Márcala Perdida con su motivo o cotiza otra versión.' end,
      '/oportunidades/' || v_o.id);
  end if;
end;
$$;
revoke execute on function public.quote_status_moves_opportunity(uuid) from public, anon, authenticated;

create or replace function public.quote_parts_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.opportunity_parts_value(old.opportunity_id);
    return null;
  end if;
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    perform public.quote_status_moves_opportunity(new.id);
  end if;
  -- La original y, si la parte se separó o cambió de oportunidad, la nueva.
  if tg_op = 'UPDATE' and old.opportunity_id is distinct from new.opportunity_id then
    perform public.opportunity_parts_value(old.opportunity_id);
  end if;
  perform public.opportunity_parts_value(new.opportunity_id);
  perform public.opportunity_parts_value(q.opportunity_id) from public.quotes q
    where q.id = new.id and q.opportunity_id is distinct from new.opportunity_id;
  return null;
end;
$$;
revoke execute on function public.quote_parts_changed() from public, anon, authenticated;
create trigger quotes_parts_value after insert or update or delete on public.quotes
  for each row execute function public.quote_parts_changed();

-- Una oportunidad cerrada no admite cotizaciones nuevas (salvo la parte aceptada que se separa).
create or replace function public.quote_needs_open_opportunity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if new.opportunity_id is null or new.status = 'Aceptada'
     or (tg_op = 'UPDATE' and new.opportunity_id is not distinct from old.opportunity_id) then
    return new;
  end if;
  select o.name into v_name from public.opportunities o where o.id = new.opportunity_id and o.is_closed;
  if found then
    raise exception 'La oportunidad «%» está cerrada: para cotizar un negocio nuevo, crea otra oportunidad.', v_name using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function public.quote_needs_open_opportunity() from public, anon, authenticated;
create trigger quotes_open_opportunity before insert or update of opportunity_id on public.quotes
  for each row execute function public.quote_needs_open_opportunity();

-- El total de la cotización ya no copia el valor a la oportunidad: lo hace la suma de partes.
create or replace function public.recalc_quote(p_quote uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub numeric;
  v_net numeric;
begin
  select coalesce(sum(quantity * unit_price), 0), coalesce(sum(line_total), 0)
    into v_sub, v_net
    from public.quote_line_items where quote_id = p_quote;
  update public.quotes q
    set subtotal = round(v_sub, 2),
        discount_total = round(v_sub - v_net, 2),
        net_total = v_net,
        tax = round(v_net * q.tax_rate / 100.0, 2),
        grand_total = v_net + round(v_net * q.tax_rate / 100.0, 2) + q.shipping
    where q.id = p_quote;
end;
$$;

-- «Sincronizar» queda como recálculo (compatibilidad con el MCP y llamadas antiguas). Corre con permisos del
-- sistema para usar el recálculo interno, después de comprobar que quien llama puede editar la oportunidad.
create or replace function public.sync_quote(p_quote uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_opp uuid;
  v_currency text;
  v_opp_currency text;
begin
  select opportunity_id, currency into v_opp, v_currency from public.quotes where id = p_quote;
  if v_opp is null then
    raise exception 'Cotización no encontrada';
  end if;
  select currency into v_opp_currency from public.opportunities where id = v_opp;
  if v_opp_currency is distinct from v_currency then
    raise exception 'La cotización está en % y la oportunidad en %: revísalas antes de sincronizar.', v_currency, v_opp_currency
      using errcode = '23514';
  end if;
  if not public.can_edit_record('opportunities', (select owner_id from public.opportunities where id = v_opp)) then
    raise exception 'No tienes permiso para actualizar la oportunidad' using errcode = '42501';
  end if;
  perform public.opportunity_parts_value(v_opp);
end;
$$;
revoke execute on function public.sync_quote(uuid) from public, anon;
grant execute on function public.sync_quote(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- La oportunidad marcada Perdida a mano; el pedido cancelado
-- ---------------------------------------------------------------------------
create or replace function public.opportunity_lost_rejects_parts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (new.is_closed and not new.is_won) or (old.is_closed and not old.is_won) then
    return null;
  end if;
  if exists (select 1 from public.quotes q where q.opportunity_id = new.id and q.status = 'Aceptada')
     or exists (select 1 from public.orders d where d.opportunity_id = new.id and d.status not in ('Borrador', 'Cancelado')) then
    raise exception 'No se puede marcar Perdida: el cliente ya aceptó una parte o hay un pedido activo.' using errcode = '23514';
  end if;
  update public.quotes set status = 'Rechazada'
  where opportunity_id = new.id and public.quote_is_open_part(status);
  return null;
end;
$$;
revoke execute on function public.opportunity_lost_rejects_parts() from public, anon, authenticated;
create trigger opportunities_lost_rejects_parts after update of stage_id on public.opportunities
  for each row execute function public.opportunity_lost_rejects_parts();

create or replace function public.order_cancelled_notifies()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'Cancelado' and old.status is distinct from 'Cancelado' then
    perform public.notify_owner_and_manager(new.owner_id,
      format('Pedido cancelado: %s', coalesce(new.order_number, new.name)),
      format('El pedido «%s» se canceló. Revisa la oportunidad y, si aplica, la oferta de venta en SAP.', new.name),
      '/pedidos/' || new.id);
  end if;
  return null;
end;
$$;
revoke execute on function public.order_cancelled_notifies() from public, anon, authenticated;
create trigger orders_cancelled_notifies after update of status on public.orders
  for each row execute function public.order_cancelled_notifies();
