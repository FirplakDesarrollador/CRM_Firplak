-- Firplak CRM · Fase 21: Planner, SharePoint y sincronización automática con Microsoft 365.
--   · Planner: cada persona elige su plan y depósito; sus tareas del CRM se crean allí y el
--     estado «completada» viaja en ambos sentidos (vínculos en external_links).
--   · SharePoint: administración elige el sitio y la biblioteca; cada cuenta y oportunidad puede
--     tener su carpeta de documentos, compartida por todos los que ven el registro.
--   · La sincronización periódica la dispara el servidor (cron) como cada persona.

-- Ajustes de integraciones de la empresa (no secretos): p. ej. el sitio y la biblioteca de SharePoint.
create table public.integration_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now()
);
alter table public.integration_settings enable row level security;
create policy "integraciones: leer" on public.integration_settings for select to authenticated using (true);
create policy "integraciones: administrar" on public.integration_settings for all to authenticated
  using (public.has_perm('system', 'customize')) with check (public.has_perm('system', 'customize'));

-- Carpeta de documentos de un registro (una por registro). La ve quien ve el registro.
create table public.record_folders (
  object text not null check (object in ('accounts', 'opportunities')),
  record_id uuid not null,
  drive_id text not null,
  item_id text not null,
  web_url text,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (object, record_id)
);
alter table public.record_folders enable row level security;
create policy "carpetas: ver" on public.record_folders for select to authenticated
  using (public.can_see_record(object, record_id));
create policy "carpetas: crear" on public.record_folders for insert to authenticated
  with check (public.can_see_record(object, record_id) and created_by = auth.uid());
create policy "carpetas: quitar" on public.record_folders for delete to authenticated
  using (created_by = auth.uid() or public.has_perm('system', 'customize'));

-- Planner: la tarea de Planner guarda su etiqueta de versión (If-Match) para poder actualizarla.
alter table public.external_links add column etag text;
