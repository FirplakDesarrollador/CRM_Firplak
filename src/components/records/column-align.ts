import type { FieldDef } from "@/lib/objects";

/**
 * Alineación de una columna de tabla según el tipo de campo. La usan el título (`th`) y el dato (`td`),
 * para que siempre coincidan: montos, números y porcentajes a la derecha (las cifras se comparan por sus
 * unidades); Sí/No al centro, bajo su título; lo demás a la izquierda.
 */
export function columnAlign(type: FieldDef["type"]): "text-right" | "text-center" | undefined {
  if (type === "currency" || type === "number" || type === "percent") return "text-right";
  if (type === "checkbox") return "text-center";
  return undefined;
}
