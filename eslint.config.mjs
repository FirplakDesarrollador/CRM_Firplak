import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/lib/database.types.ts",
    // Informes de Playwright: si una prueba falla, traen el visor de trazas (JavaScript minificado).
    "test-results/**",
    // App nativa (Capacitor): proyecto aparte con sus propias dependencias y archivos generados por Xcode.
    "mobile/**",
  ]),
]);

export default eslintConfig;
