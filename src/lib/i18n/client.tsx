"use client";

import { createContext, useContext, useMemo } from "react";
import { makeT, type Locale, type T } from "./index";

const LocaleContext = createContext<Locale>("es");

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext value={locale}>{children}</LocaleContext>;
}

export function useLocale() {
  return useContext(LocaleContext);
}

export function useT(): T {
  const locale = useContext(LocaleContext);
  return useMemo(() => makeT(locale), [locale]);
}
