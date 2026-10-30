"use client";

import { Tr } from "@/components/ui/Tr";

export default function CrmError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card mx-auto max-w-lg p-8 text-center">
      <h1 className="text-lg font-medium"><Tr>Algo salió mal</Tr></h1>
      <p className="mt-1 text-sm text-muted">{error.message || "Error inesperado al cargar la página."}</p>
      <button type="button" onClick={reset} className="btn btn-primary mt-5"><Tr>Reintentar</Tr></button>
    </div>
  );
}
