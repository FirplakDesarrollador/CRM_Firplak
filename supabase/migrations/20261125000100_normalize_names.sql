-- Firplak CRM · Nombres limpios al guardar.
-- Los nombres de cuentas, contactos, prospectos y oportunidades, y las ciudades y departamentos,
-- se guardan con mayúscula inicial en cada palabra, sin importar cómo se escribieron:
--   «SODIMAC Colombia» → «Sodimac Colombia», «luis escobar» → «Luis Escobar»,
--   «altos de BELLALUNA» → «Altos de Bellaluna».
-- Las preposiciones y conjunciones van en minúscula salvo al inicio (de, del, y, en…); los artículos
-- también, pero solo detrás de una preposición («Cartagena de Indias», «Hotel Mirador de la Bahía»,
-- y en cambio «Almacenes La 14»). Las siglas societarias se escriben en su forma (S.A.S., S.A.,
-- Ltda., C.I.) y los números romanos en mayúscula. Los correos se guardan en minúscula.
-- Se aplica al crear y al cambiar cada campo, en la base: también en importaciones y asistentes de IA.
-- Los registros de demostración no se tocan (sus nombres son fijos).

create or replace function public.normalize_name(p_text text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_words text[];
  v_out text[] := '{}';
  v_word text;
  v_part text;
  v_parts text[];
  v_lead text;
  v_fixed text;
  v_prev text;
  i int := 0;
  v_preps constant text[] := array['de', 'del', 'y', 'e', 'o', 'u', 'en', 'a', 'al', 'con', 'por', 'para', 'sin', 'sobre', 'entre'];
  v_articles constant text[] := array['el', 'la', 'los', 'las'];
  v_suffixes constant jsonb := '{"s.a.s.":"S.A.S.","s.a.s":"S.A.S.","sas":"S.A.S.","s.a.":"S.A.","s.a":"S.A.","ltda":"Ltda.","ltda.":"Ltda.",
    "e.u.":"E.U.","c.i.":"C.I.","d.c.":"D.C.","s.c.a.":"S.C.A.","s.c.s.":"S.C.S."}';
begin
  if p_text is null then
    return null;
  end if;
  p_text := btrim(regexp_replace(p_text, '\s+', ' ', 'g'));
  if p_text = '' then
    return p_text;
  end if;
  v_words := string_to_array(lower(p_text), ' ');
  foreach v_word in array v_words loop
    i := i + 1;
    v_fixed := v_suffixes ->> v_word;
    if i > 1 and v_fixed is not null then
      v_out := v_out || v_fixed;
    elsif i > 1 and v_word = any (v_preps) then
      v_out := v_out || v_word;
    elsif i > 1 and v_word = any (v_articles) and v_prev = any (v_preps) then
      v_out := v_out || v_word;
    elsif v_word ~ '^(ii|iii|iv|vi|vii|viii|ix|xi|xii|xiii|xiv|xv)$' then
      v_out := v_out || upper(v_word);
    else
      -- Mayúscula en la primera letra de cada parte unida con guion («Jean-Pierre»); si la palabra
      -- empieza por un número («4x4», «2do») se deja como está.
      v_parts := '{}';
      foreach v_part in array string_to_array(v_word, '-') loop
        v_lead := substring(v_part from '^[^[:alnum:]]*');
        v_parts := v_parts || (v_lead || upper(substr(v_part, length(v_lead) + 1, 1)) || substr(v_part, length(v_lead) + 2));
      end loop;
      v_out := v_out || array_to_string(v_parts, '-');
    end if;
    v_prev := v_word;
  end loop;
  return array_to_string(v_out, ' ');
end;
$$;
-- La ejecuta el trigger con el usuario que guarda.
grant execute on function public.normalize_name(text) to authenticated;

create or replace function public.normalize_record_text()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_names text[];
  v_emails text[];
  v_field text;
  v_new jsonb := to_jsonb(new);
  v_old jsonb;
  v_patch jsonb := '{}'::jsonb;
begin
  if coalesce((v_new ->> 'is_demo')::boolean, false) then
    return new;
  end if;
  case tg_table_name
    when 'accounts' then
      v_names := array['name', 'billing_city', 'billing_state', 'shipping_city', 'shipping_state'];
      v_emails := array['email'];
    when 'contacts' then
      v_names := array['first_name', 'last_name', 'mailing_city', 'mailing_state'];
      v_emails := array['email'];
    when 'leads' then
      v_names := array['first_name', 'last_name', 'company', 'city', 'state'];
      v_emails := array['email'];
    when 'opportunities' then
      v_names := array['name'];
      v_emails := '{}';
    else
      return new;
  end case;
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
  end if;
  foreach v_field in array v_names loop
    continue when v_new ->> v_field is null;
    continue when tg_op = 'UPDATE' and (v_new -> v_field) is not distinct from (v_old -> v_field);
    v_patch := v_patch || jsonb_build_object(v_field, public.normalize_name(v_new ->> v_field));
  end loop;
  foreach v_field in array v_emails loop
    continue when v_new ->> v_field is null;
    continue when tg_op = 'UPDATE' and (v_new -> v_field) is not distinct from (v_old -> v_field);
    v_patch := v_patch || jsonb_build_object(v_field, nullif(lower(btrim(v_new ->> v_field)), ''));
  end loop;
  if v_patch <> '{}'::jsonb then
    new := jsonb_populate_record(new, v_patch);
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['accounts', 'contacts', 'leads', 'opportunities'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.normalize_record_text()',
                   t || '_normalize_text', t);
  end loop;
end
$$;
