"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, LogIn, WifiOff } from "lucide-react";
import { BrandBackdrop, BrandGlyph } from "@/components/brand/BrandBackdrop";
import { Alert } from "@/components/ui/Alert";
import type { Locale } from "@/lib/i18n";
import { I18nProvider, useT } from "@/lib/i18n/client";
import { isSignedOut } from "@/lib/offline/download";
import { clearOffline, sweepOffline } from "@/lib/offline/store";
import type { OfflineSnapshot } from "@/lib/offline/types";
import { agendaGroups, OfflineAgenda } from "./OfflineAgenda";
import { OfflineClient, OfflineClients } from "./OfflineClients";
import { OfflineOpportunities } from "./OfflineOpportunities";
import { OfflineProducts } from "./OfflineProducts";
import { PrepareDayCard } from "./PrepareDayCard";
import { go, useRoute, VIEWS, type View } from "./route";
import { useOfflineData, useOnline } from "./useOffline";

const TAB_LABELS: Record<View, string> = { agenda: "Agenda", clientes: "Clientes", oportunidades: "Oportunidades", productos: "Productos" };

/**
 * Con red, comprueba quién tiene la sesión: si nadie, lo descargado se borra; si es otra persona, también.
 * Un fallo de red no cuenta: sin señal no se puede saber y lo descargado se sigue mostrando.
 */
function useSessionCheck(online: boolean) {
  const [signedOut, setSignedOut] = useState(false);
  useEffect(() => {
    if (!online) return;
    let alive = true;
    fetch("/api/sin-conexion/sesion", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        if (isSignedOut(response)) {
          await clearOffline();
          if (alive) setSignedOut(true);
          return;
        }
        if (!response.ok) return;
        const { userId } = (await response.json()) as { userId?: string };
        if (!userId) return;
        await sweepOffline(userId);
        if (alive) setSignedOut(false);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [online]);
  return signedOut;
}

function Downloaded({ snapshot }: { snapshot: OfflineSnapshot }) {
  const t = useT();
  const route = useRoute();
  const accounts = useMemo(() => new Map(snapshot.accounts.map((a) => [a.id, a])), [snapshot.accounts]);
  const known = useMemo(() => new Set(accounts.keys()), [accounts]);
  const client = route.view === "clientes" && route.client ? accounts.get(route.client) : undefined;
  // En un teléfono las cuatro pestañas no caben: la que está abierta se trae a la vista.
  useEffect(() => {
    const tab = document.getElementById(`pestana-${route.view}`);
    const strip = tab?.parentElement;
    if (!tab || !strip) return;
    const left = tab.offsetLeft - strip.offsetLeft;
    if (left < strip.scrollLeft) strip.scrollLeft = left;
    else if (left + tab.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = left + tab.offsetWidth - strip.clientWidth;
  }, [route.view]);
  const counts: Record<View, number> = {
    agenda: agendaGroups(snapshot.activities).reduce((n, g) => n + g.items.length, 0),
    clientes: snapshot.accounts.length,
    oportunidades: snapshot.opportunities.length,
    productos: snapshot.products.length,
  };
  return (
    <>
      <div role="tablist" aria-label={t("Lo descargado")} className="flex overflow-x-auto border-b border-line px-1">
        {VIEWS.map((view) => (
          <button
            key={view}
            type="button"
            role="tab"
            id={`pestana-${view}`}
            aria-selected={route.view === view}
            aria-controls="panel-sin-conexion"
            className="tab"
            onClick={() => go({ v: view, c: null })}
          >
            {t(TAB_LABELS[view])} <span className="badge num">{counts[view]}</span>
          </button>
        ))}
      </div>
      <div id="panel-sin-conexion" role="tabpanel" aria-labelledby={`pestana-${route.view}`} className="flex flex-col gap-4">
        {route.view === "agenda" && <OfflineAgenda activities={snapshot.activities} known={known} />}
        {route.view === "clientes" && (client
          ? <OfflineClient account={client} snapshot={snapshot} known={known} />
          : <OfflineClients accounts={snapshot.accounts} />)}
        {route.view === "oportunidades" && <OfflineOpportunities opportunities={snapshot.opportunities} accounts={accounts} />}
        {route.view === "productos" && <OfflineProducts snapshot={snapshot} selection={route.prices} />}
      </div>
    </>
  );
}

function Screen({ snapshot, ready }: { snapshot: OfflineSnapshot | null; ready: boolean }) {
  const t = useT();
  const online = useOnline();
  const route = useRoute();
  const signedOut = useSessionCheck(online);
  return (
    <div className="min-h-dvh">
      <BrandBackdrop />
      <header className="shell-chrome shell-bar sticky top-0 z-30 pt-[var(--safe-top)]">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <BrandGlyph size={26} />
          <h1 className="min-w-0 flex-1 truncate text-base font-medium">{t("Consulta sin señal")}</h1>
          {!online && <span className="badge badge-warning"><WifiOff size={12} aria-hidden="true" /> {t("Sin señal")}</span>}
          {online && !signedOut && (
            // Enlace normal: vuelve al CRM con una carga completa, que trae la sesión y los datos al día.
            <a href={route.back} className="btn btn-sm btn-ghost"><ArrowLeft size={14} aria-hidden="true" /> {t("Volver al CRM")}</a>
          )}
        </div>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-5">
        {signedOut ? (
          <>
            <Alert tone="warning">{t("Tu sesión se cerró y lo descargado en este dispositivo se borró. Inicia sesión para volver a preparar el día.")}</Alert>
            <a href="/login" className="btn btn-primary self-start"><LogIn size={15} aria-hidden="true" /> {t("Iniciar sesión")}</a>
          </>
        ) : (
          <>
            <PrepareDayCard />
            {!ready && (
              <div className="card flex flex-col gap-3 p-4" aria-hidden="true">
                <span className="skeleton h-4 w-2/3" />
                <span className="skeleton h-4 w-1/2" />
                <span className="skeleton h-4 w-3/5" />
              </div>
            )}
            {ready && !snapshot && (
              <div className="card px-5 py-10 text-center">
                <p className="font-semibold">{t("Aún no has preparado el día en este dispositivo.")}</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                  {online
                    ? t("Toca «Preparar el día» para descargar tus clientes, tu agenda y los precios. Después podrás consultarlos aquí aunque no tengas señal.")
                    : t("Cuando vuelvas a tener conexión, toca «Preparar el día» para descargar tus clientes, tu agenda y los precios.")}
                </p>
              </div>
            )}
            {ready && snapshot && <Downloaded snapshot={snapshot} />}
          </>
        )}
      </main>
    </div>
  );
}

/** La pantalla que muestra lo descargado. No pide nada al servidor para dibujarse: abre sin red. */
export function OfflineApp({ initialLocale }: { initialLocale: Locale }) {
  const { meta, snapshot, ready } = useOfflineData();
  return (
    <I18nProvider locale={meta?.locale ?? initialLocale} data={meta?.labels ?? {}}>
      <Screen snapshot={snapshot} ready={ready} />
    </I18nProvider>
  );
}
