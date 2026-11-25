import { Logo } from "@/components/brand/Logo";
import { BrandBackdrop } from "@/components/brand/BrandBackdrop";
import { Alert } from "@/components/ui/Alert";
import { hasSupabaseEnv } from "@/lib/env";

import { Tr } from "@/components/ui/Tr";
import "./foto-ingreso.css";

/** El formulario va en una tarjeta de vidrio sobre una foto de producto; el panel azul de la izquierda no cambia. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <BrandBackdrop />
      <aside className="shell-chrome shell-bar relative hidden overflow-hidden p-12 lg:flex lg:flex-col lg:justify-between">
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
      <main className="foto-ingreso">
        {/* En celular no hay panel azul al lado: el azul, el logo y la frase van arriba y se funden con la foto. */}
        <div className="foto-ingreso-marca lg:hidden">
          {/* El logo esconde su «CRM» en pantallas angostas (no cabe en la cabecera del CRM); aquí sí va. */}
          <span className="foto-ingreso-logo">
            <Logo height={34} label={false} onDark />
            <span>CRM</span>
          </span>
          <p className="editorial">Cada proyecto, cada distribuidor y cada visita, en un solo lugar.</p>
        </div>
        <div className="foto-ingreso-tarjeta">
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
        <p className="foto-ingreso-pie lg:hidden"><Tr>Uso interno · Firplak</Tr></p>
      </main>
    </div>
  );
}
