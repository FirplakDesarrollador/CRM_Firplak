import { NextResponse } from "next/server";
import { getDataLabels, getLocale } from "@/lib/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { getObjectDef } from "@/lib/records/data";
import { createClient } from "@/lib/supabase/server";

/**
 * «Preparar el día»: lo que el asesor consulta sin señal (sus clientes, contactos, oportunidades abiertas y
 * agenda, con el catálogo y los precios), tal como está en este momento. Lo guarda el dispositivo.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const supabase = await createClient();
  const [{ data: snapshot, error }, locale, labels, accountDef] = await Promise.all([
    supabase.rpc("offline_snapshot"), getLocale(), getDataLabels(), getObjectDef("accounts"),
  ]);
  if (error || !snapshot) {
    if (error) console.error("offline_snapshot", error.message);
    return NextResponse.json({ error: "No se pudo preparar la descarga" }, { status: 500 });
  }
  // Las listas del formulario «Nuevo cliente», por si en Configuración cambiaron sus valores.
  const list = (name: string) => accountDef.fields.find((f) => f.name === name)?.options ?? [];
  const options = { account_type: list("account_type"), industry: list("industry"), market: list("market") };
  return NextResponse.json({ snapshot, locale, labels, options }, { headers: { "Cache-Control": "no-store" } });
}
