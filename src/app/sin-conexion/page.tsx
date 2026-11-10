import type { Metadata } from "next";
import { cookies } from "next/headers";
import { OfflineApp } from "@/components/offline/OfflineApp";

export const metadata: Metadata = { title: "Consulta sin señal" };

/**
 * Lo que el asesor descargó con «Preparar el día», para consultarlo sin señal. La página no trae datos del
 * servidor: los lee del dispositivo. Por eso es pública y su HTML se puede guardar para abrirla sin red.
 */
export default async function OfflineDataPage() {
  const locale = (await cookies()).get("fp-lang")?.value === "en" ? "en" : "es";
  return <OfflineApp initialLocale={locale} />;
}
