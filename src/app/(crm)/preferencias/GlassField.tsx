"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { BrandMark } from "@/components/brand/BrandBackdrop";
import { Tr } from "@/components/ui/Tr";
import { useT } from "@/lib/i18n/client";
import type { Preferences } from "@/lib/session";

type Glass = Preferences["glass"];

const LEVELS: { value: Glass; label: string; help: string }[] = [
  { value: "clear", label: "Transparente", help: "Deja ver más el logo detrás de las tarjetas de información. Tablas, gráficos y formularios no cambian." },
  { value: "medium", label: "Medio", help: "Equilibrio entre el vidrio y la lectura." },
  { value: "solid", label: "Sólido", help: "Tarjetas sin transparencia ni blur, y el logo quieto. Es la opción más liviana." },
];

function applyGlass(value: Glass) {
  const root = document.documentElement;
  if (value === "medium") root.removeAttribute("data-glass");
  else root.setAttribute("data-glass", value);
}

/** Barra de tres niveles. Al moverla, la pantalla cambia para ver el efecto; solo queda guardado con el botón del formulario. */
export function GlassField({ saved }: { saved: Glass }) {
  const t = useT();
  const [index, setIndex] = useState(() => Math.max(0, LEVELS.findIndex((l) => l.value === saved)));
  const level = LEVELS[index];

  const savedRef = useRef(saved);
  useEffect(() => {
    savedRef.current = saved;
  }, [saved]);

  useEffect(() => {
    applyGlass(level.value);
  }, [level.value]);

  // Si la persona se va sin guardar, vuelve lo que tenía.
  useEffect(() => () => applyGlass(savedRef.current), []);

  return (
    <fieldset>
      <legend className="label"><Tr>Efecto de vidrio</Tr></legend>
      <input type="hidden" name="glass" value={level.value} />
      <div className="glass-preview" aria-hidden="true">
        <BrandMark gradientId="glass-preview-azul" className="glass-preview-logo" />
        <div className="glass-preview-cards">
          <div className="glass-preview-card">
            <p className="glass-preview-label"><Tr>Ventas ganadas</Tr></p>
            <p className="glass-preview-value">3,684 <small><Tr>Millones COP</Tr></small></p>
            <p className="glass-preview-note"><Tr>Cifra de ejemplo</Tr></p>
          </div>
          <div className="glass-preview-card">
            <p className="glass-preview-label"><Tr>Tasa de éxito</Tr></p>
            <p className="glass-preview-value">75%</p>
            <p className="glass-preview-note"><Tr>Cifra de ejemplo</Tr></p>
          </div>
        </div>
      </div>
      <div className="glass-control">
        <input
          type="range"
          className="glass-slider"
          min={0}
          max={LEVELS.length - 1}
          step={1}
          value={index}
          onChange={(e) => setIndex(Number(e.target.value))}
          aria-label={t("Efecto de vidrio")}
          aria-valuetext={t(level.label)}
          style={{ "--glass-fill": `${(index / (LEVELS.length - 1)) * 100}%` } as CSSProperties}
        />
        <div className="glass-stops">
          {LEVELS.map((l, i) => (
            <button key={l.value} type="button" className="glass-stop" aria-current={i === index ? "true" : undefined} onClick={() => setIndex(i)}>
              <Tr>{l.label}</Tr>
            </button>
          ))}
        </div>
      </div>
      <p className="help"><Tr>{level.help}</Tr></p>
      <p className="help glass-reduced-note"><Tr>Tu dispositivo pide menos transparencia, así que la app la desactiva sin importar este ajuste.</Tr></p>
    </fieldset>
  );
}
