// Íconos de la app instalable (PWA): sello blanco del CRM («A» de Firplak y «CRM») sobre el navy de la marca.
// Uso: node scripts/generate-icons.mjs  →  public/icons/*.png
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sello = join(root, 'public/brand/firplak-crm-sello-white.svg');
const mark = join(root, 'public/brand/firplak-mark-white.png'); // solo la «A», para la barra de estado
const out = join(root, 'public/icons');
mkdirSync(out, { recursive: true });
const NAVY = { r: 0x25, g: 0x41, b: 0x53, alpha: 1 };

/** Ícono cuadrado: `scale` es la fracción del lado que ocupa el sello (las «maskable» usan la zona segura). */
async function icon(file, size, scale, radius = 0) {
  const inner = Math.round(size * scale);
  const logo = await sharp(sello, { density: 1200 }).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  let img = sharp({ create: { width: size, height: size, channels: 4, background: NAVY } })
    .composite([{ input: logo, gravity: 'center' }]);
  if (radius) {
    const mask = Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}"/></svg>`);
    img = sharp(await img.png().toBuffer()).composite([{ input: mask, blend: 'dest-in' }]);
  }
  await img.png().toFile(join(out, file));
  console.log(`public/icons/${file} (${size}×${size})`);
}

await icon('icon-192.png', 192, 0.6, 40);
await icon('icon-512.png', 512, 0.6, 104);
await icon('maskable-512.png', 512, 0.5);
await icon('apple-touch-icon.png', 180, 0.6);

// Ícono pequeño de la barra de estado de Android: solo la «A» (a ese tamaño «CRM» no se lee), blanca sobre transparente.
await sharp(mark).resize(96, 96, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(join(out, 'badge-96.png'));
console.log('public/icons/badge-96.png (96×96)');
