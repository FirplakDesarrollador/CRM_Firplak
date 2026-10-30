-- Firplak CRM · Fase 13: etiquetas en inglés de los valores de listas.
-- Los valores se guardan en español (son los datos); la etiqueta en inglés solo cambia
-- cómo se muestran a quien usa la aplicación en inglés. Si no hay etiqueta propia, la
-- aplicación usa su diccionario de valores estándar.

alter table public.picklist_values add column label_en text;
alter table public.pipeline_stages add column name_en text;
alter table public.custom_field_definitions add column option_labels_en jsonb not null default '{}'::jsonb;
