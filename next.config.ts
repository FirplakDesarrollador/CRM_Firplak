import type { NextConfig } from "next";

// El CRM es 100 % autenticado y por usuario: se usa el renderizado dinámico clásico
// (sin cacheComponents), así cada página lee la sesión de Supabase en la petición.
const nextConfig: NextConfig = {
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
