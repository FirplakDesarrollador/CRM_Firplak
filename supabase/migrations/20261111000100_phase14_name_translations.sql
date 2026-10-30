-- Firplak CRM · Fase 14: nombres en inglés de pipelines y campos personalizados.
-- Completan la Fase 13: la etiqueta y la ayuda de cada campo propio y el nombre de cada
-- pipeline creado en Configuración pueden tener su versión en inglés (vacía = se muestra
-- el texto en español o la traducción estándar).

alter table public.pipelines add column name_en text;
alter table public.custom_field_definitions
  add column label_en text,
  add column help_text_en text;
