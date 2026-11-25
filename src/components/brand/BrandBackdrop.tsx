import { FondoAnimado } from "./FondoAnimado";

const MARK = "M201.54 27.3L304.51 27.3L469.37 472.5L384.51 472.5L253.02 117.45L121.56 472.5L36.69 472.5ZM253.03 340.92L301.75 472.5L204.3 472.5Z";

/** El logo en vector y del color del texto: no pide ninguna imagen, así que se ve sin conexión. */
export function BrandGlyph({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 502 512" focusable="false" aria-hidden="true">
      <path fill="currentColor" d={MARK} />
    </svg>
  );
}

/** El logo de Firplak en vector, con el degradado azul del tema. */
export function BrandMark({ gradientId, className }: { gradientId: string; className: string }) {
  return (
    <svg className={className} viewBox="0 0 502 512" focusable="false" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0.7" y1="0" x2="0.3" y2="1">
          <stop offset="0" style={{ stopColor: "var(--logo-a)" }} />
          <stop offset="1" style={{ stopColor: "var(--logo-b)" }} />
        </linearGradient>
      </defs>
      <path fill={`url(#${gradientId})`} d={MARK} />
    </svg>
  );
}

/** Fondo de la app: el logo detrás del vidrio. Solo decorativo; el movimiento va en globals.css. */
export function BrandBackdrop() {
  return (
    <div className="brand-backdrop" aria-hidden="true">
      <FondoAnimado />
      <BrandMark gradientId="brand-backdrop-azul" className="brand-backdrop-logo" />
    </div>
  );
}
