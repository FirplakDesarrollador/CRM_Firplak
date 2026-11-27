import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PrintSheet } from "@/components/print/PrintSheet";
import { loadPrintOrder, printPdfName } from "@/lib/print/documento";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Pedido" };

export default async function PrintOrderPage({ params }: PageProps<"/imprimir/pedido/[id]">) {
  const [{ id }, user] = await Promise.all([params, getCurrentUser()]);
  if (!user) redirect("/login");
  const doc = await loadPrintOrder(id);
  if (!doc) notFound();
  return <PrintSheet doc={doc} pdfUrl={`/imprimir/pedido/${id}/pdf`} fileName={printPdfName(doc.number, "pedido")} />;
}
