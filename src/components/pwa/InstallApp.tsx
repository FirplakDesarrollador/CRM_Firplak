"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, Share, Smartphone, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const noSubscribe = () => () => {};
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

function useInstall() {
  const [prompt, setPrompt] = useState<PromptEvent | null>(null);
  const [justInstalled, setJustInstalled] = useState(false);
  // Datos del dispositivo: en el servidor no existen (false); en el navegador se leen al hidratar.
  const standalone = useSyncExternalStore(noSubscribe, isStandalone, () => false);
  const ios = useSyncExternalStore(noSubscribe, isIos, () => false);
  const installed = standalone || justInstalled;
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as PromptEvent); };
    const onInstalled = () => { setJustInstalled(true); setPrompt(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    setPrompt(null);
  };
  return { prompt, installed, ios, install };
}

/** Mis preferencias: instalar el CRM como app en el celular o el computador. */
export function InstallApp() {
  const t = useT();
  const { prompt, installed, ios, install } = useInstall();
  return (
    <div className="space-y-2 rounded-[14px] border border-line p-4">
      <p className="flex items-center gap-2 text-sm font-semibold"><Smartphone size={16} /> {t("App en el celular")}</p>
      {installed ? (
        <p className="text-sm text-success">{t("Ya estás usando el CRM como app instalada.")}</p>
      ) : (
        <>
          <p className="text-sm text-muted">{t("Instala el CRM para abrirlo desde la pantalla de inicio, a pantalla completa y con accesos directos a actividades, pipeline y cuentas.")}</p>
          {prompt && <button type="button" className="btn btn-primary btn-sm" onClick={install}><Download size={14} /> {t("Instalar app")}</button>}
          {ios && <p className="flex items-center gap-1.5 text-sm">{t("En iPhone: abre el CRM en Safari, toca")} <Share size={14} aria-label={t("Compartir")} /> {t("y luego «Agregar a inicio».")}</p>}
          {!prompt && !ios && <p className="text-xs text-muted">{t("En Android (Chrome): menú ⋮ → «Instalar app». En el computador (Chrome o Edge): ícono de instalar en la barra de direcciones.")}</p>}
        </>
      )}
    </div>
  );
}

/** Aviso en Inicio (solo celular) cuando el navegador ofrece instalar; se puede descartar. */
export function InstallBanner() {
  const t = useT();
  const { prompt, installed, install } = useInstall();
  // El aviso solo aparece cuando el navegador ofrece instalar (nunca en el servidor), así que leer
  // el almacenamiento local al iniciar no cambia lo que se hidrata.
  const [hidden, setHidden] = useState(() => {
    try { return typeof window !== "undefined" && localStorage.getItem("fp-install-dismissed") === "1"; } catch { return false; }
  });
  if (installed || hidden || !prompt) return null;
  const dismiss = () => {
    setHidden(true);
    try { localStorage.setItem("fp-install-dismissed", "1"); } catch { /* sin almacenamiento local */ }
  };
  return (
    <div className="glass flex items-center gap-3 p-3 md:hidden">
      <Smartphone size={20} className="flex-none text-[var(--brand)]" />
      <p className="min-w-0 flex-1 text-sm">{t("Instala el CRM en tu celular para abrirlo como una app.")}</p>
      <button type="button" className="btn btn-primary btn-sm" onClick={install}>{t("Instalar")}</button>
      <button type="button" className="btn btn-icon btn-ghost" onClick={dismiss} aria-label={t("Cerrar")}><X size={16} /></button>
    </div>
  );
}
