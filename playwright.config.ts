import { defineConfig, devices } from "@playwright/test";

// Pruebas de interfaz sobre el modo demo: base en memoria y servicios simulados, que arrancan y se
// borran en cada corrida. Usan el Chrome instalado en el equipo (CI: `PW_CHANNEL=chromium`).
const channel = process.env.PW_CHANNEL ?? "chrome";

export default defineConfig({
  testDir: "tests/e2e",
  // Todas comparten la misma base de demo.
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "test-results/informe" }]],
  use: {
    baseURL: "http://localhost:3000",
    actionTimeout: 15_000,
    // La primera visita a cada página compila en el modo de desarrollo.
    navigationTimeout: 60_000,
    channel,
    locale: "es-CO",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev:demo",
    url: "http://localhost:3000/login",
    timeout: 180_000,
    reuseExistingServer: false,
  },
  outputDir: "test-results/salida",
  projects: [
    { name: "sesiones", testMatch: /sesiones\.setup\.ts/ },
    { name: "computador", dependencies: ["sesiones"], testIgnore: /movil/, use: { viewport: { width: 1280, height: 800 } } },
    { name: "celular", dependencies: ["sesiones"], testMatch: /movil\.spec\.ts/, use: { ...devices["Pixel 7"], channel } },
  ],
});
