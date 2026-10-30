"use client";

import { useT } from "@/lib/i18n/client";

/** <option> con texto traducible. */
export function Opt({ children, ...rest }: React.OptionHTMLAttributes<HTMLOptionElement> & { children: string }) {
  const t = useT();
  return <option {...rest}>{t(children)}</option>;
}
