import { renderToBuffer } from "@react-pdf/renderer";
import { getCurrentUser } from "@/lib/session";
import { loadPrintQuote, quotePdfName } from "../datos";
import { cotizacionPdf } from "./CotizacionPdf";

/**
 * La cotización como archivo PDF. Lo usa el botón «Imprimir o guardar PDF» en el iPhone con el CRM instalado, donde
 * el diálogo de imprimir no abre: el archivo se comparte y desde ahí se imprime o se guarda. Exige sesión y lee
 * con los permisos del usuario, igual que la vista previa; no se guarda en caché (trae datos del cliente).
 */
export async function GET(_request: Request, ctx: RouteContext<"/imprimir/cotizacion/[id]/pdf">) {
  const [{ id }, user] = await Promise.all([ctx.params, getCurrentUser()]);
  if (!user) return Response.json({ error: "No autenticado" }, { status: 401 });
  const quote = await loadPrintQuote(id);
  if (!quote) return Response.json({ error: "Cotización no encontrada" }, { status: 404 });

  const pdf = await renderToBuffer(cotizacionPdf(quote));
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${quotePdfName(quote.q.quote_number)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
