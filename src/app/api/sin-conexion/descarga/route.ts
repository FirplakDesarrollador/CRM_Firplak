import { NextResponse } from "next/server";
import { getDataLabels, getLocale } from "@/lib/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

/**
 * «Preparar el día»: lo que el asesor consulta sin señal (sus clientes, contactos, oportunidades abiertas y
 * agenda, con el catálogo y los precios), tal como está en este momento. Lo guarda el dispositivo.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const supabase = await createClient();
  const [{ data: snapshot, error }, locale, labels] = await Promise.all([supabase.rpc("offline_snapshot"), getLocale(), getDataLabels()]);
  if (error || !snapshot) {
    if (error) console.error("offline_snapshot", error.message);
    return NextResponse.json({ error: "No se pudo preparar la descarga" }, { status: 500 });
  }
  return NextResponse.json({ snapshot, locale, labels }, { headers: { "Cache-Control": "no-store" } });
}
