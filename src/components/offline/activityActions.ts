"use client";

import { createContext } from "react";
import type { OutboxItem } from "@/lib/offline/types";

/**
 * Lo que una fila de la agenda necesita para completar o reprogramar una actividad sin señal: de quién es la sesión
 * (sin ella no se guarda nada) y el cambio vigente de cada actividad.
 */
export const ActivityActions = createContext<{ userId: string | null; changes: Map<string, OutboxItem> }>({ userId: null, changes: new Map() });
