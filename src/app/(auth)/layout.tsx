import Image from "next/image";
import { Logo } from "@/components/brand/Logo";
import { LiquidBackdrop } from "@/components/brand/LiquidBackdrop";
import { Alert } from "@/components/ui/Alert";
import { hasSupabaseEnv } from "@/lib/env";
import markWhite from "../../../public/brand/firplak-mark-white.png";

import { Tr } from "@/components/ui/Tr";
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <LiquidBackdrop />
      <aside className="shell-chrome shell-bar relative hidden overflow-hidden p-12 lg:flex lg:flex-col lg:justify-between">
        <Image
          src={markWhite}
          alt=""
          aria-hidden
          width={420}
          height={428}
          className="pointer-events-none absolute -bottom-16 -right-16 opacity-[0.06]"
        />
        <div className="relative">
          <Logo height={44} onDark />
        </div>
        <div className="relative max-w-md">
          <p className="editorial text-4xl leading-tight">
            Cada proyecto, cada distribuidor y cada visita, en un solo lugar.
          </p>
          <p className="mt-5 text-[0.95rem] leading-relaxed text-ink-2">
            Gestiona cuentas, oportunidades y actividades comerciales, y sigue el pipeline y las metas del equipo en tiempo real.
          </p>
        </div>
        <p className="relative text-xs text-ink-2"><Tr>Uso interno · Firplak</Tr></p>
      </aside>
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="glass w-full max-w-sm p-7">
          <div className="mb-7">
            <Logo height={34} label={false} />
          </div>
          {!hasSupabaseEnv() && (
            <div className="mb-5">
              <Alert tone="warning">
                Falta configurar Supabase. Copia <code>.env.example</code> como <code>.env.local</code>, completa la URL y
                la anon key y reinicia el servidor.
              </Alert>
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
