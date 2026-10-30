"use client";

import { createContext, useContext, useMemo } from "react";
import { makeT, makeValueLabel, type DataLabels, type Locale, type T } from "./index";

const LocaleContext = createContext<Locale>("es");
const DataLabelsContext = createContext<DataLabels>({});

export function I18nProvider({ locale, data = {}, children }: { locale: Locale; data?: DataLabels; children: React.ReactNode }) {
  return (
    <LocaleContext value={locale}>
      <DataLabelsContext value={data}>{children}</DataLabelsContext>
    </LocaleContext>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}

export function useT(): T {
  const locale = useContext(LocaleContext);
  const data = useContext(DataLabelsContext);
  return useMemo(() => makeT(locale, data), [locale, data]);
}

/** Traductor de valores de listas y etapas (datos), con las etiquetas de Configuración. */
export function useValueLabel(): T {
  const locale = useContext(LocaleContext);
  const data = useContext(DataLabelsContext);
  return useMemo(() => makeValueLabel(locale, data), [locale, data]);
}
