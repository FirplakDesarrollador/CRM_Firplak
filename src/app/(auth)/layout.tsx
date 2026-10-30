import Image from "next/image";
import { Logo } from "@/components/brand/Logo";
import { Alert } from "@/components/ui/Alert";
import { hasSupabaseEnv } from "@/lib/env";
import markWhite from "../../../public/brand/firplak-mark-white.png";

import { Tr } from "@/components/ui/Tr";
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-[var(--navy-700)] p-12 text-[var(--cream-100)] lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(40rem 30rem at 15% 10%, rgba(116,144,148,0.28), transparent 60%), radial-gradient(36rem 28rem at 90% 90%, rgba(20,38,50,0.6), transparent 60%)",
          }}
        />
        <Image
          src={markWhite}
          alt=""
          aria-hidden
          width={420}
          height={428}
          className="pointer-events-none absolute -bottom-16 -right-16 opacity-[0.06]"
        />
        <div className="relative">
          <Logo height={44} onDark label={false} />
        </div>
        <div className="relative max-w-md">
          <p className="text-[0.72rem] font-medium uppercase tracking-[0.18em] text-[var(--sage-300)]"><Tr>CRM comercial</Tr></p>
          <p className="editorial mt-4 text-4xl leading-tight">
            Cada proyecto, cada distribuidor y cada visita, en un solo lugar.
          </p>
          <p className="mt-5 text-[0.95rem] leading-relaxed text-[#c5d2da]">
            Gestiona cuentas, oportunidades y actividades comerciales, y sigue el pipeline y las metas del equipo en tiempo real.
          </p>
        </div>
        <p className="relative text-xs text-[#c5d2da]"><Tr>Uso interno · Firplak</Tr></p>
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
