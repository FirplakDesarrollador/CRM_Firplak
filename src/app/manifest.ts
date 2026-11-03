import type { MetadataRoute } from "next";

// App instalable (PWA): se abre como app en el celular o el computador de los asesores.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Firplak CRM",
    short_name: "Firplak CRM",
    description: "CRM comercial de Firplak: cuentas, oportunidades, actividades e indicadores.",
    start_url: "/inicio",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f1e8d6",
    theme_color: "#0a1826",
    lang: "es-CO",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Registrar actividad", short_name: "Actividad", url: "/actividades/nueva", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Pipeline", url: "/oportunidades/pipeline", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Cuentas", url: "/cuentas", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
