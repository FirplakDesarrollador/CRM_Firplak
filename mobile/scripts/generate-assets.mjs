// Ícono y pantalla de arranque de la app nativa, con el mismo sello del CRM (public/brand/firplak-crm-sello-white.svg).
// Uso: npm run assets   (desde mobile/)
import { copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobile = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(mobile, '..');
// sharp ya viene con las dependencias del CRM (raíz del repositorio).
const sharp = createRequire(join(repo, 'package.json'))('sharp');

const sello = join(repo, 'public/brand/firplak-crm-sello-white.svg');
const assets = join(mobile, 'ios/App/App/Assets.xcassets');
const NAVY = { r: 0x25, g: 0x41, b: 0x53 };

/** Lienzo navy cuadrado con el sello centrado; `inner` es el lado del sello en píxeles. Sin transparencia (Apple la rechaza). */
async function square(file, size, inner) {
  const logo = await sharp(sello, { density: 2400 }).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 3, background: NAVY } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(file);
  console.log(`${file.replace(mobile + '/', '')} (${size}×${size})`);
}

// Ícono: iOS redondea las esquinas; el sello ocupa lo mismo que en el ícono de la app web instalada.
await square(join(assets, 'AppIcon.appiconset/AppIcon-512@2x.png'), 1024, Math.round(1024 * 0.74));

// Pantalla de arranque: imagen cuadrada que iOS recorta al centro en cualquier pantalla.
for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  await square(join(assets, 'Splash.imageset', name), 2732, 560);
}

// La página de «sin conexión» usa el mismo sello.
copyFileSync(sello, join(mobile, 'www/sello.svg'));
console.log('www/sello.svg');
