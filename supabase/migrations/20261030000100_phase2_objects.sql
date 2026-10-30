-- Firplak CRM · Fase 2: prospectos (con conversión), campañas, productos y listas de
-- precios, cotizaciones con líneas y casos de servicio. Modelo inspirado en los objetos
-- estándar documentados de Sales Cloud (Lead, Campaign, Product2, Pricebook2, Quote, Case).

-- ---------------------------------------------------------------------------
-- Campañas
-- ---------------------------------------------------------------------------
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  campaign_type text not null default 'Evento',
  status text not null default 'Planeada' check (status in ('Planeada', 'En curso', 'Completada', 'Cancelada')),
  start_date date,
  end_date date,
  budgeted_cost numeric(18, 2),
  actual_cost numeric(18, 2),
  expected_revenue numeric(18, 2),
  expected_response numeric(5, 2) check (expected_response is null or expected_response between 0 and 100),
  parent_id uuid,
  description text,
  is_active boolean not null default true,
  owner_id uuid,
  created_by uuid,
  custom_fields jsonb not null default '{}'::jsonb,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaigns_parent_id_fkey foreign key (parent_id) references public.campaigns (id) on delete set null,
  constraint campaigns_owner_id_fkey foreign key (owner_id) references public.profiles (id) on delete set null,
  constraint campaigns_created_by_fkey foreign key (created_by) references public.profiles (id) on delete set null,
  constraint campaigns_dates check (end_date is null or start_date is null or end_date >= start_date)
);
create index campaigns_owner_idx on public.campaigns (owner_id);
create trigger campaigns_updated_at before update on public.campaigns
  for each row execute function public.set_updated_at();
create trigger campaigns_owner before insert on public.campaigns
  for each row execute function public.set_record_owner();

-- ---------------------------------------------------------------------------
-- Prospectos (leads)
-- ---------------------------------------------------------------------------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  salutation text,
  first_name text,
  last_name text not null check (length(trim(last_name)) > 0),
  full_name text generated always as (trim(coalesce(first_name, '') || ' ' || last_name)) stored,
  company text not null check (length(trim(company)) > 0),
  title text,
  email text,
  phone text,
  mobile text,
  website text,
  industry text,
  lead_source text,
  status text not null default 'Nuevo'
    check (status in ('Nuevo', 'Contactado', 'Calificado', 'No calificado', 'Convertido')),
  rating text check (rating in ('Caliente', 'Templada', 'Fría')),
  annual_revenue numeric(18, 2),
  employees int,
  street text,
  city text,
  state text,
  country text default 'Colombia',
  description text,
  campaign_id uuid,
  is_converted boolean not null default false,
  converted_at timestamptz,
  converted_account_id uuid,
  converted_contact_id uuid,
  converted_opportunity_id uuid,
  owner_id uuid,
  created_by uuid,
  custom_fields jsonb not null default '{}'::jsonb,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_campaign_id_fkey foreign key (campaign_id) references public.campaigns (id) on delete set null,
  constraint leads_converted_account_id_fkey foreign key (converted_account_id) references public.accounts (id) on delete set null,
  constraint leads_converted_contact_id_fkey foreign key (converted_contact_id) references public.contacts (id) on delete set null,
  constraint leads_converted_opportunity_id_fkey foreign key (converted_opportunity_id) references public.opportunities (id) on delete set null,
  constraint leads_owner_id_fkey foreign key (owner_id) references public.profiles (id) on delete set null,
  constraint leads_created_by_fkey foreign key (created_by) references public.profiles (id) on delete set null
);
create index leads_owner_idx on public.leads (owner_id, status);
create index leads_company_idx on public.leads (lower(company));
create trigger leads_updated_at before update on public.leads
  for each row execute function public.set_updated_at();
create trigger leads_owner before insert on public.leads
  for each row execute function public.set_record_owner();

create table public.campaign_members (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  lead_id uuid,
  contact_id uuid,
  status text not null default 'Enviado' check (status in ('Enviado', 'Respondió', 'Asistió', 'No asistió')),
  has_responded boolean generated always as (status in ('Respondió', 'Asistió')) stored,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint campaign_members_campaign_id_fkey foreign key (campaign_id) references public.campaigns (id) on delete cascade,
  constraint campaign_members_lead_id_fkey foreign key (lead_id) references public.leads (id) on delete cascade,
  constraint campaign_members_contact_id_fkey foreign key (contact_id) references public.contacts (id) on delete cascade,
  constraint campaign_members_created_by_fkey foreign key (created_by) references public.profiles (id) on delete set null,
  constraint campaign_members_one_target check ((lead_id is null) <> (contact_id is null))
);
create unique index campaign_members_lead_uq on public.campaign_members (campaign_id, lead_id) where lead_id is not null;
create unique index campaign_members_contact_uq on public.campaign_members (campaign_id, contact_id) where contact_id is not null;

-- ---------------------------------------------------------------------------
-- Productos y listas de precios
-- ---------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  product_code text unique,
  family text,
  unit text not null default 'Unidad',
  description text,
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  custom_fields jsonb not null default '{}'::jsonb,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_created_by_fkey foreign key (created_by) references public.profiles (id) on delete set null
);
create index products_name_idx on public.products (lower(name));
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

create table public.price_books (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_standard boolean not null default false,
  is_active boolean not null default true,
  currency text not null default 'COP',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index price_books_single_standard on public.price_books (is_standard) where is_standard;
create trigger price_books_updated_at before update on public.price_books
  for each row execute function public.set_updated_at();

create table public.price_book_entries (
  id uuid primary key default gen_random_uuid(),
  price_book_id uuid not null,
  product_id uuid not null,
  unit_price numeric(18, 2) not null check (unit_price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint price_book_entries_price_book_id_fkey foreign key (price_book_id) references public.price_books (id) on delete cascade,
  constraint price_book_entries_product_id_fkey foreign key (product_id) references public.products (id) on delete cascade,
  unique (price_book_id, product_id)
);
create trigger price_book_entries_updated_at before update on public.price_book_entries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Oportunidades: campaña de origen y lista de precios
-- ---------------------------------------------------------------------------
alter table public.opportunities
  add column campaign_id uuid,
  add column price_book_id uuid,
  add constraint opportunities_campaign_id_fkey foreign key (campaign_id) references public.campaigns (id) on delete set null,
  add constraint opportunities_price_book_id_fkey foreign key (price_book_id) references public.price_books (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Cotizaciones
-- ---------------------------------------------------------------------------
create sequence public.quote_number_seq start 1001;

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  quote_number text not null unique default ('COT-' || nextval('public.quote_number_seq')::text),
  name text not null check (length(trim(name)) > 0),
  opportunity_id uuid not null,
  account_id uuid,
  contact_id uuid,
  price_book_id uuid,
  status text not null default 'Borrador'
    check (status in ('Borrador', 'En revisión', 'Presentada', 'Aceptada', 'Rechazada')),
  expiration_date date default (current_date + 30),
  subtotal numeric(18, 2) not null default 0,
  discount_total numeric(18, 2) not null default 0,
  net_total numeric(18, 2) not null default 0,
  tax_rate numeric(5, 2) not null default 19 check (tax_rate between 0 and 100),
  tax numeric(18, 2) not null default 0,
  shipping numeric(18, 2) not null default 0 check (shipping >= 0),
  grand_total numeric(18, 2) not null default 0,
  is_synced boolean not null default false,
  bill_to_name text,
  billing_address text,
  shipping_address text,
  payment_terms text,
  delivery_terms text,
  description text,
  owner_id uuid,
  created_by uuid,
  custom_fields jsonb not null default '{}'::jsonb,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quotes_opportunity_id_fkey foreign key (opportunity_id) references public.opportunities (id) on delete cascade,
  constraint quotes_account_id_fkey foreign key (account_id) references public.accounts (id) on delete set null,
  constraint quotes_contact_id_fkey foreign key (contact_id) references public.contacts (id) on delete set null,
  constraint quotes_price_book_id_fkey foreign key (price_book_id) references public.price_books (id) on delete set null,
  constraint quotes_owner_id_fkey foreign key (owner_id) references public.profiles (id) on delete set null,
  constraint quotes_created_by_fkey foreign key (created_by) references public.profiles (id) on delete set null
);
create index quotes_opportunity_idx on public.quotes (opportunity_id);
create index quotes_owner_idx on public.quotes (owner_id);
create trigger quotes_updated_at before update on public.quotes
  for each row execute function public.set_updated_at();
create trigger quotes_owner before insert on public.quotes
  for each row execute function public.set_record_owner();

create table public.quote_line_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null,
  product_id uuid,
  description text,
  quantity numeric(12, 2) not null default 1 check (quantity > 0),
  unit_price numeric(18, 2) not null default 0 check (unit_price >= 0),
  discount numeric(5, 2) not null default 0 check (discount between 0 and 100),
  line_total numeric(18, 2) generated always as (round(quantity * unit_price * (1 - discount / 100.0), 2)) stored,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint quote_line_items_quote_id_fkey foreign key (quote_id) references public.quotes (id) on delete cascade,
  constraint quote_line_items_product_id_fkey foreign key (product_id) references public.products (id) on delete set null
);
create index quote_line_items_quote_idx on public.quote_line_items (quote_id, sort_order);

-- Cuenta, contacto y lista de precios por defecto desde la oportunidad.
create or replace function public.quote_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_opp public.opportunities%rowtype;
begin
  select * into v_opp from public.opportunities where id = new.opportunity_id;
  if new.account_id is null then new.account_id := v_opp.account_id; end if;
  if new.contact_id is null then new.contact_id := v_opp.contact_id; end if;
  if new.price_book_id is null then
    new.price_book_id := coalesce(v_opp.price_book_id, (select id from public.price_books where is_standard limit 1));
  end if;
  if new.bill_to_name is null and new.account_id is not null then
    select name into new.bill_to_name from public.accounts where id = new.account_id;
  end if;
  if tg_op = 'UPDATE' and (new.tax_rate is distinct from old.tax_rate or new.shipping is distinct from old.shipping) then
    new.tax := round(new.net_total * new.tax_rate / 100.0, 2);
    new.grand_total := new.net_total + new.tax + new.shipping;
  end if;
  return new;
end;
$$;
create trigger quotes_defaults before insert or update on public.quotes
  for each row execute function public.quote_defaults();

-- Recalcula totales; si la cotización está sincronizada, el valor de la oportunidad
-- pasa a ser el total neto (sin IVA), como la sincronización de cotizaciones.
create or replace function public.recalc_quote(p_quote uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub numeric;
  v_net numeric;
  v_quote public.quotes%rowtype;
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
    where q.id = p_quote
    returning * into v_quote;
  if v_quote.is_synced then
    update public.opportunities set amount = v_quote.net_total where id = v_quote.opportunity_id;
  end if;
end;
$$;
revoke execute on function public.recalc_quote(uuid) from public, anon, authenticated;

create or replace function public.quote_lines_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.recalc_quote(coalesce(new.quote_id, old.quote_id));
  return null;
end;
$$;
create trigger quote_line_items_recalc
  after insert or update or delete on public.quote_line_items
  for each row execute function public.quote_lines_changed();

-- Sincroniza una cotización con su oportunidad (solo una sincronizada por oportunidad).
create or replace function public.sync_quote(p_quote uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_opp uuid;
  v_net numeric;
begin
  select opportunity_id, net_total into v_opp, v_net from public.quotes where id = p_quote;
  if v_opp is null then
    raise exception 'Cotización no encontrada';
  end if;
  update public.quotes set is_synced = false where opportunity_id = v_opp and id <> p_quote and is_synced;
  update public.quotes set is_synced = true where id = p_quote;
  update public.opportunities set amount = v_net where id = v_opp;
  if not found then
    raise exception 'No tienes permiso para actualizar la oportunidad' using errcode = '42501';
  end if;
end;
$$;
grant execute on function public.sync_quote(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Casos de servicio
-- ---------------------------------------------------------------------------
create sequence public.case_number_seq start 1001;

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  case_number text not null unique default ('CS-' || nextval('public.case_number_seq')::text),
  subject text not null check (length(trim(subject)) > 0),
  description text,
  status text not null default 'Nuevo' check (status in ('Nuevo', 'En proceso', 'En espera', 'Escalado', 'Cerrado')),
  priority text not null default 'Media' check (priority in ('Alta', 'Media', 'Baja')),
  origin text,
  case_type text,
  reason text,
  account_id uuid,
  contact_id uuid,
  product_id uuid,
  is_closed boolean not null default false,
  closed_at timestamptz,
  resolution text,
  owner_id uuid,
  created_by uuid,
  custom_fields jsonb not null default '{}'::jsonb,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cases_account_id_fkey foreign key (account_id) references public.accounts (id) on delete set null,
  constraint cases_contact_id_fkey foreign key (contact_id) references public.contacts (id) on delete set null,
  constraint cases_product_id_fkey foreign key (product_id) references public.products (id) on delete set null,
  constraint cases_owner_id_fkey foreign key (owner_id) references public.profiles (id) on delete set null,
  constraint cases_created_by_fkey foreign key (created_by) references public.profiles (id) on delete set null
);
create index cases_owner_idx on public.cases (owner_id, status);
create index cases_account_idx on public.cases (account_id);
create trigger cases_updated_at before update on public.cases
  for each row execute function public.set_updated_at();
create trigger cases_owner before insert on public.cases
  for each row execute function public.set_record_owner();

create or replace function public.case_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.account_id is null and new.contact_id is not null then
    select account_id into new.account_id from public.contacts where id = new.contact_id;
  end if;
  new.is_closed := new.status = 'Cerrado';
  if new.is_closed then
    new.closed_at := coalesce(new.closed_at, now());
  else
    new.closed_at := null;
  end if;
  return new;
end;
$$;
create trigger cases_defaults before insert or update on public.cases
  for each row execute function public.case_defaults();

-- ---------------------------------------------------------------------------
-- Actividades sobre prospectos y casos
-- ---------------------------------------------------------------------------
alter table public.activities
  add column lead_id uuid,
  add column case_id uuid,
  add constraint activities_lead_id_fkey foreign key (lead_id) references public.leads (id) on delete cascade,
  add constraint activities_case_id_fkey foreign key (case_id) references public.cases (id) on delete cascade;
create index activities_lead_idx on public.activities (lead_id);
create index activities_case_idx on public.activities (case_id);

create or replace function public.activity_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.account_id is null and new.opportunity_id is not null then
    select account_id into new.account_id from public.opportunities where id = new.opportunity_id;
  end if;
  if new.account_id is null and new.case_id is not null then
    select account_id, coalesce(new.contact_id, contact_id) into new.account_id, new.contact_id
      from public.cases where id = new.case_id;
  end if;
  if new.account_id is null and new.contact_id is not null then
    select account_id into new.account_id from public.contacts where id = new.contact_id;
  end if;
  if new.activity_type in ('note', 'email') and tg_op = 'INSERT' and new.status = 'pending' then
    new.status := 'completed';
  end if;
  if new.status = 'completed' and new.completed_at is null then
    new.completed_at := now();
  elsif new.status <> 'completed' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

drop policy "actividades: ver" on public.activities;
create policy "actividades: ver" on public.activities
  for select to authenticated
  using (
    public.can_read_record('activities', owner_id)
    or (public.has_perm('activities', 'read') and (
      case
        when opportunity_id is not null then
          exists (select 1 from public.opportunities o where o.id = opportunity_id)
        when case_id is not null then
          exists (select 1 from public.cases c where c.id = case_id)
        when lead_id is not null then
          exists (select 1 from public.leads l where l.id = lead_id)
        else
          (account_id is not null and exists (select 1 from public.accounts a where a.id = account_id))
          or (contact_id is not null and exists (select 1 from public.contacts c where c.id = contact_id))
      end
    ))
  );

-- ---------------------------------------------------------------------------
-- Conversión de prospectos: crea (o reutiliza) cuenta, crea contacto y, si se pide,
-- oportunidad. Se ejecuta con los permisos del usuario (RLS aplica a cada paso).
-- ---------------------------------------------------------------------------
create or replace function public.convert_lead(
  p_lead uuid,
  p_account_id uuid default null,
  p_account_name text default null,
  p_create_opportunity boolean default true,
  p_opportunity_name text default null,
  p_stage_id uuid default null,
  p_amount numeric default 0,
  p_close_date date default null,
  p_owner uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lead public.leads%rowtype;
  v_account uuid := p_account_id;
  v_contact uuid;
  v_opp uuid;
  v_stage uuid := p_stage_id;
  v_owner uuid;
begin
  select * into v_lead from public.leads where id = p_lead for update;
  if not found then
    raise exception 'El prospecto no existe o no tienes acceso';
  end if;
  if v_lead.is_converted then
    raise exception 'El prospecto ya fue convertido';
  end if;
  v_owner := coalesce(p_owner, v_lead.owner_id, auth.uid());

  if v_account is null then
    insert into public.accounts (name, account_type, industry, phone, website, billing_street, billing_city,
                                 billing_state, billing_country, annual_revenue, employees, rating, description, owner_id)
    values (coalesce(nullif(trim(p_account_name), ''), v_lead.company), 'Cliente', v_lead.industry, v_lead.phone,
            v_lead.website, v_lead.street, v_lead.city, v_lead.state, v_lead.country, v_lead.annual_revenue,
            v_lead.employees, v_lead.rating, v_lead.description, v_owner)
    returning id into v_account;
  end if;

  insert into public.contacts (account_id, salutation, first_name, last_name, title, email, phone, mobile,
                               lead_source, mailing_street, mailing_city, mailing_state, mailing_country, owner_id)
  values (v_account, v_lead.salutation, v_lead.first_name, v_lead.last_name, v_lead.title, v_lead.email,
          v_lead.phone, v_lead.mobile, v_lead.lead_source, v_lead.street, v_lead.city, v_lead.state,
          v_lead.country, v_owner)
  returning id into v_contact;

  if p_create_opportunity then
    if v_stage is null then
      select s.id into v_stage
      from public.pipeline_stages s
      join public.pipelines p on p.id = s.pipeline_id
      where p.is_default and s.category = 'open'
      order by s.sort_order limit 1;
    end if;
    insert into public.opportunities (name, account_id, contact_id, pipeline_id, stage_id, amount, close_date,
                                      lead_source, campaign_id, opportunity_type, owner_id)
    values (coalesce(nullif(trim(p_opportunity_name), ''), v_lead.company || ' · Nueva oportunidad'), v_account,
            v_contact, (select pipeline_id from public.pipeline_stages where id = v_stage), v_stage,
            coalesce(p_amount, 0), coalesce(p_close_date, current_date + 30), v_lead.lead_source,
            v_lead.campaign_id, 'Nuevo negocio', v_owner)
    returning id into v_opp;
  end if;

  update public.leads
     set status = 'Convertido', is_converted = true, converted_at = now(),
         converted_account_id = v_account, converted_contact_id = v_contact, converted_opportunity_id = v_opp
   where id = p_lead;

  -- Las actividades y campañas del prospecto pasan al nuevo contacto.
  update public.activities
     set contact_id = v_contact, account_id = v_account, opportunity_id = coalesce(opportunity_id, v_opp)
   where lead_id = p_lead;
  update public.campaign_members cm
     set contact_id = v_contact, lead_id = null
   where cm.lead_id = p_lead
     and not exists (select 1 from public.campaign_members x where x.campaign_id = cm.campaign_id and x.contact_id = v_contact);

  return jsonb_build_object('account_id', v_account, 'contact_id', v_contact, 'opportunity_id', v_opp);
end;
$$;
grant execute on function public.convert_lead(uuid, uuid, text, boolean, text, uuid, numeric, date, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Campos personalizados y vistas para los nuevos objetos
-- ---------------------------------------------------------------------------
alter table public.custom_field_definitions drop constraint custom_field_definitions_object_check;
alter table public.custom_field_definitions add constraint custom_field_definitions_object_check
  check (object in ('accounts', 'contacts', 'opportunities', 'activities', 'leads', 'products', 'quotes', 'cases', 'campaigns'));
alter table public.list_views drop constraint list_views_object_check;
alter table public.list_views add constraint list_views_object_check
  check (object in ('accounts', 'contacts', 'opportunities', 'activities', 'leads', 'products', 'quotes', 'cases', 'campaigns'));

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.campaigns enable row level security;
alter table public.leads enable row level security;
alter table public.campaign_members enable row level security;
alter table public.products enable row level security;
alter table public.price_books enable row level security;
alter table public.price_book_entries enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_line_items enable row level security;
alter table public.cases enable row level security;

-- Objetos con propietario: mismas reglas que la Fase 1.
create policy "campañas: ver" on public.campaigns for select to authenticated using (public.can_read_record('campaigns', owner_id));
create policy "campañas: crear" on public.campaigns for insert to authenticated with check (public.has_perm('campaigns', 'create'));
create policy "campañas: editar" on public.campaigns for update to authenticated
  using (public.can_edit_record('campaigns', owner_id)) with check (public.has_perm('campaigns', 'edit'));
create policy "campañas: eliminar" on public.campaigns for delete to authenticated using (public.can_delete_record('campaigns', owner_id));

create policy "prospectos: ver" on public.leads for select to authenticated using (public.can_read_record('leads', owner_id));
create policy "prospectos: crear" on public.leads for insert to authenticated with check (public.has_perm('leads', 'create'));
create policy "prospectos: editar" on public.leads for update to authenticated
  using (public.can_edit_record('leads', owner_id)) with check (public.has_perm('leads', 'edit'));
create policy "prospectos: eliminar" on public.leads for delete to authenticated using (public.can_delete_record('leads', owner_id));

create policy "cotizaciones: ver" on public.quotes for select to authenticated using (public.can_read_record('quotes', owner_id));
create policy "cotizaciones: crear" on public.quotes for insert to authenticated with check (public.has_perm('quotes', 'create'));
create policy "cotizaciones: editar" on public.quotes for update to authenticated
  using (public.can_edit_record('quotes', owner_id)) with check (public.has_perm('quotes', 'edit'));
create policy "cotizaciones: eliminar" on public.quotes for delete to authenticated using (public.can_delete_record('quotes', owner_id));

create policy "casos: ver" on public.cases for select to authenticated using (public.can_read_record('cases', owner_id));
create policy "casos: crear" on public.cases for insert to authenticated with check (public.has_perm('cases', 'create'));
create policy "casos: editar" on public.cases for update to authenticated
  using (public.can_edit_record('cases', owner_id)) with check (public.has_perm('cases', 'edit'));
create policy "casos: eliminar" on public.cases for delete to authenticated using (public.can_delete_record('cases', owner_id));

-- Miembros de campaña: los gestiona quien puede editar la campaña.
create policy "miembros: ver" on public.campaign_members for select to authenticated
  using (exists (select 1 from public.campaigns c where c.id = campaign_id));
create policy "miembros: gestionar" on public.campaign_members for all to authenticated
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and public.can_edit_record('campaigns', c.owner_id)))
  with check (exists (select 1 from public.campaigns c where c.id = campaign_id and public.can_edit_record('campaigns', c.owner_id)));

-- Líneas de cotización: siguen a la cotización.
create policy "líneas: ver" on public.quote_line_items for select to authenticated
  using (exists (select 1 from public.quotes q where q.id = quote_id));
create policy "líneas: gestionar" on public.quote_line_items for all to authenticated
  using (exists (select 1 from public.quotes q where q.id = quote_id and public.can_edit_record('quotes', q.owner_id)))
  with check (exists (select 1 from public.quotes q where q.id = quote_id and public.can_edit_record('quotes', q.owner_id)));

-- Catálogo: público para quien lee productos; lo gestiona quien tiene permisos de productos.
create policy "productos: ver" on public.products for select to authenticated using (public.has_perm('products', 'read'));
create policy "productos: crear" on public.products for insert to authenticated with check (public.has_perm('products', 'create'));
create policy "productos: editar" on public.products for update to authenticated
  using (public.has_perm('products', 'edit')) with check (public.has_perm('products', 'edit'));
create policy "productos: eliminar" on public.products for delete to authenticated using (public.has_perm('products', 'delete'));

create policy "listas de precios: ver" on public.price_books for select to authenticated using (public.has_perm('products', 'read'));
create policy "listas de precios: gestionar" on public.price_books for all to authenticated
  using (public.has_perm('products', 'edit')) with check (public.has_perm('products', 'edit'));

create policy "precios: ver" on public.price_book_entries for select to authenticated using (public.has_perm('products', 'read'));
create policy "precios: gestionar" on public.price_book_entries for all to authenticated
  using (public.has_perm('products', 'edit')) with check (public.has_perm('products', 'edit'));

-- ---------------------------------------------------------------------------
-- Registros demo de la Fase 2 para el primer usuario
-- ---------------------------------------------------------------------------
create or replace function public.claim_demo_records(p_owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.accounts set owner_id = p_owner, created_by = p_owner where is_demo and owner_id is null;
  update public.contacts set owner_id = p_owner, created_by = p_owner where is_demo and owner_id is null;
  update public.opportunities set owner_id = p_owner, created_by = p_owner where is_demo and owner_id is null;
  update public.activities set owner_id = p_owner, created_by = p_owner where is_demo and owner_id is null;
  update public.campaigns set owner_id = p_owner, created_by = p_owner where is_demo and owner_id is null;
  update public.leads set owner_id = p_owner, created_by = p_owner where is_demo and owner_id is null;
  update public.quotes set owner_id = p_owner, created_by = p_owner where is_demo and owner_id is null;
  update public.cases set owner_id = p_owner, created_by = p_owner where is_demo and owner_id is null;
end;
$$;
revoke execute on function public.claim_demo_records(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Búsqueda global ampliada
-- ---------------------------------------------------------------------------
create or replace function public.global_search(p_query text, p_limit int default 8)
returns table (object text, id uuid, title text, subtitle text)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (select '%' || replace(replace(trim(p_query), '%', ''), '_', '') || '%' as pattern)
  (select 'accounts'::text, a.id, a.name, concat_ws(' · ', a.account_type, a.billing_city)
     from public.accounts a, q
     where a.name ilike q.pattern or a.tax_id ilike q.pattern or a.account_number ilike q.pattern
     order by a.name limit p_limit)
  union all
  (select 'contacts'::text, c.id, c.full_name, concat_ws(' · ', c.title, c.email)
     from public.contacts c, q
     where c.full_name ilike q.pattern or c.email ilike q.pattern or c.phone ilike q.pattern or c.mobile ilike q.pattern
     order by c.full_name limit p_limit)
  union all
  (select 'leads'::text, l.id, l.full_name, concat_ws(' · ', l.company, l.status)
     from public.leads l, q
     where (l.full_name ilike q.pattern or l.company ilike q.pattern or l.email ilike q.pattern) and not l.is_converted
     order by l.full_name limit p_limit)
  union all
  (select 'opportunities'::text, o.id, o.name, concat_ws(' · ', s.name, o.close_date::text)
     from public.opportunities o
     join public.pipeline_stages s on s.id = o.stage_id, q
     where o.name ilike q.pattern
     order by o.close_date limit p_limit)
  union all
  (select 'quotes'::text, x.id, x.name, concat_ws(' · ', x.quote_number, x.status)
     from public.quotes x, q
     where x.name ilike q.pattern or x.quote_number ilike q.pattern
     order by x.created_at desc limit p_limit)
  union all
  (select 'cases'::text, c.id, c.subject, concat_ws(' · ', c.case_number, c.status)
     from public.cases c, q
     where c.subject ilike q.pattern or c.case_number ilike q.pattern
     order by c.created_at desc limit p_limit)
  union all
  (select 'products'::text, p.id, p.name, concat_ws(' · ', p.product_code, p.family)
     from public.products p, q
     where p.name ilike q.pattern or p.product_code ilike q.pattern
     order by p.name limit p_limit);
$$;

-- ---------------------------------------------------------------------------
-- Indicadores de prospectos, servicio y campañas (security invoker)
-- ---------------------------------------------------------------------------
create or replace function public.crm_dashboard_extra(p_from date, p_to date, p_owner uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with
  l as (select * from public.leads where p_owner is null or owner_id = p_owner),
  c as (select * from public.cases where p_owner is null or owner_id = p_owner),
  qt as (select * from public.quotes where p_owner is null or owner_id = p_owner)
  select jsonb_build_object(
    'leads_new', (select count(*) from l where created_at::date between p_from and p_to),
    'leads_converted', (select count(*) from l where is_converted and converted_at::date between p_from and p_to),
    'leads_open', (select count(*) from l where not is_converted and status <> 'No calificado'),
    'lead_conversion_rate', (
      select case when count(*) = 0 then null
                  else round(count(*) filter (where is_converted) * 100.0 / count(*), 1) end
      from l where created_at::date between p_from and p_to),
    'leads_by_status', coalesce((select jsonb_agg(row_to_json(s)) from (
        select status, count(*) as count from l group by status order by count(*) desc) s), '[]'::jsonb),
    'cases_open', (select count(*) from c where not is_closed),
    'cases_high', (select count(*) from c where not is_closed and priority = 'Alta'),
    'cases_closed', (select count(*) from c where is_closed and closed_at::date between p_from and p_to),
    'avg_resolution_days', (select round(avg(extract(epoch from (closed_at - created_at)) / 86400)::numeric, 1)
                             from c where is_closed and closed_at::date between p_from and p_to),
    'quotes_open', (select count(*) from qt where status in ('Borrador', 'En revisión', 'Presentada')),
    'quotes_open_amount', coalesce((select sum(net_total) from qt where status in ('Borrador', 'En revisión', 'Presentada')), 0),
    'quotes_accepted', (select count(*) from qt where status = 'Aceptada' and updated_at::date between p_from and p_to)
  );
$$;
grant execute on function public.crm_dashboard_extra(date, date, uuid) to authenticated;
