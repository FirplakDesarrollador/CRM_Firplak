-- Firplak CRM · Fase 3: informes configurables, plantillas de correo y registro de
-- correos enviados desde el CRM.

-- ---------------------------------------------------------------------------
-- Informes guardados
-- definition = {
--   "filters": [...], "scope": "all|mine",
--   "groupBy": "stage_id", "groupBy2": "owner_id", "dateGrouping": "month|quarter|year",
--   "aggregate": {"fn": "count|sum|avg", "field": "amount"},
--   "chart": "bar|column|table"
-- }
-- ---------------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  description text,
  object text not null check (object in (
    'accounts', 'contacts', 'opportunities', 'activities', 'leads', 'products', 'quotes', 'cases', 'campaigns'
  )),
  folder text not null default 'Informes comerciales',
  definition jsonb not null default '{}'::jsonb,
  owner_id uuid references public.profiles (id) on delete cascade,
  is_shared boolean not null default false,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reports_owner_idx on public.reports (owner_id);
create trigger reports_updated_at before update on public.reports
  for each row execute function public.set_updated_at();

alter table public.reports enable row level security;
create policy "informes: propios o compartidos" on public.reports
  for select to authenticated using (owner_id = auth.uid() or is_shared);
create policy "informes: crear propios" on public.reports
  for insert to authenticated
  with check (owner_id = auth.uid() and (not is_shared or public.has_perm('system', 'customize')));
create policy "informes: editar" on public.reports
  for update to authenticated
  using (owner_id = auth.uid() or (is_shared and public.has_perm('system', 'customize')))
  with check (owner_id = auth.uid() or (is_shared and public.has_perm('system', 'customize')));
create policy "informes: borrar" on public.reports
  for delete to authenticated
  using (owner_id = auth.uid() or (is_shared and public.has_perm('system', 'customize')));

-- ---------------------------------------------------------------------------
-- Plantillas de correo con campos combinados ({{contacto.nombre}}, {{cuenta.nombre}}…)
-- ---------------------------------------------------------------------------
create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  category text not null default 'General',
  subject text not null default '',
  body text not null default '',
  is_active boolean not null default true,
  is_shared boolean not null default false,
  owner_id uuid references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger email_templates_updated_at before update on public.email_templates
  for each row execute function public.set_updated_at();

alter table public.email_templates enable row level security;
create policy "plantillas: propias o compartidas" on public.email_templates
  for select to authenticated using (owner_id = auth.uid() or is_shared);
create policy "plantillas: crear" on public.email_templates
  for insert to authenticated
  with check (owner_id = auth.uid() and (not is_shared or public.has_perm('system', 'customize')));
create policy "plantillas: editar" on public.email_templates
  for update to authenticated
  using (owner_id = auth.uid() or (is_shared and public.has_perm('system', 'customize')))
  with check (owner_id = auth.uid() or (is_shared and public.has_perm('system', 'customize')));
create policy "plantillas: borrar" on public.email_templates
  for delete to authenticated
  using (owner_id = auth.uid() or (is_shared and public.has_perm('system', 'customize')));

-- ---------------------------------------------------------------------------
-- Correos registrados como actividades
-- ---------------------------------------------------------------------------
alter table public.activities
  add column email_to text,
  add column email_cc text,
  add column email_delivery text check (email_delivery in ('provider', 'client', 'logged')),
  add column email_provider_id text;
