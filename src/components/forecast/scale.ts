// Escala vertical ajustada al dato: el tope queda lo más cerca posible del valor máximo, con pasos fáciles de leer.
// Con el tope holgado (p. ej. 8.000 para un máximo de 5.600) la línea de tendencia se ve plana y no deja ver si crece.
const PASOS = [1, 1.2, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

export function niceScale(value: number): { step: number; max: number; ticks: number[] } {
  const top = Math.max(1, value);
  let best = { step: top, max: top, n: 1 };
  for (const n of [4, 5, 6]) {
    const raw = top / n;
    const pow = 10 ** Math.floor(Math.log10(raw));
    const step = (PASOS.find((m) => m * pow >= raw * 0.999999) ?? 10) * pow;
    if (best.n === 1 || step * n < best.max) best = { step, max: step * n, n };
  }
  return { step: best.step, max: best.max, ticks: Array.from({ length: best.n + 1 }, (_, k) => k * best.step) };
}
