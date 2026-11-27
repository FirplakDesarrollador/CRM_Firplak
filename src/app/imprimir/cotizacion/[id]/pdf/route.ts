import { renderToBuffer } from "@react-pdf/renderer";
import { documentoPdf } from "@/lib/print/DocumentoPdf";
import { loadPrintQuote, printPdfName } from "@/lib/print/documento";
import { getCurrentUser } from "@/lib/session";

/**
 * La cotización como archivo PDF. Lo usa el botón «Imprimir o guardar PDF» en el iPhone con el CRM instalado, donde
 * el diálogo de imprimir no abre: el archivo se comparte y desde ahí se imprime o se guarda. Exige sesión y lee
 * con los permisos del usuario, igual que la vista previa; no se guarda en caché (trae datos del cliente).
 */
export async function GET(_request: Request, ctx: RouteContext<"/imprimir/cotizacion/[id]/pdf">) {
  const [{ id }, user] = await Promise.all([ctx.params, getCurrentUser()]);
  if (!user) return Response.json({ error: "No autenticado" }, { status: 401 });
  const doc = await loadPrintQuote(id);
  if (!doc) return Response.json({ error: "Cotización no encontrada" }, { status: 404 });

  const pdf = await renderToBuffer(documentoPdf(doc));
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${printPdfName(doc.number, "cotizacion")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
