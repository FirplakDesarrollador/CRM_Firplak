// Traducciones al inglés. Las claves son el texto en español: si una frase no está
// aquí, se muestra en español (respaldo seguro para pantallas aún no traducidas).

export const OBJECTS_EN: Record<string, { label: string; plural: string }> = {
  accounts: { label: "Account", plural: "Accounts" },
  contacts: { label: "Contact", plural: "Contacts" },
  opportunities: { label: "Opportunity", plural: "Opportunities" },
  activities: { label: "Activity", plural: "Activities" },
  leads: { label: "Lead", plural: "Leads" },
  products: { label: "Product", plural: "Products" },
  quotes: { label: "Quote", plural: "Quotes" },
  cases: { label: "Case", plural: "Cases" },
  campaigns: { label: "Campaign", plural: "Campaigns" },
};

export const FIELDS_EN: Record<string, string> = {
  account_id: "Account", account_number: "Account number", account_type: "Type", actual_cost: "Actual cost", amount: "Amount",
  annual_revenue: "Annual revenue", bill_to_name: "Bill to", billing_address: "Billing address", billing_city: "Billing city",
  billing_country: "Billing country", billing_state: "Billing state", billing_street: "Billing street", birthdate: "Birthdate",
  budgeted_cost: "Budgeted cost", call_result: "Call result", campaign_id: "Campaign", campaign_type: "Type", case_id: "Case",
  case_number: "Case number", case_type: "Type", city: "City", close_date: "Close date", closed_at: "Closed on", company: "Company",
  completed_at: "Completed on", contact_id: "Contact", converted_account_id: "Account", converted_at: "Converted on",
  converted_contact_id: "Contact", converted_opportunity_id: "Opportunity", country: "Country", created_at: "Created",
  delivery_terms: "Delivery terms", department: "Department", description: "Description", discount_total: "Discounts",
  do_not_call: "Do not call", due_date: "Due date", duration_minutes: "Duration (min)", email_opt_out: "Email opt out",
  email: "Email", employees: "Employees", end_at: "End", end_date: "End date", expected_response: "Expected response",
  expected_revenue: "Expected revenue", expiration_date: "Expiration date", family: "Product family", first_name: "First name",
  full_name: "Name", grand_total: "Grand total", industry: "Industry", is_active: "Active", is_closed: "Closed",
  is_converted: "Converted", is_synced: "Synced with opportunity", is_won: "Won", last_name: "Last name", lead_id: "Lead",
  lead_source: "Lead source", location: "Location", loss_reason: "Loss reason", mailing_city: "City", mailing_country: "Country",
  mailing_state: "State", mailing_street: "Street", mobile: "Mobile", name: "Name", net_total: "Net total", next_step: "Next step",
  opportunity_id: "Opportunity", opportunity_type: "Type", origin: "Origin", owner_id: "Owner", parent_account_id: "Parent account",
  parent_id: "Parent campaign", payment_terms: "Payment terms", phone: "Phone", pipeline_id: "Pipeline", price_book_id: "Price book",
  priority: "Priority", probability: "Probability (%)", product_code: "Product code", product_id: "Product", quote_number: "Quote number",
  rating: "Rating", reports_to_id: "Reports to", resolution: "Resolution", salutation: "Salutation", segment: "Segment",
  shipping_address: "Shipping address", shipping_city: "Shipping city", shipping_country: "Shipping country",
  shipping_state: "Shipping state", shipping_street: "Shipping street", shipping: "Shipping", stage_id: "Stage", start_at: "Start",
  start_date: "Start date", state: "State", status: "Status", street: "Street", subject: "Subject", subtotal: "Subtotal",
  tax_id: "Tax ID (NIT)", tax_rate: "VAT (%)", tax: "VAT", title: "Title", unit: "Unit of measure", updated_at: "Last modified",
  website: "Website", forecast_category: "Forecast category", activity_type: "Type",
};

export const FIELD_OVERRIDES_EN: Record<string, string> = {
  "accounts.name": "Account name", "opportunities.name": "Opportunity name", "quotes.name": "Quote name",
  "campaigns.name": "Campaign name", "products.name": "Product name", "activities.owner_id": "Assigned to",
  "opportunities.contact_id": "Primary contact", "opportunities.campaign_id": "Primary campaign source",
  "cases.created_at": "Opened on", "quotes.description": "Notes", "quotes.contact_id": "Contact",
};

export const SECTIONS_EN: Record<string, string> = {
  address: "Address", budget: "Budget and goals", company: "Company and address", conversion: "Conversion",
  custom: "Additional information", description: "Description", forecast: "Forecast", related: "Related to",
  system: "System", terms: "Terms and billing", totals: "Totals",
};

export const OPTION_LABELS_EN: Record<string, string> = {
  task: "Task", call: "Call", meeting: "Meeting", email: "Email", note: "Note",
  pending: "Pending", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled",
  high: "High", normal: "Normal", low: "Low",
  pipeline: "Pipeline", best_case: "Best case", commit: "Commit", closed: "Closed", omitted: "Omitted",
};

export const PHRASES_EN: Record<string, string> = {
  // Navegación y cabecera
  Inicio: "Home", Indicadores: "Dashboards", Informes: "Reports", Configuración: "Setup",
  "Buscar cuentas, contactos, oportunidades…": "Search accounts, contacts, opportunities…",
  Nuevo: "New", Crear: "Create", Prospecto: "Lead", Cuenta: "Account", Contacto: "Contact", Oportunidad: "Opportunity", Caso: "Case", Actividad: "Activity", "Mis preferencias": "My preferences", "Mi perfil": "My profile",
  "Plantillas de correo": "Email templates", "Cerrar sesión": "Log out", Notificaciones: "Notifications",
  "Marcar todas como leídas": "Mark all as read", "Sin notificaciones.": "No notifications.", "Sin perfil": "No profile",
  // Listas
  "Buscar en esta lista…": "Search this list…", Todos: "All", Míos: "Mine", Filtros: "Filters", Columnas: "Columns",
  "Guardar vista": "Save view", "Agregar filtro": "Add filter", Cancelar: "Cancel", "Aplicar filtros": "Apply filters",
  Aplicar: "Apply", "Quitar todos": "Clear all", "Sin filtros. Agrega uno para acotar la lista.": "No filters. Add one to narrow the list.",
  "Columnas visibles (la primera enlaza al registro)": "Visible columns (the first one links to the record)",
  "Nombre de la vista": "View name", "Compartir con todos": "Share with everyone", Guardar: "Save", "Eliminar vista": "Delete view",
  "Guardar como nueva": "Save as new", Compartida: "Shared", "Vistas de lista": "List views", "Exportar CSV": "Export CSV",
  "No hay registros que coincidan con esta vista.": "No records match this view.", registros: "records", de: "of", Página: "Page",
  Anterior: "Previous", Siguiente: "Next", Campo: "Field", Operador: "Operator", Valor: "Value", "Selecciona…": "Select…",
  Sí: "Yes", No: "No", Días: "Days",
  // Fichas y formularios
  Relacionado: "Related", Detalles: "Details", "Historial de cambios": "Change history", "Historial de etapas": "Stage history",
  Cotizaciones: "Quotes", Productos: "Products", Precios: "Prices", Resultados: "Results", Editar: "Edit", Eliminar: "Delete",
  "— Ninguno —": "— None —", "— Yo —": "— Me —", "Buscar…": "Search…", "Sin resultados": "No results", "Buscando…": "Searching…",
  "Campo obligatorio": "Required field", "Revisa los campos marcados.": "Please review the highlighted fields.",
  "Guardando…": "Saving…", Volver: "Back", "Ver todo": "View all", "Sin registros relacionados.": "No related records.",
};

// Operadores de filtro
export const OPS_EN: Record<string, string> = {
  eq: "equals", neq: "not equal to", contains: "contains", starts: "starts with", empty: "is empty", not_empty: "is not empty",
  gt: "greater than", gte: "greater or equal", lt: "less than", lte: "less or equal", today: "is today", this_week: "this week",
  this_month: "this month", this_quarter: "this quarter", this_year: "this year", last_n_days: "last N days",
  next_n_days: "next N days", overdue: "overdue", me: "is me",
};
