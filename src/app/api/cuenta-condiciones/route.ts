import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

/** Calle, ciudad, departamento y país en una línea (igual que public.format_address en la base). */
function address(...parts: (string | null | undefined)[]) {
  return parts.map((p) => p?.trim()).filter(Boolean).join(", ") || null;
}

/**
 * Lo que una cotización toma de la cuenta: /api/cuenta-condiciones?id=<cuenta>. Sirve para mostrarlo en el
 * formulario al elegir la cuenta; al guardar, la base lo vuelve a calcular.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Cuenta no válida" }, { status: 400 });
  const supabase = await createClient();
  const { data: a } = await supabase
    .from("accounts")
    .select("billing_street, billing_city, billing_state, billing_country, shipping_street, shipping_city, shipping_state, shipping_country, payment_terms")
    .eq("id", id)
    .maybeSingle();
  if (!a) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
  const billing = address(a.billing_street, a.billing_city, a.billing_state, a.billing_country);
  return NextResponse.json({
    billing_address: billing,
    shipping_address: address(a.shipping_street, a.shipping_city, a.shipping_state, a.shipping_country) ?? billing,
    payment_terms: a.payment_terms ?? null,
  });
}
