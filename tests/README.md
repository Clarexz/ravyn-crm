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

## Fase 6 (integracion de extremo a extremo y certificacion)

Directorio `tests/e2e-flows/` (vitest). Mundo de pruebas compartido en `world.ts`: base de demo real (`DemoDb`) con reloj fijo
(miercoles 14-oct-2026 10:00 hora de Ciudad de Mexico), sesion simulada y las rutas HTTP reales (chat, bandeja, aprobar y rechazar,
actividades, citas). Cada archivo declara `vi.mock("@/lib/supabase/auth", async () => (await import("./world")).authMock)`.

- `scenario-clinic.test.ts`: prospecto por recepcion -> cita por el agente de Agenda (aprobada por staff) -> cancelacion (critica: staff 403, admin aprueba) -> `agent_actions` y `activities` con autor persona y agente; rechazo; paciente sin citas; la otra organizacion no cambia.
- `scenario-restaurant.test.ts`: reservacion de 12 personas (critica, limite 8): pendiente, staff 403 (tambien bajando `party_size`), admin aprueba desde la bandeja; frontera exacta 8 vs 9 con autonomia total; rechazo.
- `scenario-realestate.test.ts`: seguimiento a las 48 horas (frontera 47 h / 50 h), etapa y organizacion ajena fuera del alcance, tarea asignada al asesor, idempotencia, nivel conservador, sin asesor.
- `critical-actions.test.ts` + `criticalMatrix.ts`: TODAS las reglas criticas (`CRITICAL_RULES`) x casos x los 3 niveles de autonomia; falla si una regla no tiene casos, si una herramienta `critical: true` no tiene regla, o si algun modulo ejecuta herramientas sin pasar por la gobernanza. Para agregar una herramienta o regla critica nueva: anadir la regla en `lib/agents/tools/index.ts` y sus casos en `criticalMatrix.ts`.
- `tool-coverage.test.ts`: cada herramienta de `TOOL_NAMES` tiene al menos un caso de flujo completo (mensaje -> orquestador -> especialista -> gobernanza -> herramienta -> base) y una sonda de aislamiento (la organizacion B ataca con ids de A). Falla si se agrega una herramienta sin caso o sin sonda. Para una herramienta nueva: anadir su caso en `FLOWS` y su sonda en `PROBES`.
- `auth-regression.test.ts`: middleware en modo demo y en modo live (con `@supabase/ssr` simulado), las 26 rutas `/api` con sesion devuelven 401 sin sesion y sin tocar la base, los webhooks sin secreto 401, camino live con sesion simulada. Enumera las rutas desde el sistema de archivos: una ruta nueva sin proteccion hace fallar la prueba.
- `appointments-regression.test.ts`: gestion humana de citas (lista por organizacion, crear, cambio de estado con actividad de persona, ajenos 404) y el recordatorio de cita (R6-01).
- `tests/industry/vertical-reset.test.ts`: restablecer los datos de un giro (D-21).
- `e2e/scenarios.spec.ts` (4 pruebas): los tres escenarios por la interfaz (chat -> bandeja -> aprobacion -> registros), incluido staff bloqueado en acciones criticas. Usan nombres y telefonos unicos o restablecen el giro (`reset: true`), por lo que se pueden repetir sobre el mismo servidor. Capturas en escritorio (1360x860) y movil (390x800): `E2E_SHOTS=docs/v2/capturas-fase6 npx playwright test e2e/scenarios.spec.ts` (ya incluidas en `docs/v2/capturas-fase6/`).
