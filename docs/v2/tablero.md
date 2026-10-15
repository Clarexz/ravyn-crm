# Ravyn CRM v2 - Tablero de trabajo

Un archivo tiene un solo dueno a la vez. Estados: pendiente, en curso, integrado.
Actualizado por el agente maestro. Decisiones en `decisiones.md`.

## Base ya integrada por el maestro (Fase 0b, paso 0)
- `lib/supabase/auth.ts`: `organizationId` en el contexto, `clinicId` como alias deprecado.
- `lib/supabase/mappers.ts`: filas v2 a view-models de la UI.
- Dueno de estos dos archivos y de `types/database.ts`: el maestro. Los subagentes no los editan; piden el cambio en su reporte.

## Fase 0b - Ola 1 (en paralelo, worktrees aislados)

| Id | Tarea | Agente | Archivos de los que es dueno | Depende de | Estado |
|---|---|---|---|---|---|
| 0b-1 | Migracion 006: budgets, budget_members, budget_services (v2, con RLS, numero correlativo por organizacion) | Datos y SQL | `supabase/migrations/006_*`, `supabase/tests/fase0b_budgets.sql` | - | integrado |
| 0b-2 | Framework de pruebas (vitest) y pruebas de mappers | QA | `package.json`, `package-lock.json`, `vitest.config.ts`, `tests/` | - | integrado |
| 0b-3 | Modulo contactos (patients a contacts) | Frontend de datos | `app/api/patients/**`, `app/(dashboard)/patients/**`, `components/crm/PatientsClient.tsx`, `components/crm/PatientProfileClient.tsx` | - | integrado |
| 0b-4 | Modulo servicios (services a items) | Frontend de datos | `app/api/services/**`, `app/(dashboard)/services/**`, `components/crm/ServicesClient.tsx` | - | integrado |
| 0b-5 | Modulo citas (appointments a bookings) y webhooks n8n | Backend | `app/api/appointments/**`, `app/api/webhooks/**`, `lib/n8n/**`, `app/(dashboard)/appointments/**`, `components/crm/AppointmentsClient.tsx`, `NewAppointmentModal.tsx`, `NewAppointmentContext.tsx`, `TimeSlotPicker.tsx`, `AppointmentStatusBadge.tsx` | - | integrado |
| 0b-6 | Modulo clinica/ajustes/layout (clinics a organizations, staff) | Backend | `app/api/clinic/**`, `app/(dashboard)/settings/**`, `app/(dashboard)/layout.tsx`, `components/crm/SettingsClient.tsx` | - | integrado |
| 0b-7 | Modulo presupuestos | Frontend de datos | `app/api/budgets/**`, `app/(dashboard)/budgets/**`, `components/crm/BudgetsClient.tsx`, `BudgetDetailsClient.tsx`, `NewBudgetFlow.tsx` | 0b-1 (esquema acordado en el prompt) | integrado |
| 0b-8 | Modulo dashboard y reportes | Frontend de datos | `app/(dashboard)/dashboard/**`, `app/(dashboard)/reports/**`, `components/crm/DashboardClient.tsx`, `ReportsClient.tsx`, `KpiCard.tsx`, `KpiDetailsModal.tsx` | - | integrado |

## Fase 0b - Cierre
- Estado: los 8 modulos de la Ola 1 estan integrados. Compuerta en verde: tsc, lint, npm test (17/17 con guardias) y build.
- Revision de seguridad: en curso (docs/v2/revision-seguridad-fase0b.md).
- Revision de seguridad (Revisor): consultas sin `organization_id`, fugas entre tenants. Escribe solo en `docs/`.
- Verificacion del maestro: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `grep` de tablas v1 en `app/` y `lib/`.
- Pendiente fuera del repo: aplicar la migracion 006 en la base del servidor (el dueno o un entorno con credenciales; los subagentes no ejecutan SQL).

## Fase 1 (despues del cierre de la 0b)
Motor de agentes en `lib/agents/` y `app/api/agents/`, pruebas AGT-01 a 03. Tablero detallado al iniciar.

## Fase 1 - Estado
- Integrado: contrato (`lib/agents/types.ts`, `permissions.ts`), 14 herramientas con Zod, ejecutor, orquestador, 5 especialistas, ruta `POST /api/agents/chat`.
- Pruebas: AGT-01, AGT-02 y AGT-03 en verde (113 pruebas con LLM simulado). Compuerta: tsc, lint, test y build.
- Pendiente fuera del repo: `ANTHROPIC_API_KEY` en Vercel; aplicar migraciones 006 y 007.
- Siguiente: Fase 2 (interceptor de aprobacion con `isCriticalCall` de `lib/agents/tools/index.ts`, rutas approve/reject, historial de auditoria).

## Fase 2 - Estado (cerrada)
- Integrado: interceptor de aprobacion (`lib/agents/governance.ts`), rutas `GET /api/agents/actions`, `POST .../[id]/approve` y `.../reject`, LLM preprogramado (`lib/agents/demoLlm.ts`), pruebas HITL-01 a 03.
- Modo demo integrado: base en memoria (`lib/demo/`), cableado en `lib/supabase/*` y middleware. La app completa corre sin Supabase ni claves.
- Verificado de punta a punta contra el servidor de produccion local: 8 paginas y 7 APIs responden 200 con datos de ejemplo; chat -> accion pendiente -> aprobar -> ejecutada; segunda aprobacion = 409.
- Compuerta: tsc, lint, 353 pruebas y build sin variables de entorno.

## Fase 3 - Estado (cerrada)
Un solo dueno por archivo; el maestro hizo toda la fase (ver D-11).

| Id | Tarea | Archivos | Estado |
|---|---|---|---|
| 3-1 | Contrato: configuracion por agente (`settings.agents`), compatibilidad con `agent_autonomy` global | `lib/agents/settings.ts`, `governance.ts`, `orchestrator.ts`, `runtime.ts` | integrado |
| 3-2 | API: settings (admin), pending-count, detalle con diff, actividades con autor | `app/api/agents/{settings,pending-count,actions/[id]}`, `app/api/activities`, `lib/agents/diff.ts`, `lib/activities.ts` | integrado |
| 3-3 | Bandeja `/agents/inbox` con modal (motivo, diff, payload, modificar, rechazar con comentario) | `components/crm/agents/{InboxClient,ActionReviewDialog,usePendingActions}.tsx` | integrado |
| 3-4 | Centro de control `/agents/settings` | `components/crm/agents/SettingsClient.tsx` | integrado |
| 3-5 | Campana de pendientes en el encabezado (aprobar en 2 clics) | `components/crm/PendingBell.tsx`, `Header.tsx` | integrado |
| 3-6 | Insignias de autor en perfil de contacto y citas | `AuthorBadge.tsx`, `ActivityTimeline.tsx`, `PatientProfileClient.tsx`, `AppointmentsClient.tsx` | integrado |
| 3-7 | Chat conectado a `/api/agents/chat`; demo anterior eliminada | `components/crm/agents/ChatClient.tsx`, `app/(dashboard)/agents/*` | integrado |
| 3-8 | Pruebas: vitest (17 nuevas) y Playwright UI-01, UI-02 y otras (12) | `tests/agents/agent-settings.test.ts`, `e2e/`, `playwright.config.ts` | integrado |
| 3-9 | Revision de seguridad | `docs/v2/revision-seguridad-fase3.md` | integrada (riesgos abiertos R-01 a R-04) |

## Riesgos de la Fase 3 - cerrados antes de la Fase 4
- R-01 (solo admin aprueba criticas) y R-02 (JSON obligatorio y Origin) cerrados, D-12. R-03 y R-04 aceptados.

## Fase 4 - Estado (cerrada)
Un solo dueno por archivo; el maestro hizo toda la fase (modulos con contrato compartido, ver D-13).

| Id | Tarea | Archivos | Estado |
|---|---|---|---|
| 4-1 | Paquetes de industria y configuracion de tenant | `lib/industry/{packs,nav,server}.ts` | integrado |
| 4-2 | Zona horaria por organizacion en horario laboral y disponibilidad | `lib/industry/time.ts`, `lib/agents/tools/{shared,booking_tools}.ts` | integrado |
| 4-3 | Menu dinamico, etiquetas por vertical y aviso de modulo inactivo | `components/crm/{Sidebar,TenantProvider,ModuleGate,Header}.tsx`, clientes de pagina, `app/(dashboard)/layout.tsx` | integrado |
| 4-4 | Contexto de industria en prompts y LLM de demo | `lib/agents/{orchestrator,demoLlm}.ts` | integrado |
| 4-5 | API de esquema y cambio de industria | `app/api/organization/schema/route.ts` | integrado |
| 4-6 | Selector de vertical (demo) y datos de ejemplo por giro | `components/crm/IndustrySwitcher.tsx`, `lib/demo/verticals.ts`, `lib/demo/engine/db.ts`, `lib/demo/seed.ts` | integrado |
| 4-7 | Pruebas IND-01 e IND-02 (vitest y Playwright) | `tests/industry/*`, `e2e/industry.spec.ts` | integrado |
| 4-8 | Revision de seguridad | `docs/v2/revision-seguridad-fase4.md` | integrada |

## Fase 5 - Estado (cerrada)
Un solo dueno por archivo; el maestro hizo toda la fase (ver D-14 a D-16).

| Id | Tarea | Archivos | Estado |
|---|---|---|---|
| 5-1 | Etapas, tipos y movimiento humano atomico de etapa | `lib/pipeline/{stages,board}.ts`, `app/api/pipeline/**` | integrado |
| 5-2 | Tablero Kanban `/pipeline` (dnd-kit, teclado, movil, optimista) y entrada de menu | `components/crm/PipelineClient.tsx`, `app/(dashboard)/pipeline/*`, `lib/industry/{packs,nav}.ts`, `Sidebar.tsx` | integrado |
| 5-3 | Agente Analista: metricas de la base, briefing determinista y herramienta `generate_briefing` | `lib/agents/analyst.ts`, `permissions.ts`, `tools/index.ts`, `demoLlm.ts`, `prompts.ts` | integrado |
| 5-4 | Widget "Briefing Diario" y `GET /api/briefing` | `components/crm/BriefingCard.tsx`, `DashboardClient.tsx`, `app/api/briefing/route.ts` | integrado |
| 5-5 | Pruebas ANL-01, ANL-02, Kanban (vitest) y Playwright | `tests/pipeline/*`, `e2e/pipeline.spec.ts` | integrado |
| 5-6 | Revision de seguridad | `docs/v2/revision-seguridad-fase5.md` | integrada |

## Fase 6 - Estado (cerrada: certificada en modo demo)
Un solo dueno por archivo; el maestro hizo toda la fase (ver D-23). Resultados y matriz en `certificacion-fase6.md`.

| Id | Tarea | Archivos | Estado |
|---|---|---|---|
| 6-1 | `cancel_booking` critica, ids visibles en `search_contact` (D-17) | `lib/agents/tools/{booking,contact}_tools.ts`, `permissions.ts`, `governance.ts`, `diff.ts` | integrado |
| 6-2 | Limite de comensales como regla critica y `CRITICAL_RULES` (D-18, D-22) | `lib/agents/tools/{index,booking_tools}.ts`, `governance.ts` | integrado |
| 6-3 | Tareas asignadas a una persona, migracion 008 sin aplicar (D-19) | `lib/agents/tools/{activity_tools,shared}.ts`, `lib/activities.ts`, `supabase/migrations/008_*`, `ActivityTimeline.tsx` | integrado |
| 6-4 | Seguimiento a las 48 horas (D-20) y flujos del LLM de demo | `analytics_tools.ts`, `demoLlm.ts`, `prompts.ts` | integrado |
| 6-5 | Pruebas vitest: 3 escenarios, matriz critica, cobertura por herramienta, aislamiento, autenticacion y citas | `tests/e2e-flows/*` | integrado |
| 6-6 | Playwright de los 3 escenarios con capturas de escritorio y movil | `e2e/scenarios.spec.ts`, `docs/v2/capturas-fase6/` | integrado |
| 6-7 | Restablecer datos de un giro (D-21) y recordatorio de cita con sesion (R6-01) | `lib/demo/verticals.ts`, `app/api/organization/schema`, `app/api/appointments/[id]/remind` | integrado |
| 6-8 | Certificacion y revision de seguridad | `docs/v2/certificacion-fase6.md`, `docs/v2/revision-seguridad-fase6.md` | integrada |

Siguiente paso (decision del dueno): paso a datos reales. Pendientes en `certificacion-fase6.md`.
