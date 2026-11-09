// Configuración de la app nativa. Por defecto abre el CRM publicado; para probar contra el servidor local:
//   npm run sync:local   (usa http://localhost:3000, el de `npm run dev:demo`)
const url = process.env.CRM_URL || 'https://crm-firplak.vercel.app';
const local = url.startsWith('http://');

/** @type {import('@capacitor/cli').CapacitorConfig} */
module.exports = {
  appId: 'com.firplak.crm',
  appName: 'Firplak CRM',
  webDir: 'www',
  server: {
    url,
    cleartext: local,
    // Si el CRM no carga (sin internet), se muestra esta página propia en vez de una pantalla en blanco.
    errorPath: 'error.html',
    // El inicio de sesión de Microsoft 365 debe quedarse dentro de la app para poder volver al CRM.
    allowNavigation: ['login.microsoftonline.com', 'login.live.com'],
  },
  ios: {
    // El CRM ya respeta las áreas seguras (hora, isla dinámica, barra inferior) con env(safe-area-inset-*).
    contentInset: 'never',
    appendUserAgent: 'FirplakCRM-iOS',
  },
  plugins: {
    // La cabecera del CRM es oscura en los dos temas: hora y batería en blanco.
    StatusBar: { style: 'DARK' },
    SplashScreen: {
      // La pantalla de arranque se oculta cuando el CRM termina de cargar (ver AppDelegate.swift); esto es el tope.
      launchAutoHide: true,
      launchShowDuration: 5000,
      launchFadeOutDuration: 250,
      backgroundColor: '#254153',
      showSpinner: false,
    },
  },
};
