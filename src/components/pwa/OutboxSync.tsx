"use client";

import { useRouter } from "next/navigation";
import { useOutboxSync } from "@/components/offline/useOutbox";

/**
 * Dentro del CRM hay sesión y, casi siempre, señal: lo que se creó sin conexión se envía desde aquí también, sin
 * que la persona tenga que volver a la pantalla sin señal. Al llegar algo, la pantalla abierta se pone al día.
 */
export function OutboxSync({ userId }: { userId: string }) {
  const router = useRouter();
  useOutboxSync(userId, () => router.refresh());
  return null;
}
