"use client";

import { useEffect } from "react";
import { clearDrafts } from "@/lib/drafts";
import { sweepOffline } from "@/lib/offline/store";

/**
 * Limpia lo que ya no debe estar en este dispositivo: los borradores de formularios y la descarga para consultar
 * sin señal de otra persona que lo haya usado antes (por si cerró el navegador sin cerrar sesión), y los
 * borradores vencidos.
 */
export function DraftsSweep({ userId }: { userId: string }) {
  useEffect(() => {
    clearDrafts(userId);
    void sweepOffline(userId);
  }, [userId]);
  return null;
}
