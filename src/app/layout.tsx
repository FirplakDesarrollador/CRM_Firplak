import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { PwaRegister } from "@/components/pwa/PwaRegister";

// Outfit es la única familia de la interfaz.
const outfit = Outfit({ subsets: ["latin"], weight: ["200", "300", "400", "500", "600", "700"], variable: "--font-outfit", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Firplak CRM", template: "%s · Firplak CRM" },
  description: "CRM comercial de Firplak: cuentas, contactos, oportunidades, actividades e indicadores.",
  applicationName: "Firplak CRM",
  // Instalada en iPhone/iPad: pantalla completa, nombre corto e ícono de la marca.
  appleWebApp: { capable: true, title: "Firplak CRM", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0a1826" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
  // La app instalada usa toda la pantalla (incluida la zona de la muesca); el contenido respeta los márgenes seguros.
  viewportFit: "cover",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const store = await cookies();
  const theme = store.get("fp-theme")?.value;
  const density = store.get("fp-density")?.value;
  const glass = store.get("fp-glass")?.value;
  const lang = store.get("fp-lang")?.value === "en" ? "en" : "es-CO";

  return (
    <html
      lang={lang}
      className={outfit.variable}
      data-theme={theme === "light" || theme === "dark" ? theme : undefined}
      data-density={density === "compact" ? "compact" : undefined}
      data-glass={glass === "clear" || glass === "solid" ? glass : undefined}
    >
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
