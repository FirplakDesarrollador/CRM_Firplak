"use client";

import Link from "next/link";
import { Tr } from "@/components/ui/Tr";

/**
 * Error al cargar una página del CRM. En producción Next.js oculta el mensaje real de los errores del servidor
 * (llega en inglés y genérico), así que se explica qué hacer y se muestra el código para soporte; el mensaje
 * técnico solo aparece en desarrollo.
 */
export default function CrmError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card mx-auto max-w-lg p-8 text-center">
      <h1 className="text-lg font-medium"><Tr>No se pudo cargar esta página</Tr></h1>
      <p className="mt-1 text-sm text-muted">
        <Tr>Puede ser la conexión o un error del CRM. Vuelve a intentarlo; si sigue pasando, comparte el código con soporte.</Tr>
      </p>
      {error.digest && <p className="mt-2 text-xs text-muted"><Tr>Código:</Tr> <code>{error.digest}</code></p>}
      {process.env.NODE_ENV !== "production" && error.message && <p className="mt-2 text-xs text-danger">{error.message}</p>}
      <div className="mt-5 flex justify-center gap-2">
        <button type="button" onClick={reset} className="btn btn-primary"><Tr>Reintentar</Tr></button>
        <Link href="/inicio" className="btn"><Tr>Ir al inicio</Tr></Link>
      </div>
    </div>
  );
}
