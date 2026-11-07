-- Firplak CRM · Funciones internas de la TRM cerradas a los usuarios.
-- En Supabase, cada función nueva queda ejecutable por `authenticated`. Estas dos solo deben correr desde
-- set_exchange_rate / refresh_exchange_rates (que exigen permiso de administrador): si no, cualquier
-- usuario podría registrar una TRM a su gusto y mover el valor en pesos del pipeline.
revoke execute on function public.save_exchange_rate(text, date, date, numeric, text) from public, anon, authenticated;
revoke execute on function public.recalc_foreign_opportunities() from public, anon, authenticated;
