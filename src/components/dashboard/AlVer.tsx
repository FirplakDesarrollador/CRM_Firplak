"use client";

import { useEffect, useRef } from "react";

/**
 * Hace que la animación de entrada de un gráfico espere a que el gráfico entre en pantalla. Los que ya se ven al
 * abrir se animan de una vez; los de más abajo quedan en su primer cuadro hasta que la persona llega a ellos.
 * Sin JavaScript o con menos movimiento no cambia nada: el gráfico se ve completo.
 */
export function AlVer({ children, className }: { children: React.ReactNode; className?: string }) {
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = caja.current;
    if (!el || typeof IntersectionObserver === "undefined" || !el.getAnimations) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return; // ya está a la vista
    const enEspera = el.getAnimations({ subtree: true });
    enEspera.forEach((a) => { a.pause(); a.currentTime = 0; });
    const vigia = new IntersectionObserver(([entrada]) => {
      if (!entrada.isIntersecting) return;
      enEspera.forEach((a) => a.play());
      vigia.disconnect();
    }, { rootMargin: "0px 0px -12% 0px" });
    vigia.observe(el);
    return () => vigia.disconnect();
  }, []);

  return <div ref={caja} className={className}>{children}</div>;
}
