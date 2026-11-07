-- Firplak CRM · Mercado de las cuentas y listas que dependen de varias listas.
--   · Cuentas: campo «Mercado» (Nacional / Internacional), aparte del Tipo (Prospecto, Cliente…).
--   · Una lista puede depender de varias listas del mismo objeto a la vez: p. ej. Segmento según
--     Mercado y Canal. Un valor se puede elegir si corresponde a lo elegido en TODAS ellas.
--     Cada valor guarda, por cada lista que lo controla, los valores con los que va (controlling_map).

alter table public.accounts add column market text;

alter table public.picklist_dependencies drop constraint picklist_dependencies_pkey;
alter table public.picklist_dependencies add primary key (object, field, controlling_field);

alter table public.picklist_values add column controlling_map jsonb not null default '{}'::jsonb;
-- Las relaciones guardadas con la versión anterior pasan al nuevo formato.
update public.picklist_values pv
set controlling_map = jsonb_build_object(d.controlling_field, to_jsonb(pv.controlling_values))
from public.picklist_dependencies d
where d.object = pv.object and d.field = pv.field and cardinality(pv.controlling_values) > 0;
comment on column public.picklist_values.controlling_values is
  'Obsoleta: la reemplaza controlling_map. Se conserva para la versión anterior de la aplicación y se borrará después.';

create or replace function public.enforce_picklist_dependencies()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.picklist_dependencies%rowtype;
  v_new jsonb := to_jsonb(new);
  v_old jsonb;
  v_value text;
  v_control text;
begin
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
  end if;
  for d in select * from public.picklist_dependencies where object = tg_table_name order by controlling_field loop
    v_value := public.record_field_text(v_new, d.field);
    v_control := public.record_field_text(v_new, d.controlling_field);
    -- Sin cambios en ninguno de los dos campos: se respeta lo que ya había.
    continue when tg_op = 'UPDATE'
      and v_value is not distinct from public.record_field_text(v_old, d.field)
      and v_control is not distinct from public.record_field_text(v_old, d.controlling_field);
    continue when v_value is null;
    if v_control is null then
      raise exception 'Elige primero el valor del que depende «%».', v_value using errcode = '23514';
    end if;
    if not exists (
      select 1 from public.picklist_values pv
      where pv.object = d.object and pv.field = d.field and pv.value = v_value
        and coalesce(pv.controlling_map -> d.controlling_field, '[]'::jsonb) ? v_control
    ) then
      raise exception '«%» no corresponde a «%».', v_value, v_control using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;
