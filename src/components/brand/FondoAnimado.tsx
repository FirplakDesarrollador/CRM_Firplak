"use client";

import { useEffect, useRef } from "react";

// Fondo de manchas de luz detrás del vidrio (aprobado por Luis el 13 nov 2026): le da al blur de las tarjetas algo que
// difuminar. Nació como composición de HyperFrames y aquí se reproduce en vivo, sin video: pesa poco, cambia con el
// tema y se ve sin conexión. Los colores van en globals.css, por tema.
const TAU = Math.PI * 2;
const CICLO_MS = 90_000; // lento a propósito: acompaña y no llama la atención
// id, centro x/y, radio x/y, vueltas x/y, fase x/y, tamaño, respiración — sobre un lienzo de 1920 × 1080.
const MANCHAS = [
  ["navy", 520, 760, 420, 260, 1, 1, 0.0, 0.25, 1500, 0.1],
  ["azul", 1380, 330, 460, 300, 1, 2, 0.35, 0.1, 1300, 0.14],
  ["oliva", 420, 260, 340, 240, 2, 1, 0.6, 0.8, 1100, 0.16],
  ["cielo", 1560, 860, 320, 220, 1, 1, 0.5, 0.9, 1000, 0.18],
  ["salvia", 980, 600, 520, 300, 1, 2, 0.15, 0.55, 900, 0.2],
  ["luz", 1000, 480, 620, 340, 2, 1, 0.75, 0.3, 800, 0.12],
] as const;
const FRANJAS = [["franja-1", 0.1], ["franja-2", 0.62]] as const;

export function FondoAnimado() {
  const lienzo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = lienzo.current;
    if (!el) return;
    const pieza = (nombre: string) => el.querySelector<HTMLElement>(`[data-pieza="${nombre}"]`);

    const pintar = (p: number) => {
      for (const [id, cx, cy, rx, ry, vx, vy, fx, fy, d, r] of MANCHAS) {
        const x = cx + rx * Math.sin(TAU * (vx * p + fx)) - d / 2;
        const y = cy + ry * Math.cos(TAU * (vy * p + fy)) - d / 2;
        const s = 1 + r * Math.sin(TAU * (p + fx + fy));
        const nodo = pieza(id);
        if (nodo) nodo.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s})`;
      }
      for (const [id, fase] of FRANJAS) {
        const nodo = pieza(id);
        if (nodo) nodo.style.transform = `translate3d(0, ${900 + 1500 * ((p + fase) % 1)}px, 0) rotate(-24deg)`;
      }
    };
    // El lienzo de 1920 × 1080 cubre la pantalla entera, como un video con object-fit: cover.
    const ajustar = () => {
      el.style.setProperty("--fondo-escala", String(Math.max(window.innerWidth / 1920, window.innerHeight / 1080)));
    };
    ajustar();
    pintar(0.12);
    window.addEventListener("resize", ajustar);

    // Se mueve con las mismas condiciones que el logo: desde 768 px, sin la preferencia de menos movimiento y sin el
    // vidrio en Sólido. En el resto queda quieto (en celular, para cuidar la batería).
    const medio = window.matchMedia("(min-width: 768px) and (prefers-reduced-motion: no-preference)");
    const raiz = document.documentElement;
    let cuadro = 0;
    const avanzar = (t: number) => {
      pintar((t % CICLO_MS) / CICLO_MS);
      cuadro = requestAnimationFrame(avanzar);
    };
    const decidir = () => {
      cancelAnimationFrame(cuadro);
      const mover = medio.matches && raiz.dataset.glass !== "solid";
      el.dataset.movimiento = mover ? "si" : "no";
      if (mover) cuadro = requestAnimationFrame(avanzar);
    };
    decidir();
    medio.addEventListener("change", decidir);
    const vigia = new MutationObserver(decidir);
    vigia.observe(raiz, { attributes: true, attributeFilter: ["data-glass"] });
    return () => {
      cancelAnimationFrame(cuadro);
      medio.removeEventListener("change", decidir);
      vigia.disconnect();
      window.removeEventListener("resize", ajustar);
    };
  }, []);

  return (
    <div ref={lienzo} className="fondo-animado">
      {MANCHAS.slice(0, 5).map(([id]) => <div key={id} data-pieza={id} className={`fondo-mancha fondo-${id}`} />)}
      {FRANJAS.map(([id]) => <div key={id} data-pieza={id} className={`fondo-franja fondo-${id}`} />)}
      <div data-pieza="luz" className="fondo-mancha fondo-luz" />
    </div>
  );
}
