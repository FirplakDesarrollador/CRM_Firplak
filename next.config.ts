import type { NextConfig } from "next";

// El CRM es 100 % autenticado y por usuario: se usa el renderizado dinámico clásico
// (sin cacheComponents), así cada página lee la sesión de Supabase en la petición.
const nextConfig: NextConfig = {
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
