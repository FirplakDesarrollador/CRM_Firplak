import type { NextConfig } from "next";

// El CRM es 100 % autenticado y por usuario: se usa el renderizado dinámico clásico
// (sin cacheComponents), así cada página lee la sesión de Supabase en la petición.
const nextConfig: NextConfig = {
  // El modo demo llama al envío de push cada pocos segundos: no llenar la consola.
  logging: { incomingRequests: { ignore: [/^\/api\/push\/dispatch/] } },
  // Service worker de la app instalable: nunca en caché del navegador y solo con scripts propios.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  // Vercel publica los archivos con huella en /_next/static/immutable/… (lo activa su adaptador). Con esta
  // variable la compilación local los deja igual, para probar la consulta sin señal como queda en el hosting
  // (`npm run dev:demo -- --vercel`). En Vercel no se define: allá decide el adaptador.
  ...(process.env.CRM_ARCHIVOS_COMO_VERCEL === "1" ? { supportsImmutableAssets: true } : {}),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
