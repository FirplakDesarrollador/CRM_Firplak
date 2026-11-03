/** Fondo de la app: el logo de Firplak en vector, detrás del vidrio. Solo decorativo; el movimiento va en globals.css. */
export function BrandBackdrop() {
  return (
    <div className="brand-backdrop" aria-hidden="true">
      <svg className="brand-backdrop-logo" viewBox="0 0 502 512" focusable="false">
        <defs>
          <linearGradient id="brand-backdrop-azul" x1="0.7" y1="0" x2="0.3" y2="1">
            <stop offset="0" style={{ stopColor: "var(--logo-a)" }} />
            <stop offset="1" style={{ stopColor: "var(--logo-b)" }} />
          </linearGradient>
        </defs>
        <path fill="url(#brand-backdrop-azul)" d="M201.54 27.3L304.51 27.3L469.37 472.5L384.51 472.5L253.02 117.45L121.56 472.5L36.69 472.5ZM253.03 340.92L301.75 472.5L204.3 472.5Z" />
      </svg>
    </div>
  );
}
