// Sincroniza el proyecto de Xcode con la dirección del CRM que debe abrir la app.
// Uso: node scripts/sync.mjs            → CRM publicado
//      node scripts/sync.mjs --local    → http://localhost:3000 (npm run dev:demo en la raíz)
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = process.argv.includes('--local') ? 'http://localhost:3000' : process.env.CRM_URL || 'https://crm-firplak.vercel.app';

// La página de «sin conexión» necesita saber a dónde reintentar.
writeFileSync(join(root, 'www/config.js'), `window.CRM_URL = ${JSON.stringify(url)};\n`);
console.log(`La app abrirá: ${url}`);

const result = spawnSync('npx', ['cap', 'sync', 'ios'], { cwd: root, stdio: 'inherit', env: { ...process.env, CRM_URL: url } });
process.exit(result.status ?? 1);
