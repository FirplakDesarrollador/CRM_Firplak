/** Fondo líquido: manchas navy, oliva y beige que se funden entre sí. Solo decorativo; el movimiento va en globals.css. */
export function LiquidBackdrop() {
  return (
    <div className="liquid-field" aria-hidden="true">
      <svg className="liquid-filter" width="0" height="0" focusable="false">
        <filter id="liquid-goo" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="16" result="blur" />
          <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" />
        </filter>
      </svg>
      <div className="liquid-goo">
        <span className="liquid-blob liquid-blob-a" />
        <span className="liquid-blob liquid-blob-b" />
        <span className="liquid-blob liquid-blob-c" />
        <span className="liquid-blob liquid-blob-d" />
        <span className="liquid-blob liquid-blob-e" />
      </div>
    </div>
  );
}
