import { parseAmount } from "./form";

/**
 * Línea sin producto del catálogo de una cotización o un pedido de Carpintería de Obra: una tipología escrita a
 * mano, con su valor. Exige las dos cosas (el precio no puede salir de una lista).
 */
export function freeLine(fd: FormData): { description: string; unit_price: number } | { errors: Record<string, string> } {
  const description = String(fd.get("description") ?? "").trim();
  if (!description) return { errors: { description: "Escribe la tipología (p. ej. «Cocina en L · Apto tipo B»)." } };
  const unitPrice = parseAmount(String(fd.get("unit_price") ?? "").trim());
  if (unitPrice === null || unitPrice < 0) return { errors: { unit_price: "Escribe el valor de la tipología." } };
  return { description, unit_price: unitPrice };
}
