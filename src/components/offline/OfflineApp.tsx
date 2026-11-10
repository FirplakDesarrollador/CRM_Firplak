"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, LogIn, Send, WifiOff } from "lucide-react";
import { BrandBackdrop, BrandGlyph } from "@/components/brand/BrandBackdrop";
import { Alert } from "@/components/ui/Alert";
import type { Locale } from "@/lib/i18n";
import { I18nProvider, useT } from "@/lib/i18n/client";
import { isSignedOut } from "@/lib/offline/download";
import { accountFromOutbox, unsent } from "@/lib/offline/outbox";
import { clearOffline, sweepOffline } from "@/lib/offline/store";
import type { OfflineAccount, OfflineMeta, OfflineSnapshot, OutboxItem } from "@/lib/offline/types";
import { agendaGroups, OfflineAgenda } from "./OfflineAgenda";
import { OfflineClient, OfflineClients } from "./OfflineClients";
import { OfflineActivityForm, OfflineClientForm } from "./OfflineForms";
import { OfflineOpportunities } from "./OfflineOpportunities";
import { OfflineOutbox } from "./OfflineOutbox";
import { OfflineProducts } from "./OfflineProducts";
import { PrepareDayCard } from "./PrepareDayCard";
import { closeForm, go, useRoute, VIEWS, type Route, type View } from "./route";
import { useOfflineData, useOnline } from "./useOffline";
import { useDeviceUnsent, useNotice, useOutbox, useOutboxSync } from "./useOutbox";

const TAB_LABELS: Record<View, string> = { agenda: "Agenda", clientes: "Clientes", oportunidades: "Oportunidades", productos: "Productos", salida: "Envíos" };

/**
 * Con red, comprueba quién tiene la sesión: si nadie, lo descargado se borra; si es otra persona, también.
 * Un fallo de red no cuenta: sin señal no se puede saber y lo descargado se sigue mostrando.
 * `userId` es quien tiene la sesión según el servidor: solo con eso se envía lo pendiente.
 */
function useSessionCheck(online: boolean) {
  const [state, setState] = useState<{ signedOut: boolean; userId: string | null }>({ signedOut: false, userId: null });
  useEffect(() => {
    if (!online) return;
    let alive = true;
    fetch("/api/sin-conexion/sesion", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        if (isSignedOut(response)) {
          await clearOffline();
          if (alive) setState({ signedOut: true, userId: null });
          return;
        }
        if (!response.ok) return;
        const { userId } = (await response.json()) as { userId?: string };
        if (!userId) return;
        await sweepOffline(userId);
        if (alive) setState({ signedOut: false, userId });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [online]);
  return state;
}

type Outbox = {
  items: OutboxItem[];
  /** Nombres de los clientes, descargados o creados aquí. */
  names: Map<string, string>;
  online: boolean;
  sessionUserId: string | null;
};

function Downloaded({ snapshot, route, outbox }: { snapshot: OfflineSnapshot; route: Route; outbox: Outbox }) {
  const t = useT();
  const { items, names } = outbox;
  const accounts = useMemo(() => new Map(snapshot.accounts.map((a) => [a.id, a])), [snapshot.accounts]);
  const known = useMemo(() => new Set(accounts.keys()), [accounts]);
  // Lo creado sin señal: los clientes (para marcarlos) y las actividades (para verlas en la agenda y la ficha).
  const local = useMemo(() => new Map(items.filter((item) => item.kind === "account").map((item) => [item.id, item])), [items]);
  const activities = useMemo(() => items.filter((item) => item.kind === "activity").sort((a, b) => b.createdAt - a.createdAt), [items]);
  const client = route.view === "clientes" && route.client ? accounts.get(route.client) : undefined;
  // En un teléfono las pestañas no caben: la que está abierta se trae a la vista.
  useEffect(() => {
    const tab = document.getElementById(`pestana-${route.view}`);
    const strip = tab?.parentElement;
    if (!tab || !strip) return;
    const left = tab.offsetLeft - strip.offsetLeft;
    if (left < strip.scrollLeft) strip.scrollLeft = left;
    else if (left + tab.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = left + tab.offsetWidth - strip.clientWidth;
  }, [route.view]);
  const counts: Record<View, number> = {
    agenda: agendaGroups(snapshot.activities).reduce((n, g) => n + g.items.length, 0) + activities.length,
    clientes: snapshot.accounts.length,
    oportunidades: snapshot.opportunities.length,
    productos: snapshot.products.length,
    salida: unsent(items).length,
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
            onClick={() => go({ v: view, c: null, f: null, e: null })}
          >
            {t(TAB_LABELS[view])} <span className={`badge num ${view === "salida" && counts.salida > 0 ? "badge-warning" : ""}`}>{counts[view]}</span>
          </button>
        ))}
      </div>
      <div id="panel-sin-conexion" role="tabpanel" aria-labelledby={`pestana-${route.view}`} className="flex flex-col gap-4">
        {route.view === "agenda" && <OfflineAgenda activities={snapshot.activities} known={known} local={activities} names={names} canCreate />}
        {route.view === "clientes" && (client
          ? <OfflineClient account={client} snapshot={snapshot} known={known} local={local.get(client.id)} activities={activities.filter((item) => item.values.account_id === client.id)} names={names} />
          : <OfflineClients accounts={snapshot.accounts} local={local} />)}
        {route.view === "oportunidades" && <OfflineOpportunities opportunities={snapshot.opportunities} accounts={accounts} />}
        {route.view === "productos" && <OfflineProducts snapshot={snapshot} selection={route.prices} />}
        {route.view === "salida" && <OfflineOutbox {...outbox} />}
      </div>
    </>
  );
}

function Screen({ meta, snapshot, ready }: { meta: OfflineMeta | null; snapshot: OfflineSnapshot | null; ready: boolean }) {
  const t = useT();
  const online = useOnline();
  const route = useRoute();
  const session = useSessionCheck(online);
  const { signedOut } = session;
  // De quién es lo que se muestra y se crea aquí: quien tiene la sesión o, sin señal, quien hizo la descarga.
  const userId = signedOut ? null : session.userId ?? meta?.userId ?? null;
  const { items, ready: outboxReady } = useOutbox(userId);
  useOutboxSync(session.userId);
  const deviceUnsent = useDeviceUnsent();
  const notice = useNotice();
  const waiting = unsent(items).length;

  // Los clientes creados sin señal se ven junto a los descargados hasta que la siguiente descarga los traiga.
  const accounts = useMemo<OfflineAccount[]>(() => {
    const downloaded = snapshot?.accounts ?? [];
    const ids = new Set(downloaded.map((a) => a.id));
    const created = items.filter((item) => item.kind === "account" && !ids.has(item.id)).map(accountFromOutbox);
    return created.length > 0 ? [...created, ...downloaded] : downloaded;
  }, [snapshot, items]);
  const merged = useMemo(() => (snapshot ? { ...snapshot, accounts } : null), [snapshot, accounts]);
  const names = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);
  const outbox: Outbox = { items, names, online, sessionUserId: session.userId };

  const editing = route.edit ? items.find((item) => item.id === route.edit) ?? null : null;
  const form = route.form && userId ? route.form : null;

  return (
    <div className="min-h-dvh">
      <BrandBackdrop />
      <header className="shell-chrome shell-bar sticky top-0 z-30 pt-[var(--safe-top)]">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <BrandGlyph size={26} />
          <h1 className="min-w-0 flex-1 truncate text-base font-medium">{t("Consulta sin señal")}</h1>
          {!online && <span className="badge badge-warning"><WifiOff size={12} aria-hidden="true" /> {t("Sin señal")}</span>}
          {waiting > 0 && (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              aria-label={`${waiting} ${t("sin enviar")}`}
              onClick={() => go({ v: "salida", c: null, f: null, e: null })}
            >
              <Send size={14} aria-hidden="true" /> <span className="badge badge-warning num">{waiting}</span>
              <span className="hidden sm:inline">{t("sin enviar")}</span>
            </button>
          )}
          {online && !signedOut && (
            // Enlace normal: vuelve al CRM con una carga completa, que trae la sesión y los datos al día.
            <a href={route.back} className="btn btn-sm btn-ghost" aria-label={t("Volver al CRM")}>
              <ArrowLeft size={14} aria-hidden="true" /> <span className={waiting > 0 ? "hidden sm:inline" : undefined}>{t("Volver al CRM")}</span>
            </a>
          )}
        </div>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-5">
        {(signedOut || !userId) && deviceUnsent > 0 && (
          // Solo cuántos: de quién son y qué dicen no se muestra hasta que esa persona entre.
          <Alert tone="info">
            {t("En este dispositivo hay registros sin enviar")}: {deviceUnsent}. {t("Se enviarán cuando quien los creó vuelva a iniciar sesión aquí.")}
          </Alert>
        )}
        {signedOut ? (
          <>
            <Alert tone="warning">{t("Tu sesión se cerró y lo descargado en este dispositivo se borró. Inicia sesión para volver a preparar el día.")}</Alert>
            <a href="/login" className="btn btn-primary self-start"><LogIn size={15} aria-hidden="true" /> {t("Iniciar sesión")}</a>
          </>
        ) : form && userId ? (
          // Un formulario ocupa la pantalla: lo demás espera detrás.
          !outboxReady ? (
            <div className="card flex flex-col gap-3 p-4" aria-hidden="true">
              <span className="skeleton h-4 w-2/3" />
              <span className="skeleton h-4 w-1/2" />
            </div>
          ) : route.edit && (!editing || editing.status === "sent" || (editing.kind === "account") !== (form === "cliente")) ? (
            <>
              <Alert tone="info">{t("Este registro ya no se puede corregir aquí: ya se envió o se descartó.")}</Alert>
              <button type="button" className="btn self-start" onClick={closeForm}><ArrowLeft size={14} aria-hidden="true" /> {t("Volver")}</button>
            </>
          ) : form === "cliente" ? (
            <OfflineClientForm key={route.edit ?? "nuevo"} userId={userId} options={meta?.options} editing={editing} />
          ) : (
            <OfflineActivityForm
              key={route.edit ?? "nueva"}
              userId={userId}
              accounts={accounts}
              outbox={items}
              editing={editing}
              client={route.view === "clientes" ? route.client : null}
            />
          )
        ) : (
          <>
            {notice && <Alert tone="success">{notice}</Alert>}
            <PrepareDayCard />
            {!ready && (
              <div className="card flex flex-col gap-3 p-4" aria-hidden="true">
                <span className="skeleton h-4 w-2/3" />
                <span className="skeleton h-4 w-1/2" />
                <span className="skeleton h-4 w-3/5" />
              </div>
            )}
            {ready && !merged && (
              <>
                <div className="card px-5 py-10 text-center">
                  <p className="font-semibold">{t("Aún no has preparado el día en este dispositivo.")}</p>
                  <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                    {online
                      ? t("Toca «Preparar el día» para descargar tus clientes, tu agenda y los precios. Después podrás consultarlos aquí aunque no tengas señal.")
                      : t("Cuando vuelvas a tener conexión, toca «Preparar el día» para descargar tus clientes, tu agenda y los precios.")}
                  </p>
                </div>
                {/* Sin descarga (se borró o es de antes), lo que quedó sin enviar se sigue viendo. */}
                {items.length > 0 && <OfflineOutbox {...outbox} />}
              </>
            )}
            {ready && merged && <Downloaded snapshot={merged} route={route} outbox={outbox} />}
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
      <Screen meta={meta} snapshot={snapshot} ready={ready} />
    </I18nProvider>
  );
}
