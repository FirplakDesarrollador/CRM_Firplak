"use client";

import { useRef, useState } from "react";

const integers = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** Agrupa miles al escribir. Un separador final con 1 o 2 cifras es decimal; los demás son de miles (acepta «1.100.000»). */
export function formatAmountInput(raw: string) {
  const s = raw.replace(/[^\d.,]/g, "");
  const last = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  const tail = last >= 0 ? s.slice(last + 1) : "";
  const decimal = last >= 0 && tail.length <= 2;
  const digits = (decimal ? s.slice(0, last) : s).replace(/\D/g, "");
  const whole = digits ? integers.format(BigInt(digits)) : decimal ? "0" : "";
  return decimal ? `${whole}.${tail}` : whole;
}

/** Campo de monto: muestra separadores mientras se escribe; `parseAmount` los interpreta al guardar. */
export function AmountInput({ defaultValue, placeholder, ...rest }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "defaultValue" | "placeholder" | "value" | "onChange"> & {
  defaultValue?: number | null; placeholder?: number;
}) {
  const [value, setValue] = useState(defaultValue === null || defaultValue === undefined ? "" : formatAmountInput(String(defaultValue)));
  const ref = useRef<HTMLInputElement>(null);
  return (
    <input {...rest} ref={ref} inputMode="decimal" value={value}
      placeholder={placeholder === undefined ? undefined : formatAmountInput(String(placeholder))}
      onChange={(e) => {
        // Conserva el cursor: cuenta las cifras a su izquierda y lo repone tras el nuevo formato.
        const before = e.target.value.slice(0, e.target.selectionStart ?? 0).replace(/\D/g, "").length;
        const next = formatAmountInput(e.target.value);
        setValue(next);
        requestAnimationFrame(() => {
          let pos = 0;
          for (let seen = 0; pos < next.length && seen < before; pos++) if (/\d/.test(next[pos])) seen++;
          ref.current?.setSelectionRange(pos, pos);
        });
      }} />
  );
}
