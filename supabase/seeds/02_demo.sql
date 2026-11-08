-- Firplak CRM · Datos de demostración
-- Empresas, personas, productos, prospectos, campañas, cotizaciones, casos y un pedido ficticios
-- (is_demo = true), más metas de compañía y una TRM de ejemplo. Requiere 01_configuracion.sql.
--
-- Solo para el modo demo (npm run dev:demo), las pruebas y un proyecto de demostración. Nunca para
-- producción: se niega a correr en una base con usuarios o con datos reales. Los registros quedan sin
-- propietario y el primer usuario que se registre los recibe (claim_demo_records).

do $$
begin
  if not exists (select 1 from public.permission_profiles) then
    raise exception 'Falta la configuración inicial: aplica primero 01_configuracion.sql.' using errcode = 'P0001';
  end if;
  if exists (select 1 from auth.users)
     or exists (select 1 from public.accounts where not is_demo)
     or exists (select 1 from public.opportunities where not is_demo) then
    raise exception 'Esta base tiene usuarios o datos reales: 02_demo.sql solo se carga en una base nueva de demostración. No se aplicó nada.'
      using errcode = 'P0001';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Pipelines del mercado Internacional: copias de los nacionales, para que la demo y las pruebas tengan
-- dónde poner las oportunidades de cuentas del exterior (en producción los crea administración).
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from public.pipelines where market = 'Internacional' and channel = 'Canal Constructores') then
    perform public.duplicate_pipeline((select id from public.pipelines where market = 'Nacional' and channel = 'Canal Constructores'),
      'Proyectos internacionales', 'Internacional');
  end if;
  if not exists (select 1 from public.pipelines where market = 'Internacional' and channel = 'Canal Distribución') then
    perform public.duplicate_pipeline((select id from public.pipelines where market = 'Nacional' and channel = 'Canal Distribución'),
      'Distribución internacional', 'Internacional');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Datos de demostración (empresas y personas ficticias)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.accounts where is_demo) then
    return;
  end if;

  insert into public.accounts
    (name, account_type, industry, segment, tax_id, phone, email, website, rating, annual_revenue, employees,
     billing_street, billing_city, billing_state, description, custom_fields, is_demo, created_at)
  values
  ('Constructora Altos del Valle S.A.S.', 'Cliente', 'Canal Constructores', 'Grandes cuentas', '900.456.123-1', '+57 604 444 1020',
   'compras@altosdelvalle.example', 'https://altosdelvalle.example', 'Caliente', 185000000000, 420,
   'Cra. 43A # 1-50', 'Medellín', 'Antioquia', 'Desarrolla vivienda VIS y no VIS en el Valle de Aburrá.',
   '{"canal":"Constructora","zona_comercial":"Antioquia","cupo_credito":800000000}', true, now() - interval '400 days'),
  ('Inmobiliaria Brisas del Caribe', 'Cliente', 'Canal Constructores', 'Grandes cuentas', '901.223.874-5', '+57 605 330 2211',
   'proyectos@brisascaribe.example', 'https://brisascaribe.example', 'Templada', 92000000000, 180,
   'Av. San Martín # 8-120', 'Cartagena', 'Bolívar', 'Proyectos turísticos y de segunda vivienda.',
   '{"canal":"Constructora","zona_comercial":"Costa Atlántica"}', true, now() - interval '320 days'),
  ('Hotel Mirador de la Bahía', 'Cliente', 'Canal Constructores', 'Empresarial', '890.778.410-2', '+57 605 664 9000',
   'mantenimiento@miradorbahia.example', null, 'Caliente', 41000000000, 260,
   'Bocagrande Cl. 5 # 2-33', 'Cartagena', 'Bolívar', 'Remodelación de 180 habitaciones programada.',
   '{"canal":"Hotelería","zona_comercial":"Costa Atlántica"}', true, now() - interval '210 days'),
  ('Distribuidora Hogar y Acabados Ltda.', 'Distribuidor', 'Canal Distribución', 'Canal', '800.334.902-7', '+57 601 745 3300',
   'gerencia@hogaryacabados.example', 'https://hogaryacabados.example', 'Caliente', 38000000000, 95,
   'Autopista Norte # 150-20', 'Bogotá', 'Cundinamarca', 'Distribuidor con 6 puntos de venta en la Sabana.',
   '{"canal":"Distribuidor","zona_comercial":"Bogotá y Centro","cupo_credito":450000000}', true, now() - interval '500 days'),
  ('Ferretería El Constructor del Eje', 'Distribuidor', 'Canal Distribución', 'Canal', '816.002.561-3', '+57 606 335 1188',
   'compras@constructoreje.example', null, 'Templada', 12500000000, 40,
   'Cl. 19 # 10-44', 'Pereira', 'Risaralda', null,
   '{"canal":"Distribuidor","zona_comercial":"Eje Cafetero","cupo_credito":150000000}', true, now() - interval '280 days'),
  ('Grupo Urbano Sabana S.A.', 'Prospecto', 'Canal Constructores', 'Grandes cuentas', '900.887.003-9', '+57 601 600 4545',
   'licitaciones@urbanosabana.example', 'https://urbanosabana.example', 'Templada', 240000000000, 610,
   'Cl. 100 # 19-61', 'Bogotá', 'Cundinamarca', 'Licita acabados para 3 torres en Chía.',
   '{"canal":"Constructora","zona_comercial":"Bogotá y Centro"}', true, now() - interval '60 days'),
  ('Clínica Santa Lucía del Sur', 'Prospecto', 'Canal Constructores', 'Institucional', '890.101.776-4', '+57 602 485 7700',
   'infraestructura@santalucia.example', null, 'Fría', 76000000000, 900,
   'Cra. 98 # 18-49', 'Cali', 'Valle del Cauca', 'Ampliación de torre de hospitalización.',
   '{"canal":"Institucional","zona_comercial":"Suroccidente"}', true, now() - interval '35 days'),
  ('Estudio Lineal Arquitectos', 'Partner', 'Canal Constructores', 'Prescriptor', '901.554.120-0', '+57 604 322 8090',
   'hola@estudiolineal.example', 'https://estudiolineal.example', 'Caliente', 2100000000, 18,
   'Cl. 10 Sur # 50FF-28', 'Medellín', 'Antioquia', 'Especifica productos en proyectos residenciales premium.',
   '{"canal":"Arquitecto / diseñador","zona_comercial":"Antioquia"}', true, now() - interval '150 days'),
  ('Centro Comercial Plaza Andina', 'Prospecto', 'Canal Constructores', 'Empresarial', '900.612.334-8', '+57 607 643 2100',
   'administracion@plazaandina.example', null, 'Fría', 18000000000, 75,
   'Cra. 27 # 29-145', 'Bucaramanga', 'Santander', 'Renovación de baterías sanitarias.',
   '{"canal":"Institucional","zona_comercial":"Santanderes"}', true, now() - interval '20 days'),
  ('Almacenes Casa Viva', 'Cliente', 'Canal Distribución', 'Canal', '860.045.998-1', '+57 601 487 6600',
   'categoria.banos@casaviva.example', 'https://casaviva.example', 'Caliente', 520000000000, 3200,
   'Av. Boyacá # 80-94', 'Bogotá', 'Cundinamarca', 'Cadena de mejoramiento del hogar con 22 tiendas.',
   '{"canal":"Retail / gran superficie","zona_comercial":"Bogotá y Centro","cupo_credito":1500000000}', true, now() - interval '700 days'),
  ('Vivienda Futura Caja de Compensación', 'Prospecto', 'Canal Constructores', 'Institucional', '890.900.842-6', '+57 604 510 7000',
   'proyectos@viviendafutura.example', null, 'Templada', 310000000000, 1500,
   'Cl. 49 # 50-21', 'Medellín', 'Antioquia', 'Programa de 1.200 viviendas VIS en Bello y Rionegro.',
   '{"canal":"Institucional","zona_comercial":"Antioquia"}', true, now() - interval '90 days'),
  ('Distribuidora Costa Acabados', 'Distribuidor', 'Canal Distribución', 'Canal', '802.009.551-2', '+57 605 385 4410',
   'ventas@costaacabados.example', null, 'Templada', 9800000000, 32,
   'Cra. 46 # 76-120', 'Barranquilla', 'Atlántico', null,
   '{"canal":"Distribuidor","zona_comercial":"Costa Atlántica","cupo_credito":120000000}', true, now() - interval '240 days');

  insert into public.contacts
    (account_id, salutation, first_name, last_name, title, department, email, phone, mobile, lead_source,
     mailing_city, custom_fields, is_demo, created_at)
  select (select id from public.accounts where name = v.account and is_demo),
         v.salutation, v.first_name, v.last_name, v.title, v.department, v.email, v.phone, v.mobile, v.source,
         v.city, v.cf::jsonb, true, now() - (v.age || ' days')::interval
  from (values
    ('Constructora Altos del Valle S.A.S.', 'Ing.', 'Mariana', 'Restrepo Gil', 'Directora de Compras', 'Compras', 'mrestrepo@altosdelvalle.example', '+57 604 444 1021', '+57 310 555 0101', 'Feria', 'Medellín', '{"rol_compra":"Decisor","canal_preferido":"WhatsApp"}', 380),
    ('Constructora Altos del Valle S.A.S.', 'Arq.', 'Julián', 'Cardona Ríos', 'Coordinador de Diseño', 'Diseño', 'jcardona@altosdelvalle.example', null, '+57 311 555 0102', 'Feria', 'Medellín', '{"rol_compra":"Especificador","canal_preferido":"Correo"}', 370),
    ('Constructora Altos del Valle S.A.S.', 'Sr.', 'Andrés', 'Mejía Toro', 'Residente de Obra', 'Obra', 'amejia@altosdelvalle.example', null, '+57 312 555 0103', 'Referido', 'Envigado', '{"rol_compra":"Usuario","canal_preferido":"Llamada"}', 200),
    ('Inmobiliaria Brisas del Caribe', 'Sra.', 'Laura', 'Pacheco Díaz', 'Gerente de Proyectos', 'Proyectos', 'lpacheco@brisascaribe.example', '+57 605 330 2212', '+57 300 555 0104', 'Web', 'Cartagena', '{"rol_compra":"Decisor","canal_preferido":"Visita"}', 300),
    ('Inmobiliaria Brisas del Caribe', 'Sr.', 'Camilo', 'Herrera Vega', 'Jefe de Compras', 'Compras', 'cherrera@brisascaribe.example', null, '+57 301 555 0105', 'Web', 'Cartagena', '{"rol_compra":"Comprador","canal_preferido":"Correo"}', 290),
    ('Hotel Mirador de la Bahía', 'Sr.', 'Rafael', 'Ospina Lara', 'Gerente de Mantenimiento', 'Mantenimiento', 'rospina@miradorbahia.example', '+57 605 664 9010', '+57 315 555 0106', 'Visita en frío', 'Cartagena', '{"rol_compra":"Influenciador","canal_preferido":"Llamada"}', 200),
    ('Hotel Mirador de la Bahía', 'Sra.', 'Patricia', 'Vélez Ramos', 'Gerente General', 'Gerencia', 'pvelez@miradorbahia.example', '+57 605 664 9001', null, 'Visita en frío', 'Cartagena', '{"rol_compra":"Decisor","canal_preferido":"Correo"}', 190),
    ('Distribuidora Hogar y Acabados Ltda.', 'Sr.', 'Hernán', 'Castaño Pérez', 'Gerente General', 'Gerencia', 'hcastano@hogaryacabados.example', '+57 601 745 3301', '+57 316 555 0107', 'Socio', 'Bogotá', '{"rol_compra":"Decisor","canal_preferido":"WhatsApp"}', 480),
    ('Distribuidora Hogar y Acabados Ltda.', 'Sra.', 'Diana', 'Moreno Silva', 'Jefe de Compras', 'Compras', 'dmoreno@hogaryacabados.example', null, '+57 317 555 0108', 'Socio', 'Bogotá', '{"rol_compra":"Comprador","canal_preferido":"Correo"}', 470),
    ('Ferretería El Constructor del Eje', 'Sr.', 'Óscar', 'Giraldo Montoya', 'Propietario', 'Gerencia', 'ogiraldo@constructoreje.example', '+57 606 335 1189', '+57 318 555 0109', 'Llamada entrante', 'Pereira', '{"rol_compra":"Decisor","canal_preferido":"WhatsApp"}', 270),
    ('Grupo Urbano Sabana S.A.', 'Ing.', 'Natalia', 'Rojas Beltrán', 'Directora de Licitaciones', 'Licitaciones', 'nrojas@urbanosabana.example', '+57 601 600 4546', '+57 319 555 0110', 'Web', 'Bogotá', '{"rol_compra":"Decisor","canal_preferido":"Correo"}', 55),
    ('Grupo Urbano Sabana S.A.', 'Arq.', 'Felipe', 'Duarte Niño', 'Arquitecto de Proyecto', 'Diseño', 'fduarte@urbanosabana.example', null, '+57 320 555 0111', 'Web', 'Chía', '{"rol_compra":"Especificador","canal_preferido":"Visita"}', 50),
    ('Clínica Santa Lucía del Sur', 'Ing.', 'Gustavo', 'Salazar Ortiz', 'Jefe de Infraestructura', 'Infraestructura', 'gsalazar@santalucia.example', '+57 602 485 7710', '+57 321 555 0112', 'Licitación', 'Cali', '{"rol_compra":"Influenciador","canal_preferido":"Correo"}', 30),
    ('Estudio Lineal Arquitectos', 'Arq.', 'Valentina', 'Uribe Arango', 'Socia Fundadora', 'Dirección', 'vuribe@estudiolineal.example', '+57 604 322 8091', '+57 322 555 0113', 'Evento', 'Medellín', '{"rol_compra":"Especificador","canal_preferido":"WhatsApp"}', 140),
    ('Centro Comercial Plaza Andina', 'Sr.', 'Mauricio', 'Peña Cárdenas', 'Administrador', 'Administración', 'mpena@plazaandina.example', '+57 607 643 2101', null, 'Llamada entrante', 'Bucaramanga', '{"rol_compra":"Decisor","canal_preferido":"Llamada"}', 18),
    ('Almacenes Casa Viva', 'Sra.', 'Carolina', 'Gómez Salcedo', 'Gerente de Categoría Baños', 'Compras', 'cgomez@casaviva.example', '+57 601 487 6610', '+57 323 555 0114', 'Socio', 'Bogotá', '{"rol_compra":"Decisor","canal_preferido":"Correo"}', 650),
    ('Almacenes Casa Viva', 'Sr.', 'Sebastián', 'Londoño Paz', 'Analista de Abastecimiento', 'Abastecimiento', 'slondono@casaviva.example', null, '+57 324 555 0115', 'Socio', 'Bogotá', '{"rol_compra":"Comprador","canal_preferido":"Correo"}', 600),
    ('Vivienda Futura Caja de Compensación', 'Ing.', 'Alejandra', 'Zapata Muñoz', 'Gerente de Vivienda', 'Vivienda', 'azapata@viviendafutura.example', '+57 604 510 7010', '+57 325 555 0116', 'Evento', 'Medellín', '{"rol_compra":"Decisor","canal_preferido":"Visita"}', 85),
    ('Distribuidora Costa Acabados', 'Sr.', 'Luis Fernando', 'Barrios Ruiz', 'Gerente Comercial', 'Comercial', 'lbarrios@costaacabados.example', '+57 605 385 4411', '+57 300 555 0117', 'Llamada entrante', 'Barranquilla', '{"rol_compra":"Decisor","canal_preferido":"WhatsApp"}', 230)
  ) as v(account, salutation, first_name, last_name, title, department, email, phone, mobile, source, city, cf, age);

  -- Oportunidades: close_offset en días respecto a hoy (negativo = pasado).
  insert into public.opportunities
    (name, account_id, contact_id, pipeline_id, stage_id, amount, close_date, opportunity_type, lead_source,
     next_step, loss_reason, custom_fields, closed_at, is_demo, created_at)
  select v.name,
         a.id,
         (select c.id from public.contacts c where c.account_id = a.id and c.is_demo order by c.created_at limit 1),
         p.id,
         s.id,
         v.amount,
         current_date + v.close_offset,
         v.opp_type,
         v.source,
         v.next_step,
         v.loss_reason,
         v.cf::jsonb,
         case when s.category <> 'open' then (current_date + v.close_offset)::timestamptz + interval '15 hours' end,
         true,
         now() - (v.age || ' days')::interval
  from (values
    ('Altos del Valle · Torre 3 muebles de baño', 'Constructora Altos del Valle S.A.S.', 'Proyectos y constructoras', 'Negociación', 685000000, 12, 'Nuevo negocio', 'Feria', 'Reunión de cierre con gerencia', null, '{"lineas_producto":["Muebles de baño","Lavamanos y superficies"],"proyecto_obra":"Torre 3 Mirador","unidades":168}', 75),
    ('Altos del Valle · Etapa 2 cocinas', 'Constructora Altos del Valle S.A.S.', 'Proyectos y constructoras', 'Cotización enviada', 920000000, 40, 'Ampliación', 'Referido', 'Ajustar cotización con descuento por volumen', null, '{"lineas_producto":["Cocinas"],"proyecto_obra":"Etapa 2 Mirador","unidades":240}', 45),
    ('Altos del Valle · Torre 1 entregada', 'Constructora Altos del Valle S.A.S.', 'Proyectos y constructoras', 'Ganada', 540000000, -95, 'Nuevo negocio', 'Feria', null, null, '{"lineas_producto":["Muebles de baño"],"proyecto_obra":"Torre 1 Mirador","unidades":132}', 260),
    ('Altos del Valle · Torre 2', 'Constructora Altos del Valle S.A.S.', 'Proyectos y constructoras', 'Ganada', 610000000, -38, 'Ampliación', 'Referido', null, null, '{"lineas_producto":["Muebles de baño","Duchas y bañeras"],"proyecto_obra":"Torre 2 Mirador","unidades":150}', 160),
    ('Brisas del Caribe · Condominio Punta Arena', 'Inmobiliaria Brisas del Caribe', 'Proyectos y constructoras', 'Especificación técnica', 1150000000, 70, 'Nuevo negocio', 'Web', 'Visita técnica a obra en Manzanillo', null, '{"lineas_producto":["Muebles de baño","Duchas y bañeras","Accesorios"],"proyecto_obra":"Punta Arena","unidades":96,"competidor":"Importado de China"}', 40),
    ('Brisas del Caribe · Apartahotel Marbella', 'Inmobiliaria Brisas del Caribe', 'Proyectos y constructoras', 'Perdida', 380000000, -52, 'Nuevo negocio', 'Web', null, 'Precio', '{"lineas_producto":["Lavamanos y superficies"],"proyecto_obra":"Marbella","competidor":"Competidor local"}', 140),
    ('Mirador de la Bahía · Remodelación 180 hab.', 'Hotel Mirador de la Bahía', 'Proyectos y constructoras', 'Cotización enviada', 760000000, 25, 'Remodelación', 'Visita en frío', 'Presentar muestra física en el hotel', null, '{"lineas_producto":["Muebles de baño","Duchas y bañeras"],"unidades":180}', 60),
    ('Mirador de la Bahía · Áreas comunes', 'Hotel Mirador de la Bahía', 'Proyectos y constructoras', 'Ganada', 145000000, -12, 'Remodelación', 'Visita en frío', null, null, '{"lineas_producto":["Lavamanos y superficies","Accesorios"]}', 90),
    ('Hogar y Acabados · Pedido trimestral Q4', 'Distribuidora Hogar y Acabados Ltda.', 'Distribución y retail', 'Pedido en negociación', 320000000, 8, 'Reposición', 'Socio', 'Confirmar mezcla de referencias', null, '{"lineas_producto":["Muebles de baño","Accesorios"]}', 20),
    ('Hogar y Acabados · Pedido Q3', 'Distribuidora Hogar y Acabados Ltda.', 'Distribución y retail', 'Ganada', 295000000, -70, 'Reposición', 'Socio', null, null, '{"lineas_producto":["Muebles de baño","Accesorios"]}', 110),
    ('Hogar y Acabados · Exhibición nueva tienda Chía', 'Distribuidora Hogar y Acabados Ltda.', 'Distribución y retail', 'Propuesta comercial', 86000000, 30, 'Nuevo negocio', 'Socio', 'Enviar planimetría de exhibición', null, '{"lineas_producto":["Muebles de baño","Cocinas"]}', 15),
    ('Constructor del Eje · Línea de cocinas', 'Ferretería El Constructor del Eje', 'Distribución y retail', 'Muestras y catálogo', 48000000, 45, 'Nuevo negocio', 'Llamada entrante', 'Entregar muestrario de cocinas', null, '{"lineas_producto":["Cocinas"]}', 25),
    ('Constructor del Eje · Pedido inicial', 'Ferretería El Constructor del Eje', 'Distribución y retail', 'Ganada', 62000000, -150, 'Nuevo negocio', 'Llamada entrante', null, null, '{"lineas_producto":["Muebles de baño"]}', 200),
    ('Urbano Sabana · Torres de Chía', 'Grupo Urbano Sabana S.A.', 'Proyectos y constructoras', 'Calificación', 1480000000, 110, 'Nuevo negocio', 'Web', 'Precalificación en portal de proveedores', null, '{"lineas_producto":["Muebles de baño","Cocinas","Clósets"],"proyecto_obra":"Torres de Chía","unidades":312}', 30),
    ('Santa Lucía · Torre de hospitalización', 'Clínica Santa Lucía del Sur', 'Proyectos y constructoras', 'Prospección', 430000000, 150, 'Nuevo negocio', 'Licitación', 'Solicitar pliegos de la licitación', null, '{"lineas_producto":["Lavamanos y superficies","Accesorios"],"unidades":220}', 12),
    ('Estudio Lineal · Casa Llanogrande', 'Estudio Lineal Arquitectos', 'Proyectos y constructoras', 'Ganada', 58000000, -20, 'Nuevo negocio', 'Evento', null, null, '{"lineas_producto":["Muebles de baño","Clósets"],"proyecto_obra":"Casa Llanogrande"}', 70),
    ('Estudio Lineal · Edificio Provenza', 'Estudio Lineal Arquitectos', 'Proyectos y constructoras', 'Especificación técnica', 210000000, 55, 'Nuevo negocio', 'Evento', 'Enviar fichas técnicas y BIM', null, '{"lineas_producto":["Muebles de baño","Lavamanos y superficies"],"proyecto_obra":"Edificio Provenza","unidades":42}', 22),
    ('Plaza Andina · Baterías sanitarias', 'Centro Comercial Plaza Andina', 'Proyectos y constructoras', 'Prospección', 120000000, 80, 'Remodelación', 'Llamada entrante', 'Agendar visita de levantamiento', null, '{"lineas_producto":["Lavamanos y superficies","Accesorios"]}', 10),
    ('Casa Viva · Surtido 2027 muebles de baño', 'Almacenes Casa Viva', 'Distribución y retail', 'Propuesta comercial', 1350000000, 35, 'Renovación', 'Socio', 'Comité de categoría del cliente', null, '{"lineas_producto":["Muebles de baño","Lavamanos y superficies","Accesorios"]}', 50),
    ('Casa Viva · Temporada fin de año', 'Almacenes Casa Viva', 'Distribución y retail', 'Ganada', 780000000, -5, 'Reposición', 'Socio', null, null, '{"lineas_producto":["Muebles de baño","Accesorios"]}', 65),
    ('Casa Viva · Surtido 2026', 'Almacenes Casa Viva', 'Distribución y retail', 'Ganada', 1120000000, -210, 'Renovación', 'Socio', null, null, '{"lineas_producto":["Muebles de baño","Cocinas"]}', 300),
    ('Casa Viva · Marca propia lavamanos', 'Almacenes Casa Viva', 'Distribución y retail', 'Perdida', 260000000, -120, 'Nuevo negocio', 'Socio', null, 'Importación directa del cliente', '{"lineas_producto":["Lavamanos y superficies"]}', 190),
    ('Vivienda Futura · VIS Bello 600 und.', 'Vivienda Futura Caja de Compensación', 'Proyectos y constructoras', 'Calificación', 980000000, 95, 'Nuevo negocio', 'Evento', 'Presentar portafolio VIS', null, '{"lineas_producto":["Muebles de baño","Cocinas"],"proyecto_obra":"VIS Bello","unidades":600}', 28),
    ('Costa Acabados · Pedido apertura', 'Distribuidora Costa Acabados', 'Distribución y retail', 'Ganada', 74000000, -60, 'Nuevo negocio', 'Llamada entrante', null, null, '{"lineas_producto":["Muebles de baño"]}', 120),
    ('Costa Acabados · Reposición noviembre', 'Distribuidora Costa Acabados', 'Distribución y retail', 'Contacto inicial', 52000000, 20, 'Reposición', 'Llamada entrante', 'Llamar para revisar inventario', null, '{"lineas_producto":["Muebles de baño","Accesorios"]}', 5),
    ('Costa Acabados · Exhibidores', 'Distribuidora Costa Acabados', 'Distribución y retail', 'Perdida', 31000000, -18, 'Nuevo negocio', 'Llamada entrante', null, 'Sin presupuesto', '{"lineas_producto":["Accesorios"]}', 70)
  ) as v(name, account, pipeline, stage, amount, close_offset, opp_type, source, next_step, loss_reason, cf, age)
  join public.accounts a on a.name = v.account and a.is_demo
  join public.pipelines p on p.name = v.pipeline
  join public.pipeline_stages s on s.pipeline_id = p.id and s.name = v.stage;

  -- Actividades
  insert into public.activities
    (activity_type, subject, description, status, priority, due_date, start_at, end_at, location, call_result,
     duration_minutes, account_id, opportunity_id, contact_id, is_demo, created_at)
  select v.activity_type, v.subject, v.description, v.status, v.priority,
         case when v.due_offset is not null then current_date + v.due_offset end,
         -- Reuniones en horario laboral de Bogotá: el desfase en horas se convierte en días + hora (8 a. m.–4 p. m.).
         case when v.start_offset_hours is not null then
           ((current_date + floor(v.start_offset_hours / 24.0)::int)::timestamp
             + make_interval(hours => 8 + (abs(v.start_offset_hours) % 9))) at time zone 'America/Bogota' end,
         case when v.start_offset_hours is not null and v.duration is not null then
           ((current_date + floor(v.start_offset_hours / 24.0)::int)::timestamp
             + make_interval(hours => 8 + (abs(v.start_offset_hours) % 9), mins => v.duration)) at time zone 'America/Bogota' end,
         v.location, v.call_result, v.duration,
         a.id,
         (select o.id from public.opportunities o where o.name = v.opportunity and o.is_demo),
         (select c.id from public.contacts c where c.account_id = a.id and c.is_demo order by c.created_at limit 1),
         true,
         now() - interval '3 days'
  from (values
    ('task', 'Enviar cotización ajustada Torre 3', 'Incluir descuento por volumen del 4 %.', 'pending', 'high', 1, null, null, null, null, 'Constructora Altos del Valle S.A.S.', 'Altos del Valle · Torre 3 muebles de baño'),
    ('meeting', 'Reunión de cierre Torre 3', 'Con gerencia y compras.', 'pending', 'high', null, 50, 60, 'Oficinas Altos del Valle', null, 'Constructora Altos del Valle S.A.S.', 'Altos del Valle · Torre 3 muebles de baño'),
    ('call', 'Seguimiento cotización cocinas', null, 'completed', 'normal', -2, null, 12, null, 'Interesado, pide nueva visita', 'Constructora Altos del Valle S.A.S.', 'Altos del Valle · Etapa 2 cocinas'),
    ('task', 'Preparar fichas técnicas Punta Arena', null, 'in_progress', 'normal', 3, null, null, null, null, 'Inmobiliaria Brisas del Caribe', 'Brisas del Caribe · Condominio Punta Arena'),
    ('meeting', 'Visita técnica obra Manzanillo', 'Levantamiento de medidas de baños tipo.', 'pending', 'normal', null, 120, 120, 'Obra Punta Arena, Cartagena', null, 'Inmobiliaria Brisas del Caribe', 'Brisas del Caribe · Condominio Punta Arena'),
    ('task', 'Llevar muestra física al hotel', null, 'pending', 'high', -1, null, null, null, null, 'Hotel Mirador de la Bahía', 'Mirador de la Bahía · Remodelación 180 hab.'),
    ('call', 'Llamada con gerente de mantenimiento', null, 'completed', 'normal', -4, null, 20, null, 'Confirma presupuesto aprobado', 'Hotel Mirador de la Bahía', 'Mirador de la Bahía · Remodelación 180 hab.'),
    ('email', 'Envío de propuesta de remodelación', 'Se adjunta propuesta y cronograma de instalación.', 'completed', 'normal', -6, null, null, null, null, 'Hotel Mirador de la Bahía', 'Mirador de la Bahía · Remodelación 180 hab.'),
    ('task', 'Confirmar mezcla de referencias pedido Q4', null, 'pending', 'high', 0, null, null, null, null, 'Distribuidora Hogar y Acabados Ltda.', 'Hogar y Acabados · Pedido trimestral Q4'),
    ('meeting', 'Revisión de exhibición tienda Chía', null, 'pending', 'normal', null, 26, 90, 'Tienda Chía', null, 'Distribuidora Hogar y Acabados Ltda.', 'Hogar y Acabados · Exhibición nueva tienda Chía'),
    ('task', 'Entregar muestrario de cocinas', null, 'pending', 'normal', 5, null, null, null, null, 'Ferretería El Constructor del Eje', 'Constructor del Eje · Línea de cocinas'),
    ('task', 'Registrarse en portal de proveedores', null, 'pending', 'high', -3, null, null, null, null, 'Grupo Urbano Sabana S.A.', 'Urbano Sabana · Torres de Chía'),
    ('call', 'Primer contacto licitación clínica', null, 'completed', 'normal', -7, null, 15, null, 'Pliegos salen en dos semanas', 'Clínica Santa Lucía del Sur', 'Santa Lucía · Torre de hospitalización'),
    ('meeting', 'Presentación de portafolio a Estudio Lineal', null, 'completed', 'normal', null, -100, 60, 'Showroom Medellín', null, 'Estudio Lineal Arquitectos', 'Estudio Lineal · Edificio Provenza'),
    ('note', 'Preferencias del cliente', 'Prefiere acabados en roble claro y lavamanos sobreponer.', 'completed', 'normal', null, null, null, null, null, 'Estudio Lineal Arquitectos', null),
    ('task', 'Agendar levantamiento baterías sanitarias', null, 'pending', 'low', 7, null, null, null, null, 'Centro Comercial Plaza Andina', 'Plaza Andina · Baterías sanitarias'),
    ('meeting', 'Comité de categoría Casa Viva', 'Presentar surtido 2027 y plan de exhibición.', 'pending', 'high', null, 74, 120, 'Oficinas Casa Viva, Bogotá', null, 'Almacenes Casa Viva', 'Casa Viva · Surtido 2027 muebles de baño'),
    ('task', 'Enviar análisis de rotación por tienda', null, 'completed', 'normal', -1, null, null, null, null, 'Almacenes Casa Viva', 'Casa Viva · Surtido 2027 muebles de baño'),
    ('call', 'Llamada de revisión de inventario', null, 'pending', 'normal', 2, null, null, null, null, 'Distribuidora Costa Acabados', 'Costa Acabados · Reposición noviembre'),
    ('task', 'Presentar portafolio VIS', null, 'pending', 'normal', 10, null, null, null, null, 'Vivienda Futura Caja de Compensación', 'Vivienda Futura · VIS Bello 600 und.')
  ) as v(activity_type, subject, description, status, priority, due_offset, start_offset_hours, duration, location, call_result, account, opportunity)
  join public.accounts a on a.name = v.account and a.is_demo;
end
$$;

-- TRM de ejemplo (en producción se consulta cada día a la Superfinanciera).
insert into public.exchange_rates (currency, valid_from, rate, source) values ('USD', current_date - 7, 4000, 'Ejemplo')
on conflict do nothing;

do $$
begin
  if exists (select 1 from public.products where is_demo) then
    return;
  end if;

  -- Catálogo genérico de demostración (referencias ficticias).
  insert into public.products (name, product_code, family, unit, description, is_demo) values
  ('Mueble de baño flotante 60 cm', 'DEMO-MB-060', 'Muebles de baño', 'Unidad', 'Mueble flotante con lavamanos integrado, 2 cajones.', true),
  ('Mueble de baño flotante 80 cm', 'DEMO-MB-080', 'Muebles de baño', 'Unidad', 'Mueble flotante con lavamanos integrado, 2 cajones.', true),
  ('Mueble de baño de piso 100 cm', 'DEMO-MB-100', 'Muebles de baño', 'Unidad', 'Mueble de piso doble puerta, acabado roble claro.', true),
  ('Lavamanos de sobreponer redondo', 'DEMO-LV-RD', 'Lavamanos y superficies', 'Unidad', 'Lavamanos en mármol sintético, 40 cm.', true),
  ('Lavamanos de sobreponer rectangular', 'DEMO-LV-RC', 'Lavamanos y superficies', 'Unidad', 'Lavamanos en mármol sintético, 50 x 35 cm.', true),
  ('Superficie de baño a medida', 'DEMO-SF-ML', 'Lavamanos y superficies', 'Metro lineal', 'Superficie en mármol sintético cortada a medida.', true),
  ('Plato de ducha 90 x 90', 'DEMO-DU-090', 'Duchas y bañeras', 'Unidad', 'Plato de ducha antideslizante.', true),
  ('Bañera rectangular 170 cm', 'DEMO-BA-170', 'Duchas y bañeras', 'Unidad', 'Bañera de empotrar.', true),
  ('Hidromasaje 2 personas', 'DEMO-HM-002', 'Hidromasajes', 'Unidad', 'Hidromasaje con 8 jets y calentador.', true),
  ('Cocina integral lineal 2,4 m', 'DEMO-CO-240', 'Cocinas', 'Juego', 'Módulos inferiores y superiores con mesón.', true),
  ('Clóset modular 1,8 m', 'DEMO-CL-180', 'Clósets', 'Unidad', 'Clóset de 3 cuerpos con cajonera.', true),
  ('Espejo con iluminación LED 60 cm', 'DEMO-AC-ESP', 'Accesorios', 'Unidad', 'Espejo con luz LED perimetral.', true),
  ('Kit de accesorios de baño', 'DEMO-AC-KIT', 'Accesorios', 'Juego', 'Toallero, portarrollos y jabonera.', true);

  insert into public.price_book_entries (price_book_id, product_id, unit_price)
  select pb.id, p.id, round(v.price * case when pb.is_standard then 1 else 0.82 end, -3)
  from (values
    ('DEMO-MB-060', 1250000), ('DEMO-MB-080', 1490000), ('DEMO-MB-100', 2150000),
    ('DEMO-LV-RD', 420000), ('DEMO-LV-RC', 465000), ('DEMO-SF-ML', 690000),
    ('DEMO-DU-090', 580000), ('DEMO-BA-170', 1890000), ('DEMO-HM-002', 7850000),
    ('DEMO-CO-240', 6400000), ('DEMO-CL-180', 3200000), ('DEMO-AC-ESP', 540000), ('DEMO-AC-KIT', 260000)
  ) as v(code, price)
  join public.products p on p.product_code = v.code
  cross join public.price_books pb
  where pb.name in ('Lista estándar COP', 'Distribuidores 2026');

  -- Lista propia de un cliente grande: solo sus productos codificados, con precios negociados.
  insert into public.price_books (name, description, is_client_list)
  values ('Casa Viva 2026', 'Productos codificados de Almacenes Casa Viva y sus precios negociados.', true)
  on conflict (name) do nothing;
  insert into public.price_book_entries (price_book_id, product_id, unit_price)
  select (select id from public.price_books where name = 'Casa Viva 2026'), p.id, v.price
  from (values ('DEMO-MB-060', 960000), ('DEMO-MB-080', 1150000), ('DEMO-LV-RD', 320000), ('DEMO-AC-ESP', 410000)) as v(code, price)
  join public.products p on p.product_code = v.code
  on conflict do nothing;
  update public.accounts set price_book_id = (select id from public.price_books where name = 'Casa Viva 2026')
  where name = 'Almacenes Casa Viva' and is_demo;
  update public.accounts set payment_terms = case when account_type = 'Distribuidor' or name = 'Almacenes Casa Viva' then '60 días' else '30 días' end
  where is_demo and account_type <> 'Competidor';

  insert into public.campaigns (name, campaign_type, status, start_date, end_date, budgeted_cost, actual_cost,
                                expected_revenue, expected_response, description, is_demo)
  values
  ('Feria de la construcción 2026', 'Feria', 'Completada', current_date - 120, current_date - 116, 45000000, 41800000, 1500000000, 8,
   'Stand con exhibición de muebles de baño y cocinas.', true),
  ('Showroom arquitectos Medellín', 'Visita showroom', 'En curso', current_date - 20, current_date + 40, 12000000, 6500000, 600000000, 15,
   'Ciclo de visitas guiadas para estudios de arquitectura.', true),
  ('Lanzamiento línea de cocinas', 'Correo', 'Planeada', current_date + 15, current_date + 75, 18000000, null, 900000000, 5,
   'Campaña a distribuidores para la nueva línea de cocinas.', true);

  insert into public.leads (salutation, first_name, last_name, company, title, email, phone, mobile, industry,
                            lead_source, status, rating, city, state, campaign_id, description, is_demo, created_at)
  select v.salutation, v.first_name, v.last_name, v.company, v.title, v.email, null, v.mobile, v.industry, v.source,
         v.status, v.rating, v.city, v.state, (select id from public.campaigns where name = v.campaign and is_demo),
         v.description, true, now() - (v.age || ' days')::interval
  from (values
    ('Arq.', 'Sofía', 'Henao Vélez', 'Estudio Prisma Arquitectura', 'Socia', 'shenao@prisma.example', '+57 310 555 0201', 'Canal Constructores', 'Evento', 'Contactado', 'Caliente', 'Medellín', 'Antioquia', 'Showroom arquitectos Medellín', 'Especifica baños para 3 proyectos residenciales.', 12),
    ('Ing.', 'Tomás', 'Quintero Ríos', 'Constructora Horizonte Verde', 'Director de Compras', 'tquintero@horizonteverde.example', '+57 311 555 0202', 'Canal Constructores', 'Feria', 'Calificado', 'Caliente', 'Rionegro', 'Antioquia', 'Feria de la construcción 2026', 'Proyecto de 180 apartamentos, entrega 2027.', 110),
    ('Sra.', 'Lucía', 'Martínez Pardo', 'Hotel Bahía Serena', 'Jefe de Mantenimiento', 'lmartinez@bahiaserena.example', '+57 312 555 0203', 'Canal Constructores', 'Web', 'Nuevo', 'Templada', 'Santa Marta', 'Magdalena', null, 'Pide catálogo de hidromasajes.', 3),
    ('Sr.', 'Daniel', 'Arango Soto', 'Ferretería La Esquina', 'Propietario', 'darango@laesquina.example', '+57 313 555 0204', 'Canal Distribución', 'Llamada entrante', 'Nuevo', 'Fría', 'Manizales', 'Caldas', null, null, 1),
    ('Ing.', 'Paula', 'Ramírez Gil', 'Inmobiliaria Altamira', 'Gerente de Proyectos', 'pramirez@altamira.example', '+57 314 555 0205', 'Canal Constructores', 'Feria', 'Contactado', 'Templada', 'Bogotá', 'Cundinamarca', 'Feria de la construcción 2026', 'Interesada en cocinas para torre de 90 unidades.', 100),
    ('Sr.', 'Andrés', 'Molina Cruz', 'Distribuidora Sur Acabados', 'Gerente', 'amolina@surabados.example', '+57 315 555 0206', 'Canal Distribución', 'Referido', 'No calificado', 'Fría', 'Pasto', 'Nariño', null, 'Sin cobertura logística por ahora.', 60),
    ('Arq.', 'Juliana', 'Ortega Mesa', 'Taller Norte Diseño', 'Directora', 'jortega@tallernorte.example', '+57 316 555 0207', 'Canal Constructores', 'Evento', 'Nuevo', 'Templada', 'Envigado', 'Antioquia', 'Showroom arquitectos Medellín', null, 6)
  ) as v(salutation, first_name, last_name, company, title, email, mobile, industry, source, status, rating, city, state, campaign, description, age);

  insert into public.campaign_members (campaign_id, lead_id, status)
  select l.campaign_id, l.id, case when l.status in ('Contactado', 'Calificado') then 'Asistió' else 'Enviado' end
  from public.leads l where l.is_demo and l.campaign_id is not null;

  insert into public.campaign_members (campaign_id, contact_id, status)
  select (select id from public.campaigns where name = 'Showroom arquitectos Medellín' and is_demo), c.id, 'Respondió'
  from public.contacts c where c.is_demo and c.email in ('vuribe@estudiolineal.example', 'jcardona@altosdelvalle.example');

  update public.opportunities set campaign_id = (select id from public.campaigns where name = 'Feria de la construcción 2026' and is_demo)
  where is_demo and lead_source = 'Feria';

  -- Cotizaciones con líneas
  insert into public.quotes (name, opportunity_id, status, expiration_date, payment_terms, payment_terms_manual, delivery_terms, is_demo, created_at)
  select v.name, o.id, v.status, current_date + v.exp, v.payment, true, v.delivery, true, now() - (v.age || ' days')::interval
  from (values
    ('Torre 3 · propuesta muebles de baño', 'Altos del Valle · Torre 3 muebles de baño', 'Presentada', 20, '50 % anticipo, saldo contra entrega', 'Entregas por piso según cronograma de obra', 15),
    ('Remodelación 180 habitaciones · opción A', 'Mirador de la Bahía · Remodelación 180 hab.', 'Borrador', 25, '30 días', 'Instalación incluida', 6),
    ('Surtido 2027 · propuesta inicial', 'Casa Viva · Surtido 2027 muebles de baño', 'Borrador', 30, '60 días', 'Entrega en centro de distribución', 2)
  ) as v(name, opp, status, exp, payment, delivery, age)
  join public.opportunities o on o.name = v.opp and o.is_demo;

  insert into public.quote_line_items (quote_id, product_id, description, quantity, unit_price, discount, sort_order)
  select q.id, p.id, p.name, v.qty, e.unit_price, v.discount, v.ord
  from (values
    ('Torre 3 · propuesta muebles de baño', 'DEMO-MB-060', 168, 6, 1),
    ('Torre 3 · propuesta muebles de baño', 'DEMO-AC-ESP', 168, 6, 2),
    ('Torre 3 · propuesta muebles de baño', 'DEMO-DU-090', 168, 4, 3),
    ('Remodelación 180 habitaciones · opción A', 'DEMO-MB-080', 180, 20, 1),
    ('Remodelación 180 habitaciones · opción A', 'DEMO-LV-RC', 180, 18, 2),
    ('Remodelación 180 habitaciones · opción A', 'DEMO-AC-KIT', 180, 10, 3),
    ('Surtido 2027 · propuesta inicial', 'DEMO-MB-060', 400, 0, 1),
    ('Surtido 2027 · propuesta inicial', 'DEMO-MB-080', 300, 0, 2),
    ('Surtido 2027 · propuesta inicial', 'DEMO-LV-RD', 500, 0, 3)
  ) as v(quote, code, qty, discount, ord)
  join public.quotes q on q.name = v.quote and q.is_demo
  join public.products p on p.product_code = v.code
  join public.price_book_entries e on e.product_id = p.id and e.price_book_id = q.price_book_id;

  -- Casos de servicio
  insert into public.cases (subject, description, status, priority, origin, case_type, account_id, contact_id, product_id, resolution, is_demo, created_at)
  select v.subject, v.description, v.status, v.priority, v.origin, v.case_type, a.id,
         (select c.id from public.contacts c where c.account_id = a.id and c.is_demo order by c.created_at limit 1),
         (select id from public.products where product_code = v.code), v.resolution, true, now() - (v.age || ' days')::interval
  from (values
    ('Puerta de mueble desalineada en apto 504', 'El residente reporta que la puerta no cierra bien.', 'En proceso', 'Media', 'WhatsApp', 'Garantía', 'Constructora Altos del Valle S.A.S.', 'DEMO-MB-060', null, 4),
    ('Solicitud de visita de instalación torre 2', null, 'Nuevo', 'Alta', 'Correo', 'Instalación', 'Constructora Altos del Valle S.A.S.', null, null, 1),
    ('Lavamanos con fisura en entrega', 'Llegaron 3 unidades con fisura en el borde.', 'Escalado', 'Alta', 'Distribuidor', 'Reclamo', 'Distribuidora Hogar y Acabados Ltda.', 'DEMO-LV-RC', null, 9),
    ('Consulta de ficha técnica de hidromasaje', null, 'Cerrado', 'Baja', 'Teléfono', 'Consulta técnica', 'Hotel Mirador de la Bahía', 'DEMO-HM-002', 'Se envió ficha técnica y plano de instalación.', 20),
    ('Repuesto de bisagras para clóset', null, 'En espera', 'Baja', 'Web', 'Repuestos', 'Almacenes Casa Viva', 'DEMO-CL-180', null, 7)
  ) as v(subject, description, status, priority, origin, case_type, account, code, resolution, age)
  join public.accounts a on a.name = v.account and a.is_demo;

  insert into public.activities (activity_type, subject, status, priority, due_date, lead_id, is_demo)
  select 'call', 'Llamar para agendar visita al showroom', 'pending', 'high', current_date + 1, l.id, true
  from public.leads l where l.is_demo and l.company = 'Estudio Prisma Arquitectura';
  insert into public.activities (activity_type, subject, status, priority, due_date, case_id, is_demo)
  select 'task', 'Programar visita técnica de garantía', 'pending', 'normal', current_date + 2, c.id, true
  from public.cases c where c.is_demo and c.subject like 'Puerta de mueble%';
end
$$;

-- ===========================================================================
-- Fase 6: metas de compañía de ejemplo (periodo actual)
-- ===========================================================================
insert into public.sales_goals (user_id, metric, period_type, period_start, target)
select null, v.metric, v.period_type,
       date_trunc(case v.period_type when 'month' then 'month' when 'quarter' then 'quarter' else 'year' end,
                  (now() at time zone 'America/Bogota'))::date,
       v.target
from (values
  ('won_amount', 'month', 1500000000),
  ('won_amount', 'quarter', 4500000000),
  ('won_amount', 'year', 15000000000),
  ('new_leads', 'month', 20),
  ('activities_completed', 'month', 120)
) as v(metric, period_type, target)
where not exists (
  select 1 from public.sales_goals g
  where g.user_id is null and g.metric = v.metric and g.period_type = v.period_type
    and g.period_start = date_trunc(case v.period_type when 'month' then 'month' when 'quarter' then 'quarter' else 'year' end,
                                    (now() at time zone 'America/Bogota'))::date
);

-- ===========================================================================
-- Fase 10: pedido de ejemplo en producción (Torre 2 de Altos del Valle)
-- ===========================================================================
do $$
declare
  v_order uuid;
begin
  if exists (select 1 from public.orders where is_demo)
     or not exists (select 1 from public.opportunities where name = 'Altos del Valle · Torre 2' and is_demo) then
    return;
  end if;
  insert into public.orders (name, opportunity_id, account_id, order_date, requested_delivery_date, customer_po,
                             payment_terms, delivery_terms, shipping_address, is_demo)
  select 'Torre 2 · muebles de baño y duchas', o.id, o.account_id, o.close_date + 3, o.close_date + 75, 'OC-AV-2026-118',
         '50 % anticipo, saldo contra entrega', 'Entregas por piso según cronograma de obra', 'Obra Altos del Valle Torre 2, Envigado', true
  from public.opportunities o where o.name = 'Altos del Valle · Torre 2' and o.is_demo
  returning id into v_order;

  insert into public.order_items (order_id, product_id, description, quantity, unit_price, discount, sort_order)
  select v_order, p.id, p.name, v.qty, e.unit_price, v.discount, v.ord
  from (values ('DEMO-MB-060', 120, 8, 1), ('DEMO-DU-090', 120, 5, 2), ('DEMO-AC-ESP', 120, 0, 3)) as v(code, qty, discount, ord)
  join public.products p on p.product_code = v.code
  join public.price_book_entries e on e.product_id = p.id
  join public.price_books b on b.id = e.price_book_id and b.is_standard;

  update public.orders set status = 'En producción' where id = v_order;
end
$$;
