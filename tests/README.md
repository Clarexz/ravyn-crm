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
- `e2e/roles.spec.ts`: R-01 en la UI. El staff se simula con la cookie `ravyn_demo_role=staff` (solo en modo demo; ver D-12).

## Fase 4 (industria dinamica)

- `tests/industry/time-packs.test.ts`: zona horaria (Intl), horario laboral y slots en hora local, paquetes de industria, menu por vertical (IND-01 de logica) y contexto de industria (incluye neutralizacion de saltos de linea).
- `tests/industry/vertical-switch.test.ts`: IND-01 por ruta (`GET/PATCH /api/organization/schema` sobre una base de demo real): menu y etiquetas por giro, datos de ejemplo coherentes, aislamiento entre las dos organizaciones, restauracion al volver, admin/staff, CSRF.
- `tests/industry/agent-context.test.ts`: IND-02 (el contexto llega al prompt del especialista, solo a la organizacion correcta, y el agente cambia de vocabulario) y herramientas con zona horaria.
- `e2e/industry.spec.ts`: IND-01 e IND-02 en la UI (selector de vertical, menu, titulos, aviso de modulo inactivo, chat) y movil. Siempre deja la organizacion en salud al terminar. Capturas opcionales: `E2E_SHOTS=/ruta npx playwright test`.

## Fase 5 (pipeline y Analista)

- Dependencia nueva: `@dnd-kit/core` (arrastre con puntero, tacto y teclado).
- `tests/pipeline/analyst.test.ts`: ANL-01 (cifras del briefing contra calculos de control: un conjunto de 30 dias con resultados conocidos escrito en la segunda organizacion, y las consultas de control independientes sobre los datos demo de la principal, escritas aparte con filtros propios sobre `db.tables`; sin datos, division por cero, sin fugas entre organizaciones, y todo numero del texto debe provenir de las metricas), ANL-02 (una abierta con 15 dias sin actividad aparece por nombre en las acciones recomendadas; una de 14 o de ayer no) y vocabulario por vertical. Usan `DemoDb` con reloj fijo.
- `tests/pipeline/kanban.test.ts`: movimiento humano por la ruta real (persiste y crea `stage_change` con autor persona; staff bloqueado para ganado/perdido/reabrir; otra organizacion = 404 sin cambios; cuerpo estricto, CSRF 415/403, 401, 409 por tablero desactualizado; reversion si falla la actividad; `update_stage` de un agente sigue pendiente de aprobacion) y `GET /api/briefing`.
- `e2e/pipeline.spec.ts` (12 pruebas): arrastre con el raton, actividad en el perfil del contacto, medicion de tiempo de respuesta (se imprime `[medicion] ... ms`; criterio < 200 ms con el servidor retrasado 700 ms), reversion si el servidor responde 500, teclado, staff (cookie `ravyn_demo_role=staff`), tablero en escritorio (1360x860) y movil (390x800) de salud, inmobiliaria y servicios sin desborde de pagina, restaurante sin modulo, y briefing (contenido, enlaces, carga/error/reintento, vocabulario y chat del Analista). Las pruebas devuelven las tarjetas movidas a su etapa original y la vertical a salud. Capturas: `E2E_SHOTS=/ruta npx playwright test e2e/pipeline.spec.ts`.
- Los tests de menu por vertical (vitest y `e2e/industry.spec.ts`) ahora incluyen Tratamientos / Operaciones / Oportunidades.
