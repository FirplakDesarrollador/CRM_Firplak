-- Zonas y territorios comerciales (decisiones de Luis, 13 nov 2026).
--
-- · Zona: campo propio del cliente y del prospecto (antes era un campo configurable con una lista de ejemplo). En el
--   mercado Nacional la zona sale del departamento y la ciudad (tabla `zone_places`, editable); en el exterior la
--   zona es el país y el cliente lleva además su puerto destino.
-- · Territorios: qué canal, mercado y zona o países atiende cada asesor. Sirven para (1) informes, (2) sugerir el
--   responsable de un cliente o prospecto y (3) que un asesor no cree clientes fuera de lo suyo. Quien no tiene
--   territorios no tiene restricción. Partir una zona entre dos asesores o abrirle un país a alguien es agregar o
--   cambiar filas, sin tocar código.

alter table public.accounts add column zone text, add column destination_port text;
alter table public.leads add column zone text;
comment on column public.accounts.zone is 'Zona comercial (mercado Nacional). Vacía se llena sola según departamento y ciudad.';
comment on column public.accounts.destination_port is 'Puerto destino, para clientes del exterior.';
comment on column public.leads.zone is 'Zona comercial (mercado Nacional). Vacía se llena sola según departamento y ciudad.';
create index accounts_zone_idx on public.accounts (zone) where zone is not null;

-- Lo que ya estaba en el campo configurable «Zona comercial» pasa al campo propio, con los nombres nuevos.
update public.accounts a set zone = case a.custom_fields ->> 'zona_comercial'
    when 'Bogotá y Centro' then 'Centro del País'
    when 'Suroccidente' then 'Sur Occidente'
    when 'Exportación' then null
    else a.custom_fields ->> 'zona_comercial' end
where nullif(a.custom_fields ->> 'zona_comercial', '') is not null;
update public.accounts set custom_fields = custom_fields - 'zona_comercial' where custom_fields ? 'zona_comercial';
update public.custom_field_definitions set is_active = false where object = 'accounts' and api_name = 'zona_comercial';

-- A qué zona pertenece cada departamento; una fila con ciudad es una excepción dentro de su departamento.
create table public.zone_places (
  id uuid primary key default gen_random_uuid(),
  zone text not null check (length(trim(zone)) > 0),
  department text not null check (length(trim(department)) > 0),
  city text,
  created_at timestamptz not null default now()
);
create unique index zone_places_place_idx on public.zone_places (public.normalize_text(department), coalesce(public.normalize_text(city), ''));
alter table public.zone_places enable row level security;
create policy "zonas por lugar: ver" on public.zone_places for select to authenticated using (true);
create policy "zonas por lugar: gestionar" on public.zone_places for all to authenticated
  using (public.has_perm('system', 'manage_users')) with check (public.has_perm('system', 'manage_users'));

insert into public.zone_places (zone, department)
select z.zone, d.department
from (values
  ('Antioquia', 'Antioquia'), ('Antioquia', 'Chocó'),
  ('Costa Atlántica', 'Bolívar'), ('Costa Atlántica', 'Atlántico'), ('Costa Atlántica', 'Magdalena'), ('Costa Atlántica', 'Cesar'),
  ('Costa Atlántica', 'La Guajira'), ('Costa Atlántica', 'San Andrés y Providencia'),
  ('Centro del País', 'Bogotá D.C.'), ('Centro del País', 'Cundinamarca'), ('Centro del País', 'Meta'), ('Centro del País', 'Boyacá'),
  ('Centro del País', 'Casanare'), ('Centro del País', 'Guainía'), ('Centro del País', 'Vichada'), ('Centro del País', 'Guaviare'),
  ('Tolima Grande', 'Tolima'), ('Tolima Grande', 'Huila'), ('Tolima Grande', 'Caquetá'), ('Tolima Grande', 'Putumayo'),
  ('Tolima Grande', 'Amazonas'), ('Tolima Grande', 'Vaupés'),
  ('Sur Occidente', 'Valle del Cauca'), ('Sur Occidente', 'Cauca'), ('Sur Occidente', 'Nariño'),
  ('Eje Cafetero', 'Caldas'), ('Eje Cafetero', 'Risaralda'), ('Eje Cafetero', 'Quindío'),
  ('Santanderes', 'Santander'), ('Santanderes', 'Norte de Santander'), ('Santanderes', 'Arauca'),
  ('Córdoba, Sucre y Urabá', 'Córdoba'), ('Córdoba, Sucre y Urabá', 'Sucre')
) as z(zone, dep)
join (select distinct department from public.co_municipalities) d on public.normalize_text(d.department) = public.normalize_text(z.dep);

-- Excepciones por ciudad: el Urabá antioqueño y el norte del Chocó van con Córdoba y Sucre. La lista se puede
-- corregir en Configuración → Territorios.
insert into public.zone_places (zone, department, city)
select 'Córdoba, Sucre y Urabá', m.department, m.city
from public.co_municipalities m
where (m.department = 'Antioquia' and public.normalize_text(m.city) in (select public.normalize_text(x) from unnest(array[
        'Apartadó', 'Arboletes', 'Carepa', 'Chigorodó', 'Murindó', 'Mutatá', 'Necoclí', 'San Juan de Urabá', 'San Pedro de Urabá', 'Turbo', 'Vigía del Fuerte']) x))
   or (m.department = 'Chocó' and public.normalize_text(m.city) in (select public.normalize_text(x) from unnest(array[
        'Acandí', 'Unguía', 'Riosucio', 'Carmen del Darién']) x));

-- Zona de un lugar: la excepción de su ciudad si existe; si no, la de su departamento.
create function public.zone_for_place(p_department text, p_city text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select z.zone
  from public.zone_places z
  where public.normalize_text(z.department) = public.normalize_text(p_department)
    and (z.city is null or public.normalize_text(z.city) = public.normalize_text(p_city))
  order by (z.city is not null) desc
  limit 1;
$$;
revoke execute on function public.zone_for_place(text, text) from public, anon;
grant execute on function public.zone_for_place(text, text) to authenticated;

-- Territorios: lo que atiende cada asesor. Sin zona = todo el país; sin departamentos = toda la zona; sin países =
-- todo el exterior.
create table public.territories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  channels text[] not null check (cardinality(channels) > 0),
  market text not null check (market in ('Nacional', 'Internacional')),
  zone text,
  departments text[] not null default '{}',
  countries text[] not null default '{}',
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint territories_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade,
  constraint territories_created_by_fkey foreign key (created_by) references public.profiles (id) on delete set null,
  constraint territories_market_fields check (
    (market = 'Nacional' and cardinality(countries) = 0)
    or (market = 'Internacional' and zone is null and cardinality(departments) = 0))
);
comment on table public.territories is 'Qué canal, mercado y zona o países atiende cada asesor.';
create index territories_user_idx on public.territories (user_id);
alter table public.territories enable row level security;
-- Todos ven quién atiende qué (hace falta para sugerir el responsable); solo quien administra usuarios lo cambia.
create policy "territorios: ver" on public.territories for select to authenticated using (true);
create policy "territorios: gestionar" on public.territories for all to authenticated
  using (public.has_perm('system', 'manage_users')) with check (public.has_perm('system', 'manage_users'));

-- ¿Esta fila de territorio cubre un cliente con este canal, mercado, zona, departamento y país?
create function public.territory_matches(t public.territories, p_channel text, p_market text, p_zone text, p_department text, p_country text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_channel = any (t.channels)
     and t.market = coalesce(nullif(p_market, ''), 'Nacional')
     and case when t.market = 'Nacional' then
           (t.zone is null or t.zone = p_zone)
           and (cardinality(t.departments) = 0 or p_department = any (t.departments))
         else
           cardinality(t.countries) = 0 or p_country = any (t.countries)
         end;
$$;
revoke execute on function public.territory_matches(public.territories, text, text, text, text, text) from public, anon, authenticated;

-- Asesores a los que les corresponde un cliente, del más específico al más general.
create function public.territory_owners(p_channel text, p_market text, p_zone text, p_department text, p_country text)
returns table (user_id uuid, full_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.full_name
  from public.territories t
  join public.profiles u on u.id = t.user_id and u.is_active
  where public.territory_matches(t, p_channel, p_market, p_zone, p_department, p_country)
  group by u.id, u.full_name
  order by max(case when cardinality(t.departments) > 0 or cardinality(t.countries) > 0 then 2 when t.zone is not null then 1 else 0 end) desc, u.full_name;
$$;
revoke execute on function public.territory_owners(text, text, text, text, text) from public, anon;
grant execute on function public.territory_owners(text, text, text, text, text) to authenticated;

-- Zona automática y control de territorio en clientes y prospectos.
create function public.place_and_territory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb := to_jsonb(new);
  v_department text := coalesce(v ->> 'billing_state', v ->> 'state');
  v_city text := coalesce(v ->> 'billing_city', v ->> 'city');
  v_country text := coalesce(v ->> 'billing_country', v ->> 'country');
  v_old jsonb;
  v_changed boolean := tg_op = 'INSERT';
begin
  -- En el exterior la zona es el país; en Colombia, si viene vacía, sale del departamento y la ciudad.
  if new.market = 'Internacional' then
    new.zone := null;
  elsif new.zone is null and v_department is not null then
    new.zone := public.zone_for_place(v_department, v_city);
  end if;

  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_changed := new.owner_id is distinct from old.owner_id or new.industry is distinct from old.industry
      or new.market is distinct from old.market or new.zone is distinct from old.zone
      or v_department is distinct from coalesce(v_old ->> 'billing_state', v_old ->> 'state')
      or v_country is distinct from coalesce(v_old ->> 'billing_country', v_old ->> 'country');
  end if;

  -- El territorio se exige a quien trabaja con territorios y no tiene permiso para modificarlo todo: un asesor no crea
  -- ni se queda con clientes fuera de lo suyo. La dirección y la administración asignan sin restricción.
  if v_changed and auth.uid() is not null and new.owner_id is not null and new.industry is not null
     and not public.has_perm(tg_table_name, 'modify_all')
     and exists (select 1 from public.territories t where t.user_id = new.owner_id)
     and not exists (
       select 1 from public.territories t
       where t.user_id = new.owner_id and public.territory_matches(t, new.industry, new.market, new.zone, v_department, v_country)) then
    raise exception 'Este registro queda fuera del territorio de su responsable (% · % · %). Si le corresponde, pide a administración que lo agregue en Configuración → Territorios.',
      new.industry, coalesce(nullif(new.market, ''), 'Nacional'),
      coalesce(case when new.market = 'Internacional' then v_country else coalesce(new.zone, v_department) end, 'sin zona')
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function public.place_and_territory() from public, anon, authenticated;
create trigger accounts_place_and_territory before insert or update on public.accounts
  for each row execute function public.place_and_territory();
create trigger leads_place_and_territory before insert or update on public.leads
  for each row execute function public.place_and_territory();

-- Zona de los clientes y prospectos que ya existían.
update public.accounts set zone = public.zone_for_place(billing_state, billing_city)
where zone is null and billing_state is not null and market is distinct from 'Internacional';
update public.leads set zone = public.zone_for_place(state, city)
where zone is null and state is not null and market is distinct from 'Internacional';
