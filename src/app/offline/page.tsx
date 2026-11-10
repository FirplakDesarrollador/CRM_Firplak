import type { Metadata } from "next";
import Image from "next/image";
import { WifiOff } from "lucide-react";
import markWhite from "../../../public/brand/firplak-mark-white.png";
import { RetryButton } from "@/components/pwa/RetryButton";

export const metadata: Metadata = { title: "Sin conexión" };

/** Se muestra desde la app instalada cuando no hay internet (la guarda el service worker). */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--navy-700)] px-6 text-[var(--cream-100)]">
      <div className="max-w-sm space-y-5 text-center">
        <Image src={markWhite} alt="Firplak" width={64} height={65} className="mx-auto" priority />
        <WifiOff size={28} className="mx-auto opacity-80" />
        <h1 className="text-xl font-medium">Sin conexión</h1>
        <p className="text-sm leading-relaxed text-[#c5d2da]">
          El CRM necesita internet para mostrar información actualizada. Revisa tu conexión de datos o wifi y vuelve a intentar.
          Lo que estabas escribiendo en un registro o una actividad no se envió, pero quedó como borrador en este
          dispositivo: vuelve a abrir el formulario cuando haya internet.
        </p>
        <RetryButton />
      </div>
    </main>
  );
}
