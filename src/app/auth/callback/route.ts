import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { applyProfileAppearance } from "@/lib/appearance";

/** Destino de los enlaces de confirmación, invitación y recuperación de Supabase Auth. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextParam = searchParams.get("next") ?? "/";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  const supabase = await createClient();
  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  }

  if (ok) {
    const { data } = await supabase.auth.getUser();
    if (data.user) await applyProfileAppearance(supabase, data.user.id);
  }

  const destination = type === "recovery" || type === "invite" ? "/auth/restablecer" : next;
  return NextResponse.redirect(new URL(ok ? destination : "/login?error=link", origin));
}
