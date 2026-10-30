// Listas de valores estándar. Las listas propias de Firplak se agregan como campos
// personalizados desde Configuración → Campos personalizados.

export const ACCOUNT_TYPES = ["Prospecto", "Cliente", "Distribuidor", "Partner", "Competidor", "Otro"];
export const INDUSTRIES = [
  "Construcción", "Inmobiliario", "Vivienda social", "Hotelería", "Salud", "Educación", "Retail", "Comercio",
  "Distribución de materiales", "Ferretería", "Arquitectura y diseño", "Gobierno", "Otro",
];
export const SEGMENTS = ["Grandes cuentas", "Empresarial", "Canal", "Institucional", "Prescriptor", "Pyme"];
export const RATINGS = ["Caliente", "Templada", "Fría"];
export const SALUTATIONS = ["Sr.", "Sra.", "Ing.", "Arq.", "Dr.", "Dra."];
export const LEAD_SOURCES = [
  "Web", "Feria", "Evento", "Referido", "Socio", "Llamada entrante", "Visita en frío", "Licitación",
  "Redes sociales", "Showroom", "Otro",
];
export const OPPORTUNITY_TYPES = ["Nuevo negocio", "Ampliación", "Renovación", "Reposición", "Remodelación"];
export const LOSS_REASONS = [
  "Precio", "Plazo de entrega", "Competidor", "Sin presupuesto", "Proyecto cancelado",
  "Importación directa del cliente", "Especificación técnica", "Otro",
];
export const FORECAST_CATEGORIES: Record<string, string> = {
  pipeline: "Pipeline",
  best_case: "Mejor caso",
  commit: "Compromiso",
  closed: "Cerrada",
  omitted: "Omitida",
};
export const ACTIVITY_TYPES: Record<string, string> = {
  task: "Tarea",
  call: "Llamada",
  meeting: "Reunión",
  email: "Correo",
  note: "Nota",
};
export const ACTIVITY_STATUSES: Record<string, string> = {
  pending: "Pendiente",
  in_progress: "En curso",
  completed: "Completada",
  cancelled: "Cancelada",
};
export const PRIORITIES: Record<string, string> = { high: "Alta", normal: "Normal", low: "Baja" };
export const CALL_RESULTS = [
  "Contactado", "Interesado", "Pide nueva visita", "Sin respuesta", "Buzón de voz", "Número equivocado", "No interesado",
];
export const DEPARTMENTS_CO = [
  "Amazonas", "Antioquia", "Arauca", "Atlántico", "Bogotá D.C.", "Bolívar", "Boyacá", "Caldas", "Caquetá", "Casanare",
  "Cauca", "Cesar", "Chocó", "Córdoba", "Cundinamarca", "Guainía", "Guaviare", "Huila", "La Guajira", "Magdalena",
  "Meta", "Nariño", "Norte de Santander", "Putumayo", "Quindío", "Risaralda", "San Andrés y Providencia", "Santander",
  "Sucre", "Tolima", "Valle del Cauca", "Vaupés", "Vichada",
];

// Fase 2
export const LEAD_STATUSES = ["Nuevo", "Contactado", "Calificado", "No calificado", "Convertido"];
export const CAMPAIGN_TYPES = ["Feria", "Evento", "Visita showroom", "Correo", "Webinar", "Publicidad", "Referidos", "Otro"];
export const CAMPAIGN_STATUSES = ["Planeada", "En curso", "Completada", "Cancelada"];
export const CAMPAIGN_MEMBER_STATUSES = ["Enviado", "Respondió", "Asistió", "No asistió"];
export const PRODUCT_FAMILIES = [
  "Muebles de baño", "Lavamanos y superficies", "Duchas y bañeras", "Hidromasajes", "Cocinas", "Clósets", "Accesorios",
];
export const PRODUCT_UNITS = ["Unidad", "Juego", "Metro lineal", "m²"];
export const QUOTE_STATUSES = ["Borrador", "En revisión", "Presentada", "Aceptada", "Rechazada"];
export const CASE_STATUSES = ["Nuevo", "En proceso", "En espera", "Escalado", "Cerrado"];
export const CASE_PRIORITIES = ["Alta", "Media", "Baja"];
export const CASE_ORIGINS = ["Teléfono", "Correo", "WhatsApp", "Web", "Visita", "Distribuidor"];
export const CASE_TYPES = ["Garantía", "Instalación", "Reclamo", "Consulta técnica", "Repuestos", "Otro"];
