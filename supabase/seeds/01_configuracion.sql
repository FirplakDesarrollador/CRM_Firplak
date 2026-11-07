-- Firplak CRM · Configuración inicial
-- Perfiles de permisos, jerarquía de roles, compartir por defecto, pipelines y etapas, campos
-- personalizados, vistas, listas de precios, informes, plantillas, reglas, automatizaciones y el
-- proceso de aprobación de cotizaciones. Sin registros ficticios.
--
-- Solo para una base NUEVA (justo después de las migraciones): en local la cargan dev:demo, db:test y
-- `supabase db reset`; en producción va dentro de setup-produccion.sql (npm run db:bundle:produccion).
-- En una base que ya tiene configuración se detiene sin cambiar nada: nunca se reaplica encima de lo
-- que el administrador haya personalizado. Los cambios de configuración posteriores van en migraciones.

do $$
begin
  if exists (select 1 from public.permission_profiles) then
    raise exception 'Esta base ya tiene configuración inicial: 01_configuracion.sql es solo para una base nueva. No se aplicó nada.'
      using errcode = 'P0001';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Perfiles de permisos
-- ---------------------------------------------------------------------------
insert into public.permission_profiles (name, description, is_admin, is_default, permissions) values
('Administrador del sistema', 'Acceso total, configuración y usuarios.', true, false, '{}'),
('Gerente comercial', 'Ve y gestiona todo el comercial; sin configuración del sistema.', false, false, '{
  "accounts":      {"read":true,"create":true,"edit":true,"delete":true,"view_all":true,"modify_all":true},
  "contacts":      {"read":true,"create":true,"edit":true,"delete":true,"view_all":true,"modify_all":true},
  "opportunities": {"read":true,"create":true,"edit":true,"delete":true,"view_all":true,"modify_all":true},
  "activities":    {"read":true,"create":true,"edit":true,"delete":true,"view_all":true,"modify_all":true},
  "system":        {"view_dashboards":true,"export":true,"manage_users":false,"customize":false}
}'),
('Asesor comercial', 'Gestiona sus propias cuentas, contactos, oportunidades y actividades.', false, true, '{
  "accounts":      {"read":true,"create":true,"edit":true,"delete":false,"view_all":false,"modify_all":false},
  "contacts":      {"read":true,"create":true,"edit":true,"delete":false,"view_all":false,"modify_all":false},
  "opportunities": {"read":true,"create":true,"edit":true,"delete":false,"view_all":false,"modify_all":false},
  "activities":    {"read":true,"create":true,"edit":true,"delete":true,"view_all":false,"modify_all":false},
  "system":        {"view_dashboards":true,"export":false,"manage_users":false,"customize":false}
}'),
('Servicio al cliente', 'Atiende clientes: contactos y actividades; consulta oportunidades.', false, false, '{
  "accounts":      {"read":true,"create":false,"edit":true,"delete":false,"view_all":true,"modify_all":false},
  "contacts":      {"read":true,"create":true,"edit":true,"delete":false,"view_all":true,"modify_all":false},
  "opportunities": {"read":true,"create":false,"edit":false,"delete":false,"view_all":true,"modify_all":false},
  "activities":    {"read":true,"create":true,"edit":true,"delete":true,"view_all":true,"modify_all":false},
  "system":        {"view_dashboards":false,"export":false,"manage_users":false,"customize":false}
}'),
('Solo lectura', 'Consulta toda la información sin modificarla.', false, false, '{
  "accounts":      {"read":true,"view_all":true},
  "contacts":      {"read":true,"view_all":true},
  "opportunities": {"read":true,"view_all":true},
  "activities":    {"read":true,"view_all":true},
  "system":        {"view_dashboards":true,"export":false}
}')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Jerarquía de roles
-- ---------------------------------------------------------------------------
insert into public.roles (name, description, sort_order) values
('Gerencia General', 'Cabeza de la jerarquía.', 0)
on conflict (name) do nothing;

insert into public.roles (name, description, parent_id, sort_order)
select v.name, v.description, (select id from public.roles where name = v.parent), v.sort_order
from (values
  ('Dirección Comercial', 'Dirección nacional de ventas.', 'Gerencia General', 1),
  ('Dirección de Servicio', 'Servicio al cliente y posventa.', 'Gerencia General', 2)
) as v(name, description, parent, sort_order)
on conflict (name) do nothing;

insert into public.roles (name, description, parent_id, sort_order)
select v.name, v.description, (select id from public.roles where name = v.parent), v.sort_order
from (values
  ('Gerencia Regional Antioquia y Eje Cafetero', null, 'Dirección Comercial', 1),
  ('Gerencia Regional Centro', null, 'Dirección Comercial', 2),
  ('Gerencia Regional Costa', null, 'Dirección Comercial', 3),
  ('Canal Distribución y Retail', null, 'Dirección Comercial', 4),
  ('Servicio al Cliente', null, 'Dirección de Servicio', 1)
) as v(name, description, parent, sort_order)
on conflict (name) do nothing;

insert into public.roles (name, description, parent_id, sort_order)
select v.name, v.description, (select id from public.roles where name = v.parent), v.sort_order
from (values
  ('Asesores Antioquia y Eje Cafetero', null, 'Gerencia Regional Antioquia y Eje Cafetero', 1),
  ('Asesores Centro', null, 'Gerencia Regional Centro', 1),
  ('Asesores Costa', null, 'Gerencia Regional Costa', 1),
  ('Ejecutivos de Distribución', null, 'Canal Distribución y Retail', 1)
) as v(name, description, parent, sort_order)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Compartir por defecto
-- ---------------------------------------------------------------------------
insert into public.sharing_settings (object, access) values
('accounts', 'read'),
('contacts', 'read'),
('opportunities', 'private'),
('activities', 'private')
on conflict (object) do nothing;

-- ---------------------------------------------------------------------------
-- Pipelines y etapas
-- ---------------------------------------------------------------------------
insert into public.pipelines (name, description, is_default, sort_order) values
('Proyectos y constructoras', 'Venta consultiva para obras, vivienda y hotelería.', true, 0),
('Distribución y retail', 'Venta a distribuidores, ferreterías y grandes superficies.', false, 1)
on conflict (name) do nothing;

insert into public.pipeline_stages (pipeline_id, name, sort_order, probability, category, forecast_category, color)
select (select id from public.pipelines where name = v.pipeline), v.name, v.sort_order, v.probability, v.category, v.forecast, v.color
from (values
  ('Proyectos y constructoras', 'Prospección', 1, 10, 'open', 'pipeline', '#9bb4c3'),
  ('Proyectos y constructoras', 'Calificación', 2, 20, 'open', 'pipeline', '#749094'),
  ('Proyectos y constructoras', 'Especificación técnica', 3, 35, 'open', 'pipeline', '#4a7693'),
  ('Proyectos y constructoras', 'Cotización enviada', 4, 50, 'open', 'best_case', '#335a73'),
  ('Proyectos y constructoras', 'Negociación', 5, 75, 'open', 'commit', '#254153'),
  ('Proyectos y constructoras', 'Ganada', 6, 100, 'won', 'closed', '#4f7a52'),
  ('Proyectos y constructoras', 'Perdida', 7, 0, 'lost', 'omitted', '#a04a3d'),
  ('Distribución y retail', 'Contacto inicial', 1, 10, 'open', 'pipeline', '#9bb4c3'),
  ('Distribución y retail', 'Muestras y catálogo', 2, 30, 'open', 'pipeline', '#749094'),
  ('Distribución y retail', 'Propuesta comercial', 3, 55, 'open', 'best_case', '#4a7693'),
  ('Distribución y retail', 'Pedido en negociación', 4, 80, 'open', 'commit', '#254153'),
  ('Distribución y retail', 'Ganada', 5, 100, 'won', 'closed', '#4f7a52'),
  ('Distribución y retail', 'Perdida', 6, 0, 'lost', 'omitted', '#a04a3d')
) as v(pipeline, name, sort_order, probability, category, forecast, color)
on conflict (pipeline_id, name) do nothing;

-- Cada canal de venta (campo Canal de la cuenta) con su pipeline. El Canal B2C aún no tiene el suyo: usa el
-- pipeline por defecto hasta que se cree en Configuración → Pipelines.
update public.pipelines set channel = 'Canal Constructores' where name = 'Proyectos y constructoras' and channel is null;
update public.pipelines set channel = 'Canal Distribución' where name = 'Distribución y retail' and channel is null;

-- ---------------------------------------------------------------------------
-- Campos personalizados (definidos en JSON, valores en custom_fields jsonb)
-- ---------------------------------------------------------------------------
insert into public.custom_field_definitions (object, api_name, label, field_type, options, show_in_list, sort_order, help_text) values
('accounts', 'canal', 'Canal', 'select',
  '["Constructora","Distribuidor","Retail / gran superficie","Hotelería","Institucional","Arquitecto / diseñador"]', true, 1, null),
('accounts', 'zona_comercial', 'Zona comercial', 'select',
  '["Antioquia","Eje Cafetero","Bogotá y Centro","Costa Atlántica","Suroccidente","Santanderes","Exportación"]', false, 2, null),
('accounts', 'cupo_credito', 'Cupo de crédito', 'currency', '[]', false, 3, 'Cupo aprobado por cartera, en COP.'),
('contacts', 'rol_compra', 'Rol en la compra', 'select',
  '["Decisor","Influenciador","Especificador","Comprador","Usuario"]', true, 1, null),
('contacts', 'canal_preferido', 'Canal preferido', 'select',
  '["WhatsApp","Correo","Llamada","Visita"]', false, 2, null),
('opportunities', 'lineas_producto', 'Líneas de producto', 'multiselect',
  '["Muebles de baño","Lavamanos y superficies","Duchas y bañeras","Cocinas","Clósets","Accesorios"]', true, 1, null),
('opportunities', 'proyecto_obra', 'Proyecto / obra', 'text', '[]', false, 2, 'Nombre de la obra o proyecto inmobiliario.'),
('opportunities', 'unidades', 'Unidades (viviendas / habitaciones)', 'number', '[]', false, 3, null),
('opportunities', 'competidor', 'Competidor principal', 'text', '[]', false, 4, null)
on conflict (object, api_name) do nothing;

-- Fase 14: etiquetas y ayudas en inglés de los campos de ejemplo.
update public.custom_field_definitions f set label_en = v.label_en, help_text_en = v.help_en
from (values
  ('accounts', 'canal', 'Channel', null),
  ('accounts', 'zona_comercial', 'Sales region', null),
  ('accounts', 'cupo_credito', 'Credit limit', 'Limit approved by credit and collections, in COP.'),
  ('contacts', 'rol_compra', 'Buying role', null),
  ('contacts', 'canal_preferido', 'Preferred channel', null),
  ('opportunities', 'lineas_producto', 'Product lines', null),
  ('opportunities', 'proyecto_obra', 'Project / site', 'Name of the construction site or real estate project.'),
  ('opportunities', 'unidades', 'Units (homes / rooms)', null),
  ('opportunities', 'competidor', 'Main competitor', null)
) as v (object, api_name, label_en, help_en)
where f.object = v.object and f.api_name = v.api_name and f.label_en is null;

-- ---------------------------------------------------------------------------
-- Vistas de lista compartidas
-- ---------------------------------------------------------------------------
insert into public.list_views (object, name, owner_id, is_shared, is_pinned, definition)
select v.object, v.name, null, true, false, v.definition::jsonb
from (values
  ('accounts', 'Clientes activos', '{"filters":[{"field":"account_type","op":"eq","value":"Cliente"}],"sort":{"field":"name","dir":"asc"}}'),
  ('accounts', 'Distribuidores', '{"filters":[{"field":"account_type","op":"eq","value":"Distribuidor"}],"sort":{"field":"name","dir":"asc"}}'),
  ('opportunities', 'Cierran este mes', '{"filters":[{"field":"is_closed","op":"eq","value":"false"},{"field":"close_date","op":"this_month","value":""}],"sort":{"field":"close_date","dir":"asc"}}'),
  ('opportunities', 'Ganadas', '{"filters":[{"field":"is_won","op":"eq","value":"true"}],"sort":{"field":"close_date","dir":"desc"}}'),
  ('contacts', 'Decisores', '{"filters":[{"field":"cf.rol_compra","op":"eq","value":"Decisor"}],"sort":{"field":"last_name","dir":"asc"}}')
) as v(object, name, definition)
where not exists (select 1 from public.list_views lv where lv.object = v.object and lv.name = v.name and lv.is_shared);

-- ===========================================================================
-- Fase 2: prospectos, campañas, productos, listas de precios, cotizaciones, casos
-- ===========================================================================

-- Permisos por defecto de los nuevos objetos (solo se agregan si el perfil no los tiene).
update public.permission_profiles p
set permissions = v.defaults::jsonb || p.permissions
from (values
  ('Gerente comercial', '{
    "leads":     {"read":true,"create":true,"edit":true,"delete":true,"view_all":true,"modify_all":true},
    "campaigns": {"read":true,"create":true,"edit":true,"delete":true,"view_all":true,"modify_all":true},
    "products":  {"read":true,"create":true,"edit":true,"delete":false,"view_all":true,"modify_all":false},
    "quotes":    {"read":true,"create":true,"edit":true,"delete":true,"view_all":true,"modify_all":true},
    "cases":     {"read":true,"create":true,"edit":true,"delete":true,"view_all":true,"modify_all":true}}'),
  ('Asesor comercial', '{
    "leads":     {"read":true,"create":true,"edit":true,"delete":false,"view_all":false,"modify_all":false},
    "campaigns": {"read":true,"create":false,"edit":false,"delete":false,"view_all":true,"modify_all":false},
    "products":  {"read":true},
    "quotes":    {"read":true,"create":true,"edit":true,"delete":true,"view_all":false,"modify_all":false},
    "cases":     {"read":true,"create":true,"edit":true,"delete":false,"view_all":false,"modify_all":false}}'),
  ('Servicio al cliente', '{
    "leads":     {"read":true,"create":true,"edit":true,"delete":false,"view_all":false,"modify_all":false},
    "campaigns": {"read":true,"view_all":true},
    "products":  {"read":true},
    "quotes":    {"read":true,"view_all":true},
    "cases":     {"read":true,"create":true,"edit":true,"delete":true,"view_all":true,"modify_all":true}}'),
  ('Solo lectura', '{
    "leads": {"read":true,"view_all":true}, "campaigns": {"read":true,"view_all":true},
    "products": {"read":true}, "quotes": {"read":true,"view_all":true}, "cases": {"read":true,"view_all":true}}')
) as v(name, defaults)
where p.name = v.name;

insert into public.sharing_settings (object, access) values
('leads', 'private'),
('campaigns', 'read'),
('quotes', 'private'),
('cases', 'read')
on conflict (object) do nothing;

insert into public.price_books (name, description, is_standard, channel) values
('Lista estándar COP', 'Precios de lista para proyectos y clientes directos.', true, 'Canal Constructores'),
('Distribuidores 2026', 'Precios para distribuidores y ferreterías.', false, 'Canal Distribución')
on conflict (name) do nothing;

insert into public.list_views (object, name, owner_id, is_shared, definition)
select v.object, v.name, null, true, v.definition::jsonb
from (values
  ('leads', 'Prospectos abiertos', '{"filters":[{"field":"is_converted","op":"eq","value":"false"}],"sort":{"field":"created_at","dir":"desc"}}'),
  ('cases', 'Casos abiertos', '{"filters":[{"field":"is_closed","op":"eq","value":"false"}],"sort":{"field":"created_at","dir":"desc"}}'),
  ('quotes', 'Cotizaciones vigentes', '{"filters":[{"field":"status","op":"neq","value":"Rechazada"}],"sort":{"field":"created_at","dir":"desc"}}')
) as v(object, name, definition)
where not exists (select 1 from public.list_views lv where lv.object = v.object and lv.name = v.name and lv.is_shared);

-- ===========================================================================
-- Fase 3: informes y plantillas de correo compartidos
-- ===========================================================================
insert into public.reports (name, description, object, folder, definition, is_shared)
select v.name, v.description, v.object, v.folder, v.definition::jsonb, true
from (values
  ('Pipeline abierto por etapa', 'Valor de las oportunidades abiertas en cada etapa.', 'opportunities', 'Ventas',
   '{"filters":[{"field":"is_closed","op":"eq","value":"false"}],"groupBy":"stage_id","aggregate":{"fn":"sum","field":"amount"},"chart":"bar"}'),
  ('Ventas ganadas por mes y asesor', 'Oportunidades ganadas este año, por mes de cierre y propietario.', 'opportunities', 'Ventas',
   '{"filters":[{"field":"is_won","op":"eq","value":"true"},{"field":"close_date","op":"this_year","value":""}],"groupBy":"close_date","dateGrouping":"month","groupBy2":"owner_id","aggregate":{"fn":"sum","field":"amount"},"chart":"column"}'),
  ('Pipeline abierto por tipo y origen', 'Valor del pipeline abierto según el tipo de oportunidad y su origen.', 'opportunities', 'Ventas',
   '{"filters":[{"field":"is_closed","op":"eq","value":"false"}],"groupBy":"opportunity_type","groupBy2":"lead_source","aggregate":{"fn":"sum","field":"amount"},"chart":"table"}'),
  ('Prospectos por origen y estado', 'De dónde vienen los prospectos y en qué estado están.', 'leads', 'Mercadeo',
   '{"filters":[],"groupBy":"lead_source","groupBy2":"status","aggregate":{"fn":"count"},"chart":"bar"}'),
  ('Casos abiertos por prioridad', 'Carga de servicio pendiente.', 'cases', 'Servicio',
   '{"filters":[{"field":"is_closed","op":"eq","value":"false"}],"groupBy":"priority","groupBy2":"status","aggregate":{"fn":"count"},"chart":"bar"}'),
  ('Actividades completadas por asesor', 'Productividad comercial del mes.', 'activities', 'Actividad comercial',
   '{"filters":[{"field":"status","op":"eq","value":"completed"},{"field":"completed_at","op":"this_month","value":""}],"groupBy":"owner_id","groupBy2":"activity_type","aggregate":{"fn":"count"},"chart":"bar"}')
) as v(name, description, object, folder, definition)
where not exists (select 1 from public.reports r where r.name = v.name and r.is_shared);

insert into public.email_templates (name, category, subject, body, is_shared)
select v.name, v.category, v.subject, v.body, true
from (values
  ('Seguimiento después de la visita', 'Seguimiento',
   'Seguimiento a nuestra visita · {{cuenta.nombre}}',
   E'Hola {{contacto.nombre}},\n\nGracias por recibirnos. Como conversamos, te comparto los siguientes pasos para {{oportunidad.nombre}}:\n\n1. Revisión de especificaciones técnicas.\n2. Envío de la propuesta económica.\n3. Visita de validación en obra.\n\nQuedo atento a tus comentarios.\n\nUn saludo,\n{{usuario.nombre}}\n{{usuario.cargo}} · Firplak\n{{usuario.telefono}}'),
  ('Envío de cotización', 'Cotizaciones',
   'Cotización para {{oportunidad.nombre}}',
   E'Hola {{contacto.nombre}},\n\nAdjunto encontrarás la cotización para {{oportunidad.nombre}} por un valor de {{oportunidad.valor}}. Está vigente hasta el {{oportunidad.fecha_cierre}}.\n\nSi necesitas ajustar cantidades o referencias, con gusto la actualizamos.\n\nCordialmente,\n{{usuario.nombre}}\nFirplak · inspirando hogares'),
  ('Bienvenida a distribuidor', 'Distribución',
   'Bienvenidos a la red de distribuidores Firplak',
   E'Hola {{contacto.nombre}},\n\nEs un gusto darle la bienvenida a {{cuenta.nombre}} como distribuidor. En los próximos días te enviaremos el catálogo actualizado, la lista de precios y el material de exhibición.\n\nCualquier inquietud, escríbeme.\n\n{{usuario.nombre}}\n{{usuario.correo}}')
) as v(name, category, subject, body)
where not exists (select 1 from public.email_templates t where t.name = v.name and t.is_shared);

-- ===========================================================================
-- Fase 4: reglas de validación y automatizaciones de ejemplo
-- ===========================================================================
insert into public.validation_rules (object, name, description, conditions, error_message, error_field)
select v.object, v.name, v.description, v.conditions::jsonb, v.message, v.field
from (values
  ('accounts', 'Cliente requiere NIT', 'Las cuentas de tipo Cliente deben tener NIT para facturar (salvo las del mercado Internacional).',
   '[{"field":"account_type","op":"eq","value":"Cliente"},{"field":"tax_id","op":"empty","value":""},{"field":"market","op":"neq","value":"Internacional"}]',
   'Las cuentas de tipo Cliente requieren NIT.', 'tax_id'),
  ('opportunities', 'Motivo de pérdida obligatorio', 'Toda oportunidad perdida debe indicar el motivo.',
   '[{"field":"is_closed","op":"eq","value":"true"},{"field":"is_won","op":"eq","value":"false"},{"field":"loss_reason","op":"empty","value":""}]',
   'Indica el motivo de pérdida antes de cerrar la oportunidad como perdida.', 'loss_reason'),
  ('opportunities', 'Valor obligatorio desde cotización', 'Desde la etapa de cotización la oportunidad debe tener valor.',
   '[{"field":"probability","op":"gte","value":"50"},{"field":"amount","op":"lte","value":"0"}]',
   'Ingresa el valor de la oportunidad: a partir de la cotización es obligatorio.', 'amount')
) as v(object, name, description, conditions, message, field)
where not exists (select 1 from public.validation_rules r where r.object = v.object and r.name = v.name);

insert into public.automation_rules (object, name, description, trigger_on, watch_field, conditions, actions, sort_order)
select v.object, v.name, v.description, v.trigger_on, v.watch, v.conditions::jsonb, v.actions::jsonb, v.ord
from (values
  ('leads', 'Prospecto web: contactar en 24 horas', 'Crea una tarea de alta prioridad y avisa al propietario.', 'create', null,
   '[{"field":"lead_source","op":"eq","value":"Web"}]',
   '[{"type":"create_task","subject":"Contactar prospecto web en 24 horas","due_in_days":1,"assign_to":"owner","priority":"high"},{"type":"notify","to":"owner","title":"Nuevo prospecto desde la web","body":"Contáctalo antes de 24 horas."}]', 1),
  ('opportunities', 'Oportunidad ganada: coordinar entrega', 'Al ganar, avisa al jefe directo y crea la tarea de coordinación.', 'update', 'stage_id',
   '[{"field":"is_won","op":"eq","value":"true"}]',
   '[{"type":"notify","to":"manager","title":"¡Oportunidad ganada!","body":"Revisa el negocio y felicita al equipo."},{"type":"create_task","subject":"Coordinar entrega e instalación","due_in_days":3,"assign_to":"owner","priority":"normal"}]', 2),
  ('cases', 'Caso de prioridad alta', 'Notifica al propietario cuando entra un caso de prioridad alta.', 'create_or_update', 'priority',
   '[{"field":"priority","op":"eq","value":"Alta"},{"field":"is_closed","op":"eq","value":"false"}]',
   '[{"type":"notify","to":"owner","title":"Caso de prioridad alta","body":"Atiéndelo hoy."}]', 3)
) as v(object, name, description, trigger_on, watch, conditions, actions, ord)
where not exists (select 1 from public.automation_rules r where r.object = v.object and r.name = v.name);

-- ===========================================================================
-- Fase 8: proceso de aprobación de ejemplo (descuento alto en cotizaciones)
-- ===========================================================================
insert into public.approval_processes (object, name, description, conditions, lock_record,
                                       submit_updates, approve_updates, reject_updates, sort_order)
select 'quotes', 'Descuento superior al 15 %',
       'Las cotizaciones en borrador con más de 15 % de descuento las aprueba el jefe directo del asesor antes de presentarlas.',
       '[{"field":"discount_percent","op":"gt","value":"15"},{"field":"status","op":"eq","value":"Borrador"}]', true,
       '[{"field":"status","value":"En revisión"}]',
       '[{"field":"status","value":"Aprobada"}]',
       '[{"field":"status","value":"Borrador"}]', 1
where not exists (select 1 from public.approval_processes where object = 'quotes' and name = 'Descuento superior al 15 %');

-- ===========================================================================
-- Fase 9: automatizaciones programadas de ejemplo
-- ===========================================================================
insert into public.automation_rules (object, name, description, trigger_on, schedule_field, schedule_offset_days, conditions, actions, sort_order)
select v.object, v.name, v.description, 'scheduled', v.field, v.offset_days, v.conditions::jsonb, v.actions::jsonb, v.ord
from (values
  ('opportunities', 'Confirmar cierre 3 días antes', 'Recuerda al asesor confirmar con el cliente antes de la fecha de cierre.',
   'close_date', -3, '[{"field":"is_closed","op":"eq","value":"false"}]',
   '[{"type":"create_task","subject":"Confirmar cierre con el cliente","due_in_days":1,"assign_to":"owner","priority":"high"}]', 10),
  ('quotes', 'Cotización vencida sin respuesta', 'Avisa al asesor y a su jefe cuando vence una cotización presentada.',
   'expiration_date', 1, '[{"field":"status","op":"eq","value":"Presentada"}]',
   '[{"type":"notify","to":"owner","title":"Cotización vencida sin respuesta","body":"Llama al cliente o actualiza la vigencia."},{"type":"notify","to":"manager","title":"Cotización de tu equipo vencida","body":"Sin respuesta del cliente."}]', 10)
) as v(object, name, description, field, offset_days, conditions, actions, ord)
where not exists (select 1 from public.automation_rules r where r.object = v.object and r.name = v.name);

-- ===========================================================================
-- Fase 11: pasos del proceso de ejemplo (jefe directo; gerencia si supera 25 %)
-- ===========================================================================
insert into public.approval_steps (process_id, step_order, name, conditions, approver_type)
select p.id, v.step_order, v.name, v.conditions::jsonb, v.approver_type
from public.approval_processes p,
  (values (1, 'Jefe directo', '[]', 'manager'),
          (2, 'Gerencia comercial', '[{"field":"discount_percent","op":"gt","value":"25"}]', 'previous_manager')
  ) as v(step_order, name, conditions, approver_type)
where p.object = 'quotes' and p.name = 'Descuento superior al 15 %'
  and not exists (select 1 from public.approval_steps s where s.process_id = p.id);

-- ===========================================================================
-- Fase 18: regla lista para la salida en vivo (inactiva: se activa cuando todos los
-- clientes tengan su código SAP)
-- ===========================================================================
insert into public.validation_rules (object, name, description, conditions, error_message, error_field, is_active)
select 'accounts', 'Cliente requiere código SAP',
  'Las cuentas de tipo Cliente deben tener su código de socio de negocio en SAP Business One (CardCode).',
  '[{"field":"account_type","op":"eq","value":"Cliente"},{"field":"sap_card_code","op":"empty","value":""}]'::jsonb,
  'Las cuentas de tipo Cliente requieren el código SAP: créalo primero en SAP y cópialo aquí.', 'sap_card_code', false
where not exists (select 1 from public.validation_rules r where r.object = 'accounts' and r.name = 'Cliente requiere código SAP');
