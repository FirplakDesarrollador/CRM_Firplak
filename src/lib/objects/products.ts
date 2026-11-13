import type { ObjectDef } from "./types";
import { PRODUCT_FAMILIES, PRODUCT_UNITS } from "./picklists";

/** Planta de todos los kits: sus componentes vienen de plantas distintas. */
export const KIT_PLANT = "KIT";

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
  searchColumns: ["name", "product_code", "family", "plant", "item_group"],
  defaultColumns: ["name", "product_code", "is_kit", "family", "plant", "item_group", "unit", "is_active"],
  defaultSort: { field: "name", dir: "asc" },
  highlightFields: ["product_code", "is_kit", "family", "plant", "item_group", "unit", "is_active"],
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
    // Planta y Grupo de Artículo: el administrador define sus valores en Configuración → Listas de valores, donde también
    // puede hacerlos depender de Familia. En un kit no dependen de Familia y la planta es siempre «KIT» (lo fija la base).
    { name: "plant", label: "Planta", type: "select", options: [KIT_PLANT], section: "info", dependencyOffWhen: "is_kit",
      help: "En un kit la planta siempre es KIT: se asigna sola al guardar." },
    { name: "item_group", label: "Grupo de Artículo", type: "select", options: [], section: "info", dependencyOffWhen: "is_kit" },
    { name: "unit", label: "Unidad de medida", type: "select", options: PRODUCT_UNITS, required: true, section: "info" },
    { name: "is_kit", label: "Kit", type: "checkbox", section: "info",
      help: "Un kit es una referencia de venta formada por varios componentes. Al guardarlo, agrega sus componentes en la ficha." },
    { name: "is_active", label: "Activo", type: "checkbox", section: "info" },
    { name: "description", label: "Descripción", type: "textarea", wide: true, section: "description" },
    { name: "created_at", label: "Creado", type: "datetime", readOnly: true, formHidden: true, section: "system" },
    { name: "updated_at", label: "Última modificación", type: "datetime", readOnly: true, formHidden: true, section: "system" },
  ],
};
