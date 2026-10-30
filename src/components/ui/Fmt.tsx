"use client";

import { useLocale } from "@/lib/i18n/client";
import { formatDate, formatDateTime, formatMonth, formatTime } from "@/lib/format";

/** Fecha u hora en el idioma del usuario (meses y formato de hora). */
export function Fmt({ date, datetime, time, month }: { date?: string | null; datetime?: string | null; time?: string | null; month?: string }) {
  const locale = useLocale();
  if (month !== undefined) return <>{formatMonth(month, locale)}</>;
  if (time !== undefined) return <>{formatTime(time, locale)}</>;
  if (datetime !== undefined) return <>{formatDateTime(datetime, locale)}</>;
  return <>{formatDate(date, locale)}</>;
}
