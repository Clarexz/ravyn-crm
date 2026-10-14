# Pruebas

Se usa vitest (entorno node). El alias `@` apunta a la raiz del repo.

## Comandos

- `npm test` corre todas las pruebas (`tests/**/*.test.ts`).
- `npm run typecheck` corre `tsc --noEmit`.
- `npm run lint` corre `next lint`.

## Estructura

- `tests/unit/mappers.test.ts`: mapeadores v2 a vista (`lib/supabase/mappers.ts`).
- `tests/guards/no-v1-tables.test.ts`: falla si `app/` o `lib/`
  usan `.from("clinics" | "patients" | "services" | "appointments" | "appointment_logs")`.
  Acepta comillas simples, dobles o backticks y saltos de linea. Lista archivo:linea.
- `tests/guards/tenant-filter.test.ts`: heuristica. Cada archivo de `app/api/**` y
  `app/(dashboard)/**` que consulta una tabla v2 con tenant debe contener
  `organization_id` u `organizationId`. Lista los archivos infractores.

Las guardias son la compuerta final de la migracion v2: fallan mientras quede codigo
sin migrar. Es una heuristica por archivo; no prueba que cada consulta filtre.

## Pruebas de UI (Fase 3)

Herramienta: Playwright (`@playwright/test`) contra el servidor de produccion local en modo demo
(sin variables de entorno). Los specs viven en `e2e/` y la configuracion en `playwright.config.ts`.

- Comando: `npm run test:e2e` (hace `npm run build` y despues `playwright test`). Si ya hay build:
  `npx playwright test`. El servidor se levanta solo en el puerto `E2E_PORT` (3123 por defecto) o se
  reutiliza uno existente (`PORT=3123 npm run start`; detenerlo con `fuser -k 3123/tcp`).
- Chromium: ya viene en `/opt/pw-browsers/chromium`; la configuracion lo usa como `executablePath`
  (otra ruta con `PLAYWRIGHT_CHROMIUM_PATH`). NO ejecutar `playwright install`.
- Un solo worker y en serie: la base de demo vive en la memoria del servidor y se comparte. Cada
  prueba crea sus propias acciones pendientes por `POST /api/agents/chat` (el LLM de demo es
  determinista) y restaura la configuracion que cambie.
- `e2e/inbox.spec.ts`: UI-01 (el modal muestra el motivo del agente y el payload exacto), UI-02
  (aprobar quita la accion de pendientes y baja el contador de la campana), rechazo con comentario,
  modificar valores, aprobar desde la campana en 2 clics, filtros y actualizacion automatica.
- `e2e/agents.spec.ts`: chat (agente, herramientas y tarjeta de accion en espera), centro de control
  (habilitar/deshabilitar y autonomia por agente), insignias de autor y ausencia de desborde en movil.
- Pruebas de logica de la fase (vitest): `tests/agents/agent-settings.test.ts` (configuracion por
  agente, interceptor, orquestador, rutas de settings, conteo, diff y actividades).
