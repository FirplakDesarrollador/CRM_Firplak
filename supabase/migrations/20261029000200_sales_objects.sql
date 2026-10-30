-- Firplak CRM · Objetos comerciales: configuración (pipelines, etapas, campos
-- personalizados, vistas de lista) y registros (cuentas, contactos, oportunidades,
-- actividades) con sus políticas RLS.

-- ---------------------------------------------------------------------------
-- Configuración
-- ---------------------------------------------------------------------------
create table public.pipelines (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index pipelines_single_default on public.pipelines (is_default) where is_default;
create trigger pipelines_updated_at before update on public.pipelines
  for each row execute function public.set_updated_at();

create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references public.pipelines (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  probability int not null default 0 check (probability between 0 and 100),
  category text not null default 'open' check (category in ('open', 'won', 'lost')),
  forecast_category text not null default 'pipeline'
    check (forecast_category in ('pipeline', 'best_case', 'commit', 'closed', 'omitted')),
  color text not null default '#4a7693',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pipeline_id, name)
);
create index pipeline_stages_pipeline_idx on public.pipeline_stages (pipeline_id, sort_order);
create trigger pipeline_stages_updated_at before update on public.pipeline_stages
  for each row execute function public.set_updated_at();

-- Campos personalizados por objeto. Los valores se guardan en la columna jsonb
-- custom_fields del registro, con la clave api_name.
create table public.custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  object text not null check (object in ('accounts', 'contacts', 'opportunities', 'activities')),
  api_name text not null check (api_name ~ '^[a-z][a-z0-9_]{1,40}$'),
  label text not null,
  field_type text not null check (field_type in (
    'text', 'textarea', 'number', 'currency', 'percent', 'date', 'checkbox',
    'select', 'multiselect', 'email', 'phone', 'url'
  )),
  options jsonb not null default '[]'::jsonb,
  is_required boolean not null default false,
  show_in_list boolean not null default false,
  help_text text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (object, api_name)
);
create trigger custom_field_definitions_updated_at before update on public.custom_field_definitions
  for each row execute function public.set_updated_at();

-- Vistas de lista guardadas: filtros, columnas y orden por usuario (o compartidas).
-- definition = {"filters":[{"field":"type","op":"eq","value":"Cliente"}],
--               "columns":["name","type","city"], "sort":{"field":"name","dir":"asc"},
--               "scope":"mine|all"}
create table public.list_views (
  id uuid primary key default gen_random_uuid(),
  object text not null check (object in ('accounts', 'contacts', 'opportunities', 'activities')),
  name text not null,
  owner_id uuid references public.profiles (id) on delete cascade,
  is_shared boolean not null default false,
  is_pinned boolean not null default false,
  definition jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index list_views_object_owner_idx on public.list_views (object, owner_id);
create trigger list_views_updated_at before update on public.list_views
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Cuentas
-- ---------------------------------------------------------------------------
create sequence public.account_number_seq start 1001;

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  account_number text not null unique default ('CU-' || nextval('public.account_number_seq')::text),
  name text not null check (length(trim(name)) > 0),
  account_type text not null default 'Prospecto',
  industry text,
  segment text,
  tax_id text,
  phone text,
  email text,
  website text,
  rating text check (rating in ('Caliente', 'Templada', 'Fría')),
  annual_revenue numeric(18, 2),
  employees int,
  billing_street text,
  billing_city text,
  billing_state text,
  billing_country text default 'Colombia',
  shipping_street text,
  shipping_city text,
  shipping_state text,
  shipping_country text,
  description text,
  parent_account_id uuid,
  owner_id uuid,
  created_by uuid,
  custom_fields jsonb not null default '{}'::jsonb,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_parent_account_id_fkey foreign key (parent_account_id)
    references public.accounts (id) on delete set null,
  constraint accounts_owner_id_fkey foreign key (owner_id)
    references public.profiles (id) on delete set null,
  constraint accounts_created_by_fkey foreign key (created_by)
    references public.profiles (id) on delete set null
);
create index accounts_owner_idx on public.accounts (owner_id);
create index accounts_name_idx on public.accounts (lower(name));
create index accounts_parent_idx on public.accounts (parent_account_id);
create trigger accounts_updated_at before update on public.accounts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Contactos
-- ---------------------------------------------------------------------------
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid,
  salutation text,
  first_name text,
  last_name text not null check (length(trim(last_name)) > 0),
  full_name text generated always as (trim(coalesce(first_name, '') || ' ' || last_name)) stored,
  title text,
  department text,
  email text,
  phone text,
  mobile text,
  lead_source text,
  birthdate date,
  mailing_street text,
  mailing_city text,
  mailing_state text,
  mailing_country text default 'Colombia',
  reports_to_id uuid,
  do_not_call boolean not null default false,
  email_opt_out boolean not null default false,
  description text,
  owner_id uuid,
  created_by uuid,
  custom_fields jsonb not null default '{}'::jsonb,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contacts_account_id_fkey foreign key (account_id)
    references public.accounts (id) on delete set null,
  constraint contacts_reports_to_id_fkey foreign key (reports_to_id)
    references public.contacts (id) on delete set null,
  constraint contacts_owner_id_fkey foreign key (owner_id)
    references public.profiles (id) on delete set null,
  constraint contacts_created_by_fkey foreign key (created_by)
    references public.profiles (id) on delete set null
);
create index contacts_account_idx on public.contacts (account_id);
create index contacts_owner_idx on public.contacts (owner_id);
create index contacts_name_idx on public.contacts (lower(last_name), lower(first_name));
create trigger contacts_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Oportunidades
-- ---------------------------------------------------------------------------
create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  account_id uuid,
  contact_id uuid,
  pipeline_id uuid not null,
  stage_id uuid not null,
  amount numeric(18, 2) not null default 0 check (amount >= 0),
  currency text not null default 'COP',
  probability int not null default 0 check (probability between 0 and 100),
  expected_revenue numeric(18, 2) generated always as (round(amount * probability / 100.0, 2)) stored,
  close_date date not null default (current_date + 30),
  opportunity_type text,
  lead_source text,
  forecast_category text not null default 'pipeline'
    check (forecast_category in ('pipeline', 'best_case', 'commit', 'closed', 'omitted')),
  next_step text,
  loss_reason text,
  description text,
  is_closed boolean not null default false,
  is_won boolean not null default false,
  closed_at timestamptz,
  stage_changed_at timestamptz not null default now(),
  owner_id uuid,
  created_by uuid,
  custom_fields jsonb not null default '{}'::jsonb,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opportunities_account_id_fkey foreign key (account_id)
    references public.accounts (id) on delete set null,
  constraint opportunities_contact_id_fkey foreign key (contact_id)
    references public.contacts (id) on delete set null,
  constraint opportunities_pipeline_id_fkey foreign key (pipeline_id)
    references public.pipelines (id) on delete restrict,
  constraint opportunities_stage_id_fkey foreign key (stage_id)
    references public.pipeline_stages (id) on delete restrict,
  constraint opportunities_owner_id_fkey foreign key (owner_id)
    references public.profiles (id) on delete set null,
  constraint opportunities_created_by_fkey foreign key (created_by)
    references public.profiles (id) on delete set null
);
create index opportunities_account_idx on public.opportunities (account_id);
create index opportunities_owner_idx on public.opportunities (owner_id);
create index opportunities_stage_idx on public.opportunities (stage_id);
create index opportunities_close_date_idx on public.opportunities (close_date);
create trigger opportunities_updated_at before update on public.opportunities
  for each row execute function public.set_updated_at();

create table public.opportunity_stage_history (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  from_stage_id uuid references public.pipeline_stages (id) on delete set null,
  to_stage_id uuid references public.pipeline_stages (id) on delete set null,
  amount numeric(18, 2),
  probability int,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);
create index opportunity_stage_history_opp_idx on public.opportunity_stage_history (opportunity_id, changed_at);

-- Sincroniza probabilidad, cierre y pronóstico con la etapa elegida.
create or replace function public.opportunity_sync_stage()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_stage public.pipeline_stages%rowtype;
begin
  select * into v_stage from public.pipeline_stages where id = new.stage_id;
  if not found then
    raise exception 'La etapa indicada no existe';
  end if;

  if tg_op = 'INSERT' and new.pipeline_id is null then
    new.pipeline_id := v_stage.pipeline_id;
  end if;
  if v_stage.pipeline_id <> new.pipeline_id then
    raise exception 'La etapa "%" no pertenece al pipeline de la oportunidad', v_stage.name;
  end if;

  if tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id then
    new.probability := v_stage.probability;
    new.forecast_category := v_stage.forecast_category;
    new.is_closed := v_stage.category <> 'open';
    new.is_won := v_stage.category = 'won';
    new.closed_at := case when v_stage.category <> 'open' then coalesce(new.closed_at, now()) end;
    new.stage_changed_at := now();
    if v_stage.category = 'won' and tg_op = 'UPDATE' and new.close_date > current_date then
      new.close_date := current_date;
    end if;
  end if;

  return new;
end;
$$;

create trigger opportunities_sync_stage
  before insert or update of stage_id, pipeline_id on public.opportunities
  for each row execute function public.opportunity_sync_stage();

create or replace function public.opportunity_log_stage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id then
    insert into public.opportunity_stage_history
      (opportunity_id, from_stage_id, to_stage_id, amount, probability, changed_by)
    values (
      new.id,
      case when tg_op = 'UPDATE' then old.stage_id end,
      new.stage_id,
      new.amount,
      new.probability,
      auth.uid()
    );
  end if;
  return null;
end;
$$;

create trigger opportunities_log_stage
  after insert or update of stage_id on public.opportunities
  for each row execute function public.opportunity_log_stage();

-- ---------------------------------------------------------------------------
-- Actividades comerciales: tareas, llamadas, reuniones, correos y notas.
-- ---------------------------------------------------------------------------
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  activity_type text not null check (activity_type in ('task', 'call', 'meeting', 'email', 'note')),
  subject text not null check (length(trim(subject)) > 0),
  description text,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'cancelled')),
  priority text not null default 'normal' check (priority in ('high', 'normal', 'low')),
  due_date date,
  start_at timestamptz,
  end_at timestamptz,
  location text,
  call_result text,
  duration_minutes int check (duration_minutes is null or duration_minutes >= 0),
  account_id uuid,
  contact_id uuid,
  opportunity_id uuid,
  owner_id uuid,
  created_by uuid,
  completed_at timestamptz,
  custom_fields jsonb not null default '{}'::jsonb,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activities_account_id_fkey foreign key (account_id)
    references public.accounts (id) on delete cascade,
  constraint activities_contact_id_fkey foreign key (contact_id)
    references public.contacts (id) on delete cascade,
  constraint activities_opportunity_id_fkey foreign key (opportunity_id)
    references public.opportunities (id) on delete cascade,
  constraint activities_owner_id_fkey foreign key (owner_id)
    references public.profiles (id) on delete set null,
  constraint activities_created_by_fkey foreign key (created_by)
    references public.profiles (id) on delete set null,
  constraint activities_meeting_range check (end_at is null or start_at is null or end_at >= start_at)
);
create index activities_owner_idx on public.activities (owner_id, status, due_date);
create index activities_account_idx on public.activities (account_id);
create index activities_contact_idx on public.activities (contact_id);
create index activities_opportunity_idx on public.activities (opportunity_id);
create index activities_start_idx on public.activities (start_at);
create trigger activities_updated_at before update on public.activities
  for each row execute function public.set_updated_at();

-- Completa los datos derivados: cuenta del contacto/oportunidad y fecha de cierre.
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

create trigger activities_defaults
  before insert or update on public.activities
  for each row execute function public.activity_defaults();

-- Propietario y creador por defecto = usuario actual.
create or replace function public.set_record_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id is null then
    new.owner_id := auth.uid();
  end if;
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger accounts_owner before insert on public.accounts
  for each row execute function public.set_record_owner();
create trigger contacts_owner before insert on public.contacts
  for each row execute function public.set_record_owner();
create trigger opportunities_owner before insert on public.opportunities
  for each row execute function public.set_record_owner();
create trigger activities_owner before insert on public.activities
  for each row execute function public.set_record_owner();

-- ---------------------------------------------------------------------------
-- RLS de configuración
-- ---------------------------------------------------------------------------
alter table public.pipelines enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.custom_field_definitions enable row level security;
alter table public.list_views enable row level security;

create policy "pipelines: lectura" on public.pipelines
  for select to authenticated using (true);
create policy "pipelines: personalización" on public.pipelines
  for all to authenticated
  using (public.has_perm('system', 'customize'))
  with check (public.has_perm('system', 'customize'));

create policy "etapas: lectura" on public.pipeline_stages
  for select to authenticated using (true);
create policy "etapas: personalización" on public.pipeline_stages
  for all to authenticated
  using (public.has_perm('system', 'customize'))
  with check (public.has_perm('system', 'customize'));

create policy "campos personalizados: lectura" on public.custom_field_definitions
  for select to authenticated using (true);
create policy "campos personalizados: personalización" on public.custom_field_definitions
  for all to authenticated
  using (public.has_perm('system', 'customize'))
  with check (public.has_perm('system', 'customize'));

create policy "vistas: propias o compartidas" on public.list_views
  for select to authenticated
  using (owner_id = auth.uid() or is_shared);
create policy "vistas: crear propias" on public.list_views
  for insert to authenticated
  with check (owner_id = auth.uid() and (not is_shared or public.has_perm('system', 'customize')));
create policy "vistas: editar propias" on public.list_views
  for update to authenticated
  using (owner_id = auth.uid() or (is_shared and public.has_perm('system', 'customize')))
  with check (owner_id = auth.uid() or (is_shared and public.has_perm('system', 'customize')));
create policy "vistas: borrar propias" on public.list_views
  for delete to authenticated
  using (owner_id = auth.uid() or (is_shared and public.has_perm('system', 'customize')));

-- ---------------------------------------------------------------------------
-- RLS de registros comerciales
-- ---------------------------------------------------------------------------
alter table public.accounts enable row level security;
alter table public.contacts enable row level security;
alter table public.opportunities enable row level security;
alter table public.opportunity_stage_history enable row level security;
alter table public.activities enable row level security;

create policy "cuentas: ver" on public.accounts
  for select to authenticated using (public.can_read_record('accounts', owner_id));
create policy "cuentas: crear" on public.accounts
  for insert to authenticated with check (public.has_perm('accounts', 'create'));
create policy "cuentas: editar" on public.accounts
  for update to authenticated
  using (public.can_edit_record('accounts', owner_id))
  with check (public.has_perm('accounts', 'edit'));
create policy "cuentas: eliminar" on public.accounts
  for delete to authenticated using (public.can_delete_record('accounts', owner_id));

create policy "contactos: ver" on public.contacts
  for select to authenticated using (public.can_read_record('contacts', owner_id));
create policy "contactos: crear" on public.contacts
  for insert to authenticated with check (public.has_perm('contacts', 'create'));
create policy "contactos: editar" on public.contacts
  for update to authenticated
  using (public.can_edit_record('contacts', owner_id))
  with check (public.has_perm('contacts', 'edit'));
create policy "contactos: eliminar" on public.contacts
  for delete to authenticated using (public.can_delete_record('contacts', owner_id));

create policy "oportunidades: ver" on public.opportunities
  for select to authenticated using (public.can_read_record('opportunities', owner_id));
create policy "oportunidades: crear" on public.opportunities
  for insert to authenticated with check (public.has_perm('opportunities', 'create'));
create policy "oportunidades: editar" on public.opportunities
  for update to authenticated
  using (public.can_edit_record('opportunities', owner_id))
  with check (public.has_perm('opportunities', 'edit'));
create policy "oportunidades: eliminar" on public.opportunities
  for delete to authenticated using (public.can_delete_record('opportunities', owner_id));

-- El historial se ve si se ve la oportunidad (la subconsulta aplica la RLS de oportunidades).
create policy "historial de etapas: ver" on public.opportunity_stage_history
  for select to authenticated
  using (exists (select 1 from public.opportunities o where o.id = opportunity_id));

-- Una actividad es visible para su propietario/jerarquía o para quien ve el registro
-- relacionado. Si está ligada a una oportunidad, manda la visibilidad de la oportunidad.
create policy "actividades: ver" on public.activities
  for select to authenticated
  using (
    public.can_read_record('activities', owner_id)
    or (public.has_perm('activities', 'read') and (
      case
        when opportunity_id is not null then
          exists (select 1 from public.opportunities o where o.id = opportunity_id)
        else
          (account_id is not null and exists (select 1 from public.accounts a where a.id = account_id))
          or (contact_id is not null and exists (select 1 from public.contacts c where c.id = contact_id))
      end
    ))
  );
create policy "actividades: crear" on public.activities
  for insert to authenticated with check (public.has_perm('activities', 'create'));
create policy "actividades: editar" on public.activities
  for update to authenticated
  using (public.can_edit_record('activities', owner_id))
  with check (public.has_perm('activities', 'edit'));
create policy "actividades: eliminar" on public.activities
  for delete to authenticated using (public.can_delete_record('activities', owner_id));

-- ---------------------------------------------------------------------------
-- Registros de demostración: el primer usuario los recibe como propios.
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
end;
$$;
revoke execute on function public.claim_demo_records(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Búsqueda global (respeta RLS: security invoker)
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
  (select 'opportunities'::text, o.id, o.name, concat_ws(' · ', s.name, o.close_date::text)
     from public.opportunities o
     join public.pipeline_stages s on s.id = o.stage_id, q
     where o.name ilike q.pattern
     order by o.close_date limit p_limit);
$$;
grant execute on function public.global_search(text, int) to authenticated;
