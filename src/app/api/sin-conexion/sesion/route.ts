import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";

/** Quién tiene la sesión abierta. La pantalla sin conexión lo pregunta al volver la señal para borrar lo descargado si ya no es esa persona. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  return NextResponse.json({ userId: user.id }, { headers: { "Cache-Control": "no-store" } });
}
