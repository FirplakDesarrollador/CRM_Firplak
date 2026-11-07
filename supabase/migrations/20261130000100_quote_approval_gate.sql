-- Firplak CRM · Una cotización que requiere aprobación no avanza sin ella.
-- Antes, el proceso «Descuento superior al 15 %» solo revisaba cotizaciones en Borrador: un asesor podía
-- tocar «Presentada» (o «Aprobada») en la barra de estados y saltarse la aprobación.
--
-- Regla: si una cotización cumple las condiciones de un proceso de aprobación activo (sin contar el estado),
--   · solo el flujo de aprobación la pasa a «En revisión» o «Aprobada»;
--   · para pasarla a «Presentada» o «Aceptada» necesita una aprobación concedida después del último cambio de
--     los datos que revisa el proceso (p. ej. el descuento);
--   · si ya está en revisión, aprobada, presentada o aceptada y cambian esos datos (y sigue requiriendo
--     aprobación), el cambio se rechaza: se pasa a Borrador y se envía de nuevo.
-- Las cotizaciones que no requieren aprobación siguen igual. Los procesos sin usuario (cargas, tareas
-- programadas) no se revisan.

alter table public.quotes add column approval_basis_at timestamptz;
comment on column public.quotes.approval_basis_at is
  'Último cambio de los datos que revisan los procesos de aprobación (p. ej. el descuento). Una aprobación solo vale si es posterior.';

-- Las actualizaciones de campos que hace el flujo de aprobación (enviar, aprobar, rechazar, retirar) se marcan
-- para que la regla de abajo las deje pasar. La marca dura solo mientras se aplican.
create or replace function public.apply_field_updates(p_table text, p_id uuid, p_updates jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  u jsonb;
  f text;
  v text;
  t text;
begin
  perform set_config('firplak.approval_engine', 'on', true);
  for u in select * from jsonb_array_elements(coalesce(p_updates, '[]'::jsonb)) loop
    f := u ->> 'field';
    v := nullif(u ->> 'value', '');
    continue when f is null or f = '';
    if left(f, 3) = 'cf.' then
      execute format('update public.%I set custom_fields = coalesce(custom_fields, ''{}''::jsonb) || jsonb_build_object($1::text, to_jsonb($2::text)) where id = $3', p_table)
        using substr(f, 4), v, p_id;
    else
      select pg_catalog.format_type(a.atttypid, a.atttypmod) into t
        from pg_catalog.pg_attribute a
        where a.attrelid = format('public.%I', p_table)::regclass and a.attname = f
          and a.attnum > 0 and not a.attisdropped and a.attgenerated = '';
      if t is null or f in ('id', 'created_at', 'created_by', 'updated_at', 'is_demo', 'custom_fields') then
        raise exception 'Campo no válido en el proceso de aprobación: %', f;
      end if;
      execute format('update public.%I set %I = $1::%s where id = $2', p_table, f, t) using v, p_id;
    end if;
  end loop;
  perform set_config('firplak.approval_engine', '', true);
end;
$$;
revoke execute on function public.apply_field_updates(text, uuid, jsonb) from public, anon, authenticated;

-- Condiciones de un proceso sin las del estado: el estado es el paso del flujo, no lo que se aprueba.
create or replace function public.conditions_without_status(p_conditions jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(c), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(p_conditions) = 'array' then p_conditions else '[]'::jsonb end) c
  where c ->> 'field' is distinct from 'status';
$$;
revoke execute on function public.conditions_without_status(jsonb) from public, anon, authenticated;

create or replace function public.enforce_quote_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_new jsonb;
  v_old jsonb;
  v_fields text[];
  v_changed boolean;
  v_needs uuid[];
  v_names text;
begin
  if auth.uid() is null or current_setting('firplak.approval_engine', true) = 'on' then
    return new;
  end if;

  -- discount_percent es una columna calculada: en este punto aún no tiene el valor nuevo.
  v_new := to_jsonb(new) || jsonb_build_object('discount_percent',
    case when new.subtotal > 0 then round(new.discount_total * 100 / new.subtotal, 2) else 0 end);
  v_old := to_jsonb(old);

  -- Datos que revisan los procesos activos de cotizaciones (sin el estado).
  select coalesce(array_agg(distinct c ->> 'field'), '{}') into v_fields
  from public.approval_processes p, jsonb_array_elements(public.conditions_without_status(p.conditions)) c
  where p.object = 'quotes' and p.is_active;

  select exists (
    select 1 from unnest(v_fields) f
    where (case when left(f, 3) = 'cf.' then v_new -> 'custom_fields' -> substr(f, 4) else v_new -> f end)
          is distinct from (case when left(f, 3) = 'cf.' then v_old -> 'custom_fields' -> substr(f, 4) else v_old -> f end))
    into v_changed;
  if v_changed then
    new.approval_basis_at := now();
  end if;

  -- Procesos que esta cotización requiere con sus datos nuevos.
  select array_agg(p.id), string_agg(p.name, ', ' order by p.sort_order) into v_needs, v_names
  from public.approval_processes p
  where p.object = 'quotes' and p.is_active and public.conditions_match(v_new, public.conditions_without_status(p.conditions));

  if v_needs is null or new.status not in ('En revisión', 'Aprobada', 'Presentada', 'Aceptada') then
    return new;
  end if;
  if new.status is not distinct from old.status and not v_changed then
    return new;
  end if;

  if v_changed then
    raise exception 'Esta cotización requiere aprobación (%). Para cambiar el descuento o los precios, pásala a Borrador y envíala de nuevo a aprobación.', v_names
      using errcode = 'P0001';
  end if;
  if new.status in ('En revisión', 'Aprobada') then
    raise exception 'Esta cotización requiere aprobación (%): usa «Enviar a aprobación»; el estado «%» lo pone el flujo de aprobación.', v_names, new.status
      using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.approval_requests r
    where r.object = 'quotes' and r.record_id = new.id and r.status = 'approved' and r.process_id = any (v_needs)
      and r.decided_at >= coalesce(new.approval_basis_at, '-infinity'::timestamptz)
  ) then
    raise exception 'Esta cotización requiere aprobación (%) antes de pasarla a «%»: pásala a Borrador y usa «Enviar a aprobación».', v_names, new.status
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_quote_approval() from public, anon, authenticated;

-- «w» la hace correr después de los demás triggers de cotizaciones (totales, moneda, fechas).
create trigger quotes_workflow_gate before update on public.quotes
  for each row execute function public.enforce_quote_approval();
