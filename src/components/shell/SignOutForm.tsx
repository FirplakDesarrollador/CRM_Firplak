"use client";

import { useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { forgetDevice } from "@/lib/push/device";
import { clearDrafts } from "@/lib/drafts";
import { plural } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import { clearOffline, countUnsent } from "@/lib/offline/store";
import { syncOutbox } from "@/lib/offline/sync";
import { menuItemClass } from "@/components/ui/Dropdown";

const wait = <T,>(ms: number, value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

/**
 * Cierra sesión y deja de enviar notificaciones a este dispositivo; si eso tarda, igual cierra sesión.
 * Si queda algo creado sin señal que no ha llegado al CRM, primero intenta enviarlo y, si no se puede, avisa:
 * queda guardado en el dispositivo hasta que la misma persona vuelva a entrar.
 */
export function SignOutForm({ label, userId }: { label: string; userId: string }) {
  const t = useT();
  const form = useRef<HTMLFormElement>(null);
  const [checking, setChecking] = useState(false);
  const [unsent, setUnsent] = useState<number | null>(null);

  const action = async () => {
    // Los borradores de formularios viven en este dispositivo: no deben quedar para quien lo use después.
    clearDrafts();
    // Lo mismo con lo descargado para consultar sin señal (clientes, agenda, precios).
    await Promise.race([
      Promise.all([clearOffline(), forgetDevice().catch(() => undefined)]),
      wait(2000, undefined),
    ]);
    await signOut();
  };

  const start = async () => {
    if (checking) return;
    setChecking(true);
    let count = await Promise.race([countUnsent(userId), wait(1500, 0)]);
    if (count > 0 && navigator.onLine) {
      await Promise.race([syncOutbox(userId).catch(() => undefined), wait(4000, undefined)]);
      count = await Promise.race([countUnsent(userId), wait(1500, count)]);
    }
    setChecking(false);
    if (count === 0) form.current?.requestSubmit();
    else setUnsent(count);
  };

  return (
    <form ref={form} action={action}>
      {unsent === null ? (
        <button type="button" className={menuItemClass.replace("text-ink", "text-danger")} onClick={() => void start()} aria-busy={checking}>
          <LogOut size={15} /> {label}
        </button>
      ) : (
        <div role="alert" className="max-w-64 px-2.5 py-2">
          <p className="text-sm font-semibold">
            {t("Tienes registros sin enviar")}: {unsent} {t(plural(unsent, "registro", "registros"))}.
          </p>
          <p className="mt-1 text-sm text-muted">{t("Quedan guardados en este dispositivo y se enviarán cuando vuelvas a iniciar sesión aquí.")}</p>
          <div className="mt-2.5 flex flex-col gap-1.5">
            <button type="submit" className="btn btn-sm btn-danger"><LogOut size={14} aria-hidden="true" /> {t("Cerrar sesión de todas formas")}</button>
            <button type="button" className="btn btn-sm" onClick={() => setUnsent(null)}>{t("Cancelar")}</button>
          </div>
        </div>
      )}
    </form>
  );
}
