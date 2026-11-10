"use client";

import { useEffect } from "react";
import { clearDrafts } from "@/lib/drafts";

/**
 * Limpia los borradores de formularios que ya no deben estar en este dispositivo: los de otra persona que lo
 * haya usado antes (por si cerró el navegador sin cerrar sesión) y los vencidos.
 */
export function DraftsSweep({ userId }: { userId: string }) {
  useEffect(() => {
    clearDrafts(userId);
  }, [userId]);
  return null;
}
