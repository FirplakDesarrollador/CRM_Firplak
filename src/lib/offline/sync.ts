// Envío de la bandeja de salida: cuando hay señal, lo creado sin conexión se manda al CRM en orden (primero los
// clientes, después lo que depende de ellos). Cada registro queda Pendiente, Enviado o Rechazado.

import { isSignedOut } from "./download";
import { listOutbox, purgeOldSent, updateOutbox } from "./store";
import type { OutboxItem } from "./types";

export type SyncResult = { sent: number; rejected: number; pending: number; signedOut: boolean };

type Answer = {
  status?: "sent" | "rejected" | "other-user";
  reason?: string;
  errors?: OutboxItem["errors"];
  duplicates?: OutboxItem["duplicates"];
};

let running: Promise<SyncResult> | null = null;

/**
 * Envía lo pendiente de una persona. Solo se llama con el usuario que el servidor confirmó en esta ventana.
 * Si ya hay un envío en curso (en esta pestaña o en otra), no arranca otro.
 */
export function syncOutbox(userId: string): Promise<SyncResult> {
  if (running) return running;
  const work = async () => {
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    if (!locks) return send(userId);
    const result = await locks.request("firplak-crm-envio", { ifAvailable: true }, (lock) => (lock ? send(userId) : null));
    return result ?? summary(await listOutbox(userId), 0, 0, false);
  };
  running = work().finally(() => {
    running = null;
  });
  return running;
}

function summary(items: OutboxItem[], sent: number, rejected: number, signedOut: boolean): SyncResult {
  return { sent, rejected, pending: items.filter((item) => item.status === "pending").length, signedOut };
}

async function send(userId: string): Promise<SyncResult> {
  await purgeOldSent(userId).catch(() => undefined);
  const items = await listOutbox(userId);
  // Primero los clientes: las actividades de un cliente nuevo necesitan que exista.
  const queue = items.filter((item) => item.status === "pending").sort((a, b) => Number(b.kind === "account") - Number(a.kind === "account") || a.createdAt - b.createdAt);
  const status = new Map(items.map((item) => [item.id, item.status]));
  let sent = 0;
  let rejected = 0;
  let signedOut = false;

  for (const item of queue) {
    // Su cliente sigue en la bandeja sin enviarse (pendiente o rechazado): espera.
    if (item.dependsOn && status.has(item.dependsOn) && status.get(item.dependsOn) !== "sent") continue;

    let response: Response;
    try {
      response = await fetch("/api/sin-conexion/enviar", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, userId: item.userId, kind: item.kind, values: item.values, ignoreDuplicates: item.ignoreDuplicates === true }),
      });
    } catch {
      break; // sin red: todo sigue pendiente
    }
    if (isSignedOut(response)) {
      signedOut = true;
      break;
    }
    const answer = (await response.json().catch(() => null)) as Answer | null;
    if (response.ok && answer?.status === "sent") {
      await updateOutbox(item.id, { status: "sent", sentAt: Date.now(), reason: null, errors: undefined, duplicates: undefined });
      status.set(item.id, "sent");
      sent++;
      continue;
    }
    if ((response.ok && answer?.status === "rejected") || response.status === 400) {
      await updateOutbox(item.id, {
        status: "rejected",
        reason: answer?.reason ?? "El CRM no aceptó el registro.",
        errors: answer?.errors,
        duplicates: answer?.duplicates,
        attempts: item.attempts + 1,
      });
      status.set(item.id, "rejected");
      rejected++;
      continue;
    }
    // Otra persona tiene la sesión, o el servidor falló: se queda pendiente y se reintenta después.
    if (response.status !== 403) await updateOutbox(item.id, { attempts: item.attempts + 1 });
    break;
  }
  return summary(await listOutbox(userId), sent, rejected, signedOut);
}
