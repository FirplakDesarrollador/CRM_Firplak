-- Firplak CRM · Listas dependientes (como las dependencias de campos de Sales Cloud).
-- Una lista personalizada puede depender de otra lista del mismo objeto: p. ej. en Cuentas,
-- Segmento depende de Sector. Cada valor de la lista dependiente guarda los valores de la
-- lista que la controla con los que se puede usar; el formulario solo ofrece esos, y la base
-- rechaza combinaciones que no correspondan (también en importaciones y asistentes de IA).
-- Los registros que ya tenían una combinación distinta se conservan hasta que alguien cambie
-- alguno de los dos campos.

create table public.picklist_dependencies (
  object text not null,
  field text not null,
  controlling_field text not null,
  created_at timestamptz not null default now(),
  primary key (object, field),
  check (field <> controlling_field)
);
alter table public.picklist_dependencies enable row level security;
create policy "dependencias de listas: lectura" on public.picklist_dependencies for select to authenticated using (true);
create policy "dependencias de listas: personalización" on public.picklist_dependencies for all to authenticated
  using (public.has_perm('system', 'customize')) with check (public.has_perm('system', 'customize'));
grant select on public.picklist_dependencies to authenticated;
grant insert, update, delete on public.picklist_dependencies to authenticated;

-- Valores de la lista que controla con los que este valor se puede elegir.
alter table public.picklist_values add column controlling_values text[] not null default '{}';

-- Texto de un campo de un registro en jsonb (columna o campo personalizado «cf.»).
create or replace function public.record_field_text(p_row jsonb, p_field text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(case when left(p_field, 3) = 'cf.' then p_row -> 'custom_fields' ->> substr(p_field, 4)
                     else p_row ->> p_field end, '');
$$;

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
  for d in select * from public.picklist_dependencies where object = tg_table_name loop
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
      where pv.object = d.object and pv.field = d.field and pv.value = v_value and v_control = any (pv.controlling_values)
    ) then
      raise exception '«%» no corresponde a «%».', v_value, v_control using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['accounts', 'contacts', 'leads', 'opportunities', 'cases', 'campaigns', 'products', 'activities'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.enforce_picklist_dependencies()',
                   t || '_picklist_dependencies', t);
  end loop;
end
$$;
