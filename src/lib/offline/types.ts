// Lo que «Preparar el día» deja en el dispositivo para consultar sin señal. La forma es la que devuelve
// public.offline_snapshot() (supabase/migrations/20261206000100_offline_snapshot.sql).

export type OfflineAccount = {
  id: string;
  name: string;
  account_number: string | null;
  account_type: string | null;
  /** Canal. */
  industry: string | null;
  market: string | null;
  segment: string | null;
  tax_id: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  rating: string | null;
  payment_terms: string | null;
  /** Lista de precios propia del cliente, si tiene. */
  price_book_id: string | null;
  sap_card_code: string | null;
  owner_id: string | null;
  billing_street: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_country: string | null;
  shipping_street: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_country: string | null;
};

export type OfflineContact = {
  id: string;
  account_id: string | null;
  full_name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
};

export type OfflineOpportunity = {
  id: string;
  name: string;
  account_id: string | null;
  contact_id: string | null;
  amount: number | null;
  currency: string | null;
  close_date: string | null;
  next_step: string | null;
  probability: number | null;
  stage: string | null;
  stage_color: string | null;
};

export type OfflineActivity = {
  id: string;
  activity_type: string;
  subject: string;
  description: string | null;
  status: string;
  priority: string | null;
  due_date: string | null;
  start_at: string | null;
  end_at: string | null;
  location: string | null;
  account_id: string | null;
  contact_id: string | null;
  opportunity_id: string | null;
  lead_id: string | null;
  account_name: string | null;
  contact_name: string | null;
  opportunity_name: string | null;
  lead_name: string | null;
};

export type OfflineProduct = {
  id: string;
  name: string;
  product_code: string | null;
  family: string | null;
  unit: string | null;
  description: string | null;
};

export type OfflineBook = {
  id: string;
  name: string;
  market: string;
  channel: string | null;
  currency: string;
  is_client_list: boolean;
};

/** Precio compacto: [lista, producto, precio]. */
export type OfflinePrice = [string, string, number];

export type OfflineSnapshot = {
  version: number;
  generated_at: string;
  /** Día en Bogotá en que se generó (AAAA-MM-DD). */
  today: string;
  user: { id: string; name: string } | null;
  accounts: OfflineAccount[];
  contacts: OfflineContact[];
  opportunities: OfflineOpportunity[];
  activities: OfflineActivity[];
  products: OfflineProduct[];
  price_books: OfflineBook[];
  prices: OfflinePrice[];
};

/** Resumen de la descarga: se lee sin cargar todo lo descargado. */
export type OfflineMeta = {
  userId: string;
  userName: string;
  /** Cuándo se guardó en este dispositivo (ms). */
  savedAt: number;
  locale: "es" | "en";
  /** Traducciones de valores de listas y etapas (solo en inglés). */
  labels: Record<string, string>;
  counts: { accounts: number; contacts: number; opportunities: number; activities: number; products: number };
};
