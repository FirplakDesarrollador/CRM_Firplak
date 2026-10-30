import type { ObjectDef } from "./types";
import { PRODUCT_FAMILIES, PRODUCT_UNITS } from "./picklists";

export const products: ObjectDef = {
  key: "products",
  table: "products",
  label: "Producto",
  plural: "Productos",
  path: "/productos",
  permission: "products",
  nameField: "name",
  hasOwner: false,
  select: "*",
  searchColumns: ["name", "product_code", "family"],
  defaultColumns: ["name", "product_code", "family", "unit", "is_active"],
  defaultSort: { field: "name", dir: "asc" },
  highlightFields: ["product_code", "family", "unit", "is_active"],
  sections: [
    { key: "info", label: "Información del producto" },
    { key: "custom", label: "Información adicional" },
    { key: "description", label: "Descripción" },
    { key: "system", label: "Sistema" },
  ],
  fields: [
    { name: "name", label: "Nombre del producto", type: "text", required: true, section: "info" },
    { name: "product_code", label: "Referencia", type: "text", section: "info" },
    { name: "family", label: "Familia", type: "select", options: PRODUCT_FAMILIES, section: "info" },
    { name: "unit", label: "Unidad de medida", type: "select", options: PRODUCT_UNITS, required: true, section: "info" },
    { name: "is_active", label: "Activo", type: "checkbox", section: "info" },
    { name: "description", label: "Descripción", type: "textarea", wide: true, section: "description" },
    { name: "created_at", label: "Creado", type: "datetime", readOnly: true, formHidden: true, section: "system" },
    { name: "updated_at", label: "Última modificación", type: "datetime", readOnly: true, formHidden: true, section: "system" },
  ],
};
