/** Campos combinables en plantillas de correo. */
export const MERGE_FIELDS: { key: string; label: string }[] = [
  { key: "contacto.nombre", label: "Nombre del contacto" },
  { key: "contacto.nombre_completo", label: "Nombre completo del contacto" },
  { key: "contacto.cargo", label: "Cargo del contacto" },
  { key: "cuenta.nombre", label: "Nombre de la cuenta / empresa" },
  { key: "oportunidad.nombre", label: "Nombre de la oportunidad" },
  { key: "oportunidad.valor", label: "Valor de la oportunidad" },
  { key: "oportunidad.fecha_cierre", label: "Fecha de cierre" },
  { key: "caso.numero", label: "Número de caso" },
  { key: "caso.asunto", label: "Asunto del caso" },
  { key: "usuario.nombre", label: "Tu nombre" },
  { key: "usuario.cargo", label: "Tu cargo" },
  { key: "usuario.telefono", label: "Tu teléfono" },
  { key: "usuario.correo", label: "Tu correo" },
  { key: "fecha", label: "Fecha de hoy" },
];

/** Reemplaza {{campo}} por su valor; los campos sin dato quedan vacíos. */
export function renderTemplate(text: string, data: Record<string, string>) {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => data[key] ?? "");
}
