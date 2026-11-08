"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { parseAmount } from "@/lib/records/form";

/** Agrupa una cadena de cifras con coma de miles: "1250000" → "1,250,000". */
const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Muestra un monto ya interpretado (número o texto en cualquier convención) con miles y punto decimal. */
export function formatAmountValue(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "number" ? value : parseAmount(value);
  if (n === null || !Number.isFinite(n)) return "";
  const text = String(Math.abs(n));
  if (/e/i.test(text)) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const [whole, frac] = text.split(".");
  return `${n < 0 ? "-" : ""}${group(whole)}${frac ? `.${frac}` : ""}`;
}

/**
 * Formato mientras se escribe. Las comas son de miles (las pone el campo) y el punto es el decimal.
 * Si tras el punto hay más cifras de las permitidas, el punto era de miles por costumbre («1.250.000»).
 * Devuelve el texto y si se conservó el punto decimal (para reponer el cursor).
 */
export function formatTypedAmount(raw: string, decimals = 2): { text: string; keepsDot: boolean } {
  const s = raw.replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  const afterDot = dot >= 0 ? s.slice(dot + 1).replace(/\./g, "") : "";
  const keepsDot = dot >= 0 && decimals > 0 && afterDot.length <= decimals;
  const whole = (keepsDot ? s.slice(0, dot) : s.replace(/\./g, "")).replace(/^0+(?=\d)/, "");
  if (!keepsDot) return { text: whole ? group(whole) : "", keepsDot };
  return { text: `${whole ? group(whole) : "0"}.${afterDot}`, keepsDot };
}

/** Cuántas cifras (y punto decimal, si cuenta) hay antes de `end`. */
const significant = (text: string, end: number, withDot: boolean) =>
  [...text.slice(0, end)].filter((c) => /\d/.test(c) || (withDot && c === ".")).length;

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "defaultValue" | "placeholder" | "value" | "onChange" | "type"> & {
  defaultValue?: number | string | null;
  placeholder?: number | string;
  /** Decimales permitidos (2 por defecto). */
  decimals?: number;
};

/**
 * Campo numérico de la app (montos, cantidades y porcentajes): pone las comas de miles mientras se escribe
 * y usa punto para los decimales («1,250,000.50»), la regla de PRODUCT.md. Al guardar, `parseAmount` lo
 * interpreta en el servidor. `decimals={0}` para enteros.
 */
export function AmountInput({ defaultValue, placeholder, decimals = 2, ...rest }: Props) {
  const initial = formatAmountValue(defaultValue);
  const [value, setValue] = useState(initial);
  // Si el valor guardado cambia (p. ej. tras guardar), el campo lo muestra.
  const [shown, setShown] = useState(initial);
  if (initial !== shown) {
    setShown(initial);
    setValue(initial);
  }
  const ref = useRef<HTMLInputElement>(null);
  // Cursor a reponer tras cada cambio (el contador fuerza el render aunque el texto no cambie).
  const caretAt = useRef<number | null>(null);
  const [tick, setTick] = useState(0);
  useLayoutEffect(() => {
    if (caretAt.current === null || document.activeElement !== ref.current) return;
    ref.current?.setSelectionRange(caretAt.current, caretAt.current);
    caretAt.current = null;
  }, [tick]);

  // Un formulario que se limpia vuelve al valor guardado más reciente: tras agregar una línea, el campo
  // vacío; tras guardar un precio (React limpia el formulario), el precio nuevo y no el anterior.
  // React limpia el formulario en el mismo paso en que llega el valor nuevo: por eso el valor se toma en
  // el render siguiente, que ya lo trae.
  const [resets, setResets] = useState(0);
  const [handledResets, setHandledResets] = useState(0);
  if (resets !== handledResets) {
    setHandledResets(resets);
    setValue(initial);
  }
  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const onReset = () => setResets((n) => n + 1);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  return (
    <input {...rest} ref={ref} type="text" inputMode="decimal" autoComplete="off" value={value}
      placeholder={typeof placeholder === "number" ? formatAmountValue(placeholder) : placeholder}
      onChange={(e) => {
        const el = e.target;
        const kind = (e.nativeEvent as InputEvent).inputType ?? "";
        const data = (e.nativeEvent as InputEvent).data;
        let raw = el.value;
        let caret = el.selectionStart ?? raw.length;

        // Pegar, arrastrar o insertar de una vez (dictado, autocompletar) un monto: se interpreta en
        // cualquier convención («$ 1.250.000,50»).
        if (/^insertFrom|insertReplacementText/.test(kind) || (kind === "insertText" && (data?.length ?? 0) > 1)) {
          const next = formatAmountValue(raw);
          setValue(next);
          caretAt.current = next.length;
          setTick((n) => n + 1);
          return;
        }
        if (kind === "insertText" && data === "," && caret > 0) {
          // Teclados con coma decimal (p. ej. el del iPhone en español): la coma escrita es el decimal.
          raw = `${raw.slice(0, caret - 1)}.${raw.slice(caret)}`;
        } else if (value.length - raw.length === 1 && value[caret] === ",") {
          // Borrar una coma de miles borra la cifra de al lado, como espera quien la borra.
          if (kind === "deleteContentBackward" && caret > 0) {
            raw = raw.slice(0, caret - 1) + raw.slice(caret);
            caret -= 1;
          } else if (kind === "deleteContentForward") {
            raw = raw.slice(0, caret) + raw.slice(caret + 1);
          }
        }

        const { text: next, keepsDot } = formatTypedAmount(raw, decimals);
        const before = significant(formatTypedAmount(raw.slice(0, caret), decimals).text, Infinity, keepsDot);
        // Conserva el cursor: lo deja tras la misma cantidad de cifras que tenía a su izquierda.
        let pos = 0;
        for (let seen = 0; pos < next.length && seen < before; pos++) {
          if (/\d/.test(next[pos]) || (keepsDot && next[pos] === ".")) seen++;
        }
        setValue(next);
        caretAt.current = pos;
        setTick((n) => n + 1);
      }} />
  );
}
