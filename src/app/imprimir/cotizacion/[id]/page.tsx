import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PrintSheet } from "@/components/print/PrintSheet";
import { loadPrintQuote, printPdfName } from "@/lib/print/documento";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Cotización" };

export default async function PrintQuotePage({ params }: PageProps<"/imprimir/cotizacion/[id]">) {
  const [{ id }, user] = await Promise.all([params, getCurrentUser()]);
  if (!user) redirect("/login");
  const doc = await loadPrintQuote(id);
  if (!doc) notFound();
  return <PrintSheet doc={doc} pdfUrl={`/imprimir/cotizacion/${id}/pdf`} fileName={printPdfName(doc.number, "cotizacion")} />;
}
