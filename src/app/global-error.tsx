"use client";

import { useSyncExternalStore } from "react";

// Última red de seguridad: si la app falla fuera de las páginas del CRM (por ejemplo, no alcanzó a cargar un
// archivo suyo), Next muestra esta pantalla en vez de la suya, que está en inglés. Reemplaza todo el documento
// y no puede contar con los estilos ni con el proveedor de idioma de la app: lleva los suyos.

const TEXT = {
  es: {
    title: "No se pudo abrir esta pantalla",
    body: "Puede ser la conexión o un error del CRM. Vuelve a intentarlo; si no tienes señal, ábrela de nuevo cuando la recuperes.",
    retry: "Reintentar",
    home: "Ir al inicio",
  },
  en: {
    title: "This screen couldn't open",
    body: "It may be the connection or a CRM error. Try again; if you have no signal, open it again once it's back.",
    retry: "Try again",
    home: "Go to home",
  },
};

const noop = () => () => undefined;
const inEnglish = () => /(?:^|;\s*)fp-lang=en(?:;|$)/.test(document.cookie);

const button: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 44,
  padding: "0 18px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.28)",
  background: "transparent",
  color: "inherit",
  font: "inherit",
  fontSize: 14,
  fontWeight: 600,
  textDecoration: "none",
  cursor: "pointer",
};

export default function GlobalError() {
  const english = useSyncExternalStore(noop, inEnglish, () => false);
  const t = english ? TEXT.en : TEXT.es;
  return (
    <html lang={english ? "en" : "es-CO"}>
      <body style={{ margin: 0, background: "#173650", color: "#eef3f6", fontFamily: "Outfit, system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
        <title>{t.title}</title>
        <main style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, boxSizing: "border-box" }}>
          <div style={{ maxWidth: 360, textAlign: "center" }}>
            {/* Color propio: si los estilos de la app alcanzaron a cargar, su color de título no se lee sobre este fondo. */}
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 500, color: "#eef3f6" }}>{t.title}</h1>
            <p style={{ margin: "12px 0 0", fontSize: 14, lineHeight: 1.6, color: "#c5d2da" }}>{t.body}</p>
            <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
              <button type="button" onClick={() => window.location.reload()} style={{ ...button, background: "#eef3f6", color: "#173650", borderColor: "#eef3f6" }}>{t.retry}</button>
              {/* Enlace normal: una navegación completa vuelve a pedir los archivos de la app. */}
              <a href="/inicio" style={button}>{t.home}</a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
