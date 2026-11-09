import type { PermissionObject } from "@/lib/permissions";

export type ObjectKey =
  | "accounts" | "contacts" | "opportunities" | "activities"
  | "leads" | "products" | "quotes" | "orders" | "cases" | "campaigns";

export type FieldType =
  | "text" | "textarea" | "email" | "phone" | "url"
  | "number" | "currency" | "percent"
  | "date" | "datetime"
  | "select" | "multiselect" | "checkbox"
  | "lookup" | "user" | "stage";

export type FieldDef = {
  /** Columna de la tabla, o `cf.<api_name>` para campos personalizados. */
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
  optionLabels?: Record<string, string>;
  /** Objeto destino de una búsqueda (lookup). */
  lookup?: ObjectKey;
  /** Alias de la relación embebida en el select (p. ej. `account`). */
  relation?: string;
  section?: string;
  /** Calculado o de sistema: se muestra pero no se edita. */
  readOnly?: boolean;
  /** No aparece en el formulario de creación/edición. */
  formHidden?: boolean;
  /** No aparece al crear, solo al editar (p. ej. «Motivo de pérdida» en una oportunidad nueva). */
  createHidden?: boolean;
  /** Ocupa todo el ancho en el formulario. */
  wide?: boolean;
  help?: string;
  custom?: boolean;
  /** Etiqueta y ayuda en inglés de un campo personalizado (Configuración → Campos). */
  labelEn?: string;
  helpEn?: string;
  /** Se puede ordenar la lista por este campo. */
  sortable?: boolean;
  /**
   * Lista dependiente: por cada lista que la controla, los valores permitidos para cada valor de esa
   * lista. Un valor se puede elegir si corresponde a lo elegido en todas.
   */
  dependsOn?: { field: string; optionsByController: Record<string, string[]> }[];
  /** Moneda fija del valor (p. ej. «USD»), o columna del registro que la indica (`currencyField`). */
  currencyCode?: string;
  currencyField?: string;
  /** En el formulario, solo aparece cuando la moneda del registro (según el Mercado de la cuenta) es esta. */
  formCurrency?: "COP" | "USD";
  /** En el detalle, no se muestra si está vacío. */
  hideEmpty?: boolean;
  /** Solo en el formulario (p. ej. una casilla que habilita otro campo); no se muestra en el detalle. */
  formOnly?: boolean;
  /**
   * Parte de una dirección: País (lista), Departamento y Ciudad (listas de Colombia, dependientes; texto
   * libre en otros países). `geo` nombra los campos de país y departamento de la misma dirección.
   */
  geoRole?: "country" | "state" | "city";
  geo?: { country: string; state: string };
  /** Se elige de una lista que viene de la base (p. ej. las listas de precios de cliente). Guarda el id. */
  choices?: "clientPriceBooks";
  /**
   * Se toma de la cuenta elegida en el campo `from` (la base lo calcula al guardar). En el formulario se ve sin
   * editar; con `manualFlag` (casilla del mismo formulario) se puede escribir a mano.
   */
  derived?: { from: string };
  manualFlag?: string;
  /** Búsqueda limitada a la cuenta elegida en ese campo del formulario (p. ej. oportunidades de la cuenta). */
  lookupFilter?: string;
  /** Se llena con la cuenta del registro elegido en ese campo (p. ej. la cuenta de la oportunidad). */
  fillFrom?: string;
};

export type ObjectDef = {
  key: ObjectKey;
  table: string;
  label: string;
  plural: string;
  path: string;
  permission: PermissionObject;
  nameField: string;
  /** false para objetos sin propietario (catálogo de productos). */
  hasOwner?: boolean;
  /** Select de PostgREST con las relaciones embebidas. */
  select: string;
  searchColumns: string[];
  defaultColumns: string[];
  defaultSort: { field: string; dir: "asc" | "desc" };
  highlightFields: string[];
  sections: { key: string; label: string }[];
  fields: FieldDef[];
};

export type FilterOp =
  | "eq" | "neq" | "contains" | "starts" | "empty" | "not_empty"
  | "gt" | "gte" | "lt" | "lte"
  | "today" | "this_week" | "this_month" | "this_quarter" | "this_year"
  | "last_n_days" | "next_n_days" | "overdue" | "me";

export type Filter = { field: string; op: FilterOp; value: string };

export type ListDefinition = {
  filters?: Filter[];
  columns?: string[];
  sort?: { field: string; dir: "asc" | "desc" };
  scope?: "mine" | "team" | "all";
};

export type CustomFieldRow = {
  id: string;
  object: string;
  api_name: string;
  label: string;
  label_en?: string | null;
  field_type: string;
  options: unknown;
  option_labels_en?: unknown;
  is_required: boolean;
  show_in_list: boolean;
  help_text: string | null;
  help_text_en?: string | null;
  sort_order: number;
  is_active: boolean;
};
