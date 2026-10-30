-- Firplak CRM · Fase 20: Microsoft 365 (Outlook y Teams).
-- Cada persona conecta su cuenta de Microsoft (OAuth delegado): sus reuniones del CRM pasan a
-- su calendario de Outlook, las reuniones y correos de Outlook con contactos del CRM quedan
-- como actividades, y el CRM puede enviar correos desde su buzón. Teams recibe avisos de las
-- automatizaciones en los canales que configure administración.
-- Los tokens de Microsoft se guardan cifrados (AES-256-GCM con una clave del servidor).

create table public.ms365_connections (
  user_id uuid primary key references public.profiles (id) on delete cascade default auth.uid(),
  ms_user_id text,
  email text,
  display_name text,
  access_token_enc text not null,
  refresh_token_enc text not null,
  expires_at timestamptz not null,
  scopes text,
  settings jsonb not null default '{"calendar_push": true, "calendar_pull": true, "mail_pull": true, "send_via_outlook": true}'::jsonb,
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  last_sync_summary text
);
alter table public.ms365_connections enable row level security;
create policy "microsoft 365: propia" on public.ms365_connections for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Administración ve quién está conectado (los tokens siguen cifrados).
create policy "microsoft 365: administración ve" on public.ms365_connections for select to authenticated
  using (public.has_perm('system', 'manage_users'));

-- Vínculos entre registros del CRM y elementos externos (evento, correo, tarea, carpeta).
create table public.external_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  provider text not null default 'ms365' check (provider in ('ms365')),
  kind text not null check (kind in ('outlook_event', 'outlook_message', 'planner_task', 'sharepoint_folder')),
  external_id text not null,
  object text not null,
  record_id uuid not null,
  web_url text,
  origin text not null default 'crm' check (origin in ('crm', 'external')),
  synced_at timestamptz not null default now(),
  external_updated_at timestamptz,
  unique (provider, kind, external_id, user_id)
);
create index external_links_record_idx on public.external_links (object, record_id);
alter table public.external_links enable row level security;
create policy "vínculos externos: propios" on public.external_links for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Canales de Teams (flujo «Publicar en un canal cuando se recibe una solicitud de webhook»).
create table public.teams_channels (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  webhook_url text not null check (webhook_url ~ '^https?://'),
  created_at timestamptz not null default now()
);
alter table public.teams_channels enable row level security;
create policy "canales de teams: administración" on public.teams_channels for all to authenticated
  using (public.has_perm('system', 'customize')) with check (public.has_perm('system', 'customize'));

-- Correos enviados desde el buzón de Outlook de la persona.
alter table public.activities drop constraint activities_email_delivery_check;
alter table public.activities add constraint activities_email_delivery_check
  check (email_delivery in ('provider', 'client', 'logged', 'outlook'));
