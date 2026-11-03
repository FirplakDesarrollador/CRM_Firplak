"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { Bell, BellOff, Send } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { sendTestPush } from "@/lib/push/actions";
import { currentSubscription, forgetDevice, pushSupported, subscribeDevice, syncDevice } from "@/lib/push/device";

const noSubscribe = () => () => {};
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
const notificationPermission = () => ("Notification" in window ? Notification.permission : "default");

/** Mis preferencias: activar las notificaciones push en este dispositivo. */
export function PushSettings({ publicKey }: { publicKey: string | null }) {
  const t = useT();
  const supported = useSyncExternalStore(noSubscribe, pushSupported, () => true);
  const iosNotInstalled = useSyncExternalStore(noSubscribe, () => isIos() && !isStandalone(), () => false);
  const [active, setActive] = useState<boolean | null>(null);
  const devicePermission = useSyncExternalStore(noSubscribe, notificationPermission, () => "default");
  const [answered, setAnswered] = useState<string | null>(null);
  const permission = answered ?? devicePermission;
  const [notice, setNotice] = useState<{ ok?: boolean; message?: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!publicKey || !pushSupported()) return;
    currentSubscription().then((s) => setActive(Boolean(s))).catch(() => setActive(false));
  }, [publicKey]);

  const enable = () => start(async () => {
    setNotice(null);
    try {
      const result = await subscribeDevice(publicKey!);
      setAnswered(notificationPermission());
      if (result.denied) return;
      setNotice(result);
      setActive(Boolean(result.ok));
    } catch {
      setNotice({ message: "Este dispositivo no pudo conectarse al servicio de notificaciones. Intenta de nuevo." });
    }
  });
  const disable = () => start(async () => {
    setNotice(null);
    await forgetDevice().catch(() => undefined);
    setActive(false);
  });
  const test = () => start(async () => setNotice(await sendTestPush()));

  let content;
  if (!publicKey) {
    content = <p className="text-sm text-muted">{t("Administración todavía no ha activado este servicio.")}</p>;
  } else if (iosNotInstalled) {
    content = <p className="text-sm text-muted">{t("En iPhone primero instala el CRM en la pantalla de inicio y actívalas desde la app instalada.")}</p>;
  } else if (!supported) {
    content = <p className="text-sm text-muted">{t("Este navegador no permite notificaciones push.")}</p>;
  } else if (permission === "denied") {
    content = <p className="text-sm text-muted">{t("Las notificaciones están bloqueadas para el CRM. Permítelas en los ajustes del navegador o del celular y vuelve aquí.")}</p>;
  } else if (active) {
    content = (
      <>
        <p className="text-sm text-success">{t("Activas en este dispositivo.")}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm" disabled={pending} onClick={test}><Send size={14} /> {t("Enviar prueba")}</button>
          <button type="button" className="btn btn-sm btn-ghost" disabled={pending} onClick={disable}><BellOff size={14} /> {t("Desactivar")}</button>
        </div>
      </>
    );
  } else {
    content = (
      <>
        <p className="text-sm text-muted">{t("Recibe en este dispositivo lo que llega a la campana (aprobaciones, asignaciones y alertas), aunque el CRM esté cerrado.")}</p>
        <button type="button" className="btn btn-primary btn-sm" disabled={pending || active === null} onClick={enable}><Bell size={14} /> {t("Activar notificaciones")}</button>
      </>
    );
  }

  return (
    <div className="space-y-2 rounded-[14px] border border-line p-4">
      <p className="flex items-center gap-2 text-sm font-semibold"><Bell size={16} /> {t("Notificaciones push")}</p>
      {content}
      {notice?.message && <p role="status" className={`text-sm ${notice.ok ? "text-success" : "text-danger"}`}>{t(notice.message)}</p>}
    </div>
  );
}

/** Mantiene al día la suscripción de este navegador; no muestra nada. */
export function PushSync({ publicKey, userId }: { publicKey: string; userId: string }) {
  useEffect(() => {
    syncDevice(publicKey, userId).catch(() => undefined);
  }, [publicKey, userId]);
  return null;
}
