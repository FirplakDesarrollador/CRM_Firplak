import Image from "next/image";
import wordmarkNavy from "../../../public/brand/firplak-wordmark-navy.png";
import wordmarkWhite from "../../../public/brand/firplak-wordmark-white.png";
import markNavy from "../../../public/brand/firplak-mark-navy.png";
import markWhite from "../../../public/brand/firplak-mark-white.png";

/** Marca "A" oficial de Firplak (navy en claro, blanca en oscuro). */
export function LogoMark({ size = 28, onDark = false }: { size?: number; onDark?: boolean }) {
  if (onDark) return <Image src={markWhite} alt="" width={size} height={size} priority />;
  return (
    <>
      <Image src={markNavy} alt="" width={size} height={size} className="logo-on-light" priority />
      <Image src={markWhite} alt="" width={size} height={size} className="logo-on-dark" priority />
    </>
  );
}

/** Wordmark oficial con eslogan "inspirando hogares". `height` en píxeles. */
export function Logo({ height = 34, onDark = false, label = true }: { height?: number; onDark?: boolean; label?: boolean }) {
  const width = Math.round((height * 1720) / 470);
  return (
    <span className="inline-flex items-center gap-3">
      {onDark ? (
        <Image src={wordmarkWhite} alt="Firplak · inspirando hogares" width={width} height={height} priority />
      ) : (
        <>
          <Image src={wordmarkNavy} alt="Firplak · inspirando hogares" width={width} height={height} className="logo-on-light" priority />
          <Image src={wordmarkWhite} alt="" aria-hidden width={width} height={height} className="logo-on-dark" priority />
        </>
      )}
      {label && (
        <span className="hidden border-l border-line pl-3 text-[0.68rem] font-medium uppercase tracking-[0.18em] text-accent md:inline">
          CRM
        </span>
      )}
    </span>
  );
}
