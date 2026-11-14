"use client";

import { useState } from "react";
import { CloudDownload, RefreshCw, WifiOff } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { useLocale, useT } from "@/lib/i18n/client";
import { addDaysISO, dayISO, formatDate, formatTime, plural, todayISO } from "@/lib/format";
import { OFFLINE_PATH, prepareDay, SessionExpiredError } from "@/lib/offline/download";
import { useOfflineMeta, useOnline } from "./useOffline";

type Problem = "session" | "failed" | "shell";

/**
 * «Preparar el día»: baja al dispositivo los clientes, la agenda y los precios del asesor para consultarlos sin
 * señal, y dice cuándo se bajaron por última vez. Va en Inicio y en la pantalla que muestra lo descargado.
 */
export function PrepareDayCard({ linkToOffline = false }: { linkToOffline?: boolean }) {
  const t = useT();
  const locale = useLocale();
  const online = useOnline();
  const { meta, ready } = useOfflineMeta();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  const download = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const result = await prepareDay();
      if (result && !result.shell) setProblem("shell");
    } catch (err) {
      setProblem(err instanceof SessionExpiredError ? "session" : "failed");
    } finally {
      setBusy(false);
    }
  };

  if (!ready) {
    return (
      <div className="glass flex items-center gap-3 p-3" aria-hidden="true">
        <span className="skeleton h-5 w-5 flex-none" />
        <span className="skeleton h-4 w-56 max-w-full" />
      </div>
    );
  }

  const today = todayISO();
  const day = meta ? dayISO(meta.savedAt) : null;
  const stale = day !== null && day !== today;
  let when = "";
  if (meta && day) {
    const time = formatTime(new Date(meta.savedAt).toISOString(), locale);
    if (day === today) when = `${t("Descargado hoy")}, ${time}`;
    else if (day === addDaysISO(today, -1)) when = `${t("Descargado ayer")}, ${time}`;
    else when = `${t("Descargado el")} ${formatDate(day, locale)}, ${time}`;
  }
  const counts = meta
    ? [
        `${meta.counts.accounts} ${t(plural(meta.counts.accounts, "cliente", "clientes"))}`,
        `${meta.counts.activities} ${t(plural(meta.counts.activities, "actividad", "actividades"))}`,
        `${meta.counts.products} ${t(plural(meta.counts.products, "producto", "productos"))}`,
      ].join(" · ")
    : "";
  // Sin descarga, o con una de otro día, descargar es lo principal; con la de hoy es solo refrescar.
  const fresh = meta !== null && !stale;

  return (
    <section className="glass flex flex-wrap items-center gap-x-3 gap-y-2.5 p-3" aria-label={t("Consulta sin señal")}>
      <CloudDownload size={20} className="flex-none text-[var(--brand)]" aria-hidden="true" />
      <div className="min-w-0 flex-1 basis-52 text-sm" role="status">
        {meta ? (
          <>
            <p className="font-semibold">
              {when}
              {stale && <span className="font-medium text-warning"> · {t("Actualiza antes de salir.")}</span>}
            </p>
            <p className="text-xs text-muted">{counts}</p>
          </>
        ) : (
          <p>{t("Descarga tus clientes, agenda y precios para consultarlos sin señal.")}</p>
        )}
        {!online && <p className="text-xs text-muted">{t("Necesitas conexión para descargar.")}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {linkToOffline && meta && (
          // Enlace normal, no <Link>: la navegación completa es la que el service worker puede atender sin red.
          <a href={OFFLINE_PATH} className="btn btn-sm btn-offline"><WifiOff size={14} aria-hidden="true" />{t("Modo Offline")}</a>
        )}
        <button type="button" className={`btn btn-sm ${fresh ? "" : "btn-primary"}`} onClick={download} disabled={busy || !online}>
          {fresh ? <RefreshCw size={14} aria-hidden="true" /> : <CloudDownload size={14} aria-hidden="true" />}
          {busy ? t("Descargando…") : fresh ? t("Actualizar") : t("Preparar el día")}
        </button>
      </div>
      {problem && (
        <div className="basis-full">
          {problem === "session" && (
            <Alert tone="warning">
              {t("Tu sesión venció.")} <a href="/login" className="link">{t("Inicia sesión")}</a> {t("para preparar el día.")}
            </Alert>
          )}
          {problem === "failed" && <Alert tone="error">{t("No se pudo descargar. Revisa tu conexión e inténtalo de nuevo.")}</Alert>}
          {problem === "shell" && (
            <Alert tone="warning">{t("Los datos quedaron en este dispositivo, pero la pantalla para verlos sin señal no se guardó. Vuelve a intentarlo.")}</Alert>
          )}
        </div>
      )}
    </section>
  );
}
