"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Printer } from "lucide-react";

import { Tr } from "@/components/ui/Tr";

// En el iPhone, con el CRM instalado en la pantalla de inicio, `window.print()` no hace nada (en Safari y en la app
// de Xcode sí abre el diálogo). Allí el botón comparte la cotización como archivo PDF: la hoja de compartir de iOS
// ofrece Imprimir, Guardar en Archivos, correo y demás. En el resto de equipos sigue el diálogo de imprimir.
const noop = () => () => undefined;
const sharesFiles = () =>
  (navigator as Navigator & { standalone?: boolean }).standalone === true &&
  typeof navigator.share === "function" &&
  typeof navigator.canShare === "function";

export function PrintButton({ pdfUrl, fileName }: { pdfUrl: string; fileName: string }) {
  const share = useSyncExternalStore(noop, sharesFiles, () => false);
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<"load" | "share" | null>(null);
  const [attempt, setAttempt] = useState(0);

  // El PDF se pide al abrir la página y no al tocar: iOS solo deja compartir justo después del toque, y si antes
  // hay que esperar al servidor ese permiso ya venció.
  useEffect(() => {
    if (!share) return;
    const controller = new AbortController();
    fetch(pdfUrl, { signal: controller.signal, cache: "no-store" })
      .then(async (res) => {
        // Sin sesión el CRM responde con la página de ingreso: eso no es el PDF.
        if (!res.ok || !res.headers.get("content-type")?.startsWith("application/pdf")) throw new Error("pdf");
        setFile(new File([await res.blob()], fileName, { type: "application/pdf" }));
      })
      .catch(() => {
        if (!controller.signal.aborted) setProblem("load");
      });
    return () => controller.abort();
  }, [share, pdfUrl, fileName, attempt]);

  async function onClick() {
    if (!share) {
      window.print();
      return;
    }
    if (problem === "load") {
      setProblem(null);
      setAttempt((n) => n + 1);
      return;
    }
    if (!file) return;
    try {
      if (!navigator.canShare({ files: [file] })) throw new Error("share");
      setProblem(null);
      await navigator.share({ files: [file] });
    } catch (error) {
      // Cerrar la hoja de compartir sin elegir nada no es un error.
      if ((error as { name?: string } | null)?.name !== "AbortError") setProblem("share");
    }
  }

  const preparing = share && !file && problem !== "load";
  return (
    <>
      {problem && (
        <p role="status" className="text-sm text-[var(--ink-700)]">
          <Tr>{problem === "load" ? "No se pudo preparar el PDF. Toca el botón para reintentar." : "No se pudo compartir el PDF. Vuelve a intentarlo."}</Tr>
        </p>
      )}
      <button type="button" className="btn btn-primary" onClick={onClick} disabled={preparing} aria-busy={preparing || undefined}>
        <Printer size={15} /> <Tr>{preparing ? "Preparando el PDF…" : "Imprimir o guardar PDF"}</Tr>
      </button>
    </>
  );
}
