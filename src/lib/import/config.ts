import type { ObjectKey } from "@/lib/objects";

export const IMPORTABLE: ObjectKey[] = ["accounts", "contacts", "leads", "opportunities", "products"];

/** Campos que sirven para encontrar registros existentes al actualizar. */
export const MATCH_FIELDS: Partial<Record<ObjectKey, string[]>> = {
  accounts: ["sap_card_code", "tax_id", "account_number", "name"],
  contacts: ["email", "full_name"],
  leads: ["email"],
  opportunities: ["name"],
  products: ["product_code", "name"],
};

export const CHUNK_SIZE = 200;
export const MAX_ROWS = 5000;

/**
 * Encabezados habituales de las exportaciones de SAP Business One (nombres técnicos y de la
 * interfaz en español) → campo del CRM. Se usan cuando la columna no coincide con una etiqueta.
 * En contactos y oportunidades, el CardCode enlaza la cuenta por su código SAP.
 */
export const HEADER_ALIASES: Partial<Record<ObjectKey, Record<string, string>>> = {
  accounts: {
    CardCode: "sap_card_code", "Código SN": "sap_card_code", "Código de socio de negocios": "sap_card_code", "Código SAP": "sap_card_code",
    CardName: "name", "Nombre SN": "name", "Nombre de socio de negocios": "name", "Razón social": "name",
    LicTradNum: "tax_id", "Número de identificación fiscal": "tax_id", "ID fiscal": "tax_id",
    Phone1: "phone", "Teléfono 1": "phone", E_Mail: "email", "Correo electrónico": "email",
    Address: "billing_street", "Dirección": "billing_street", City: "billing_city", Ciudad: "billing_city",
    State1: "billing_state", Departamento: "billing_state", Country: "billing_country", "País": "billing_country",
    SlpName: "owner_id", "Empleado del departamento de ventas": "owner_id", Vendedor: "owner_id",
  },
  contacts: {
    CardCode: "account_id", "Código SN": "account_id", CardName: "account_id", "Nombre SN": "account_id",
    FirstName: "first_name", "Nombre de pila": "first_name", LastName: "last_name", Apellido: "last_name",
    E_MailL: "email", "Correo electrónico": "email", Tel1: "phone", "Teléfono 1": "phone", Cellolar: "mobile", "Teléfono móvil": "mobile",
    Position: "title", Cargo: "title",
  },
  opportunities: { CardCode: "account_id", "Código SN": "account_id", CardName: "account_id", "Nombre SN": "account_id" },
  products: {
    ItemCode: "product_code", "Número de artículo": "product_code", "Código de artículo": "product_code",
    ItemName: "name", "Descripción del artículo": "name",
  },
};
