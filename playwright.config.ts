import fs from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Pruebas de UI contra el servidor de produccion local (modo demo, sin variables de entorno).
// Requiere `npm run build` previo (el script `test:e2e` lo hace). Chromium ya viene instalado en
// /opt/pw-browsers: no se ejecuta `playwright install`.
const PORT = Number(process.env.E2E_PORT ?? 3123);
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";

export default defineConfig({
  testDir: "./e2e",
  // El estado demo vive en la memoria del servidor y se comparte: un solo worker, en serie.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  reporter: [["list"]],
  outputDir: "./e2e/.output",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: fs.existsSync(chromiumPath) ? { executablePath: chromiumPath } : {},
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1360, height: 860 } } }],
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}/api/agents/pending-count`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
