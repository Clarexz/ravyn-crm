# Fase 2: gobernanza y Human-in-the-Loop

## Flujo
`runtime` -> `executeToolGoverned` (lib/agents/governance.ts) -> `prepareToolCall` (existe, permiso, Zod) -> decision de aprobacion -> ejecuta o crea `agent_actions` pendiente.

## Niveles de autonomia (`organizations.settings.agent_autonomy`, defecto `balanced`)
| Nivel | Pide aprobacion |
|---|---|
| conservative | Toda escritura (todo salvo lecturas y `log_message`) mas las criticas |
| balanced | Criticas mas `create_booking`, `reschedule_booking`, `create_opportunity` |
| autonomous | Solo las criticas |

Criticas (`isCriticalCall`): `update_stage` a won/lost y descuento > 10%. Siempre piden aprobacion. Si no se puede leer la configuracion, se aplica `conservative`.

## agent_actions
- Pendiente: `requires_approval=true`, `status=pending`, `payload {tool, input, reason, summary, risk, critical, autonomy}`. El modelo recibe `{status:"pending_approval", action_id, summary}` y no se toca ninguna tabla de negocio.
- Automatica: se ejecuta y se registra una fila `requires_approval=false` con `executed` o `failed` y `execution_result`.

## Rutas (sesion obligatoria, filtradas por organizacion; id ajeno = 404)
- `GET /api/agents/actions?status=&requires_approval=&limit=`: mas recientes primero (limite 50, max 200).
- `POST /api/agents/actions/[id]/approve` body opcional `{notes, input}`: transicion atomica `pending -> approved` (`.eq("status","pending")`), ejecuta con los permisos del agente de la accion y deja `executed` o `failed`. `input` se revalida con el Zod de la herramienta (400 si es invalido y la accion sigue pendiente); el payload conserva `original_input`.
- `POST /api/agents/actions/[id]/reject` body opcional `{notes}`: `rejected`, no ejecuta nada.
- Estado distinto de `pending` = 409. Toda respuesta con accion incluye `review_seconds` (`reviewed_at - proposed_at`).

## Modo demo
`createLlmClient()` devuelve `DemoLlmClient` (lib/agents/demoLlm.ts) cuando `isDemoMode()`: reglas por palabra clave, sin aleatoriedad, que proponen tool_calls reales usando ids de `search_contact`.
