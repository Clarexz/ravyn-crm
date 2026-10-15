# Certificacion de la Fase 6: integracion de extremo a extremo

Fecha: 2026-10-15. Rama `claude/beautiful-cerf-eqtfua`. Alcance: la app completa en modo demo (D-08): base en memoria, usuario administrador fijo sin sesion, staff simulado con la cookie `ravyn_demo_role=staff`, LLM preprogramado (`lib/agents/demoLlm.ts`). Nada de lo certificado aqui se probo contra Supabase real ni contra un LLM real (ver "Alcance y limites").

## Veredicto

El proyecto queda **certificado en modo demo**: los tres escenarios del plan pasan por la API y por la interfaz, el 100% de las llamadas criticas catalogadas exigen una persona (y solo un administrador las aprueba), las 16 herramientas del catalogo tienen un flujo completo de integracion y una sonda de aislamiento entre organizaciones, y no hay regresiones de autenticacion ni de gestion de citas. El siguiente paso es el **paso a datos reales** (decision del dueno); sus pendientes estan al final.

## 1. Compuerta de calidad (sin variables de entorno)

| Comando | Resultado |
|---|---|
| `npm run typecheck` | sin errores |
| `npm run lint` | sin advertencias ni errores |
| `npm test` (vitest) | **534 pruebas en 27 archivos, todas en verde** (438 al inicio de la fase: +96; duracion ~6 s) |
| `npm run build` | compila; 27 paginas generadas |
| `npx playwright test` | **36 pruebas en verde** (32 previas + 4 de la fase), repetido **3 veces seguidas** sobre el mismo servidor (59.0 s, 57.9 s, 59.1 s): 108 de 108 |

Las pruebas nuevas de la fase: 95 en vitest (`tests/e2e-flows/*` 92 + `tests/industry/vertical-reset.test.ts` 3), 1 ampliacion de `tools.test.ts` (entradas invalidas de `cancel_booking`) y 4 de Playwright.

Verificacion de que las pruebas detectan regresiones (mutaciones manuales, revertidas despues): quitar la comprobacion de administrador al aprobar -> 17 fallos; quitar el filtro de organizacion de `getOwned` -> 9; hacer que cancelar deje de ser critico -> 8; subir el limite de comensales a 20 -> 6; no validar al responsable de una tarea -> 1. Ninguna mutacion paso desapercibida.

## 2. Matriz de requisitos -> pruebas -> resultado

| # | Requisito (plan y prompt de la fase) | Prueba(s) | Resultado |
|---|---|---|---|
| E1 | Clinica: entrada de prospecto por la recepcionista | `scenario-clinic` (1); `e2e/scenarios` Clinica pasos 1 | OK: `create_contact` ejecutado solo, origen `agent_receptionist` |
| E2 | Clinica: calificacion y cita por el agente de agenda | `scenario-clinic` (1); Playwright pasos 2 | OK: busca contacto, revisa disponibilidad real y propone la cita; queda pendiente (nivel equilibrado), la aprueba una persona y existe en la agenda. "Calificacion" = D-23 |
| E3 | Clinica: cancelacion con solicitud de aprobacion humana | `scenario-clinic` (1, 2, 3); Playwright pasos 3-4 | OK: la cita sigue viva hasta aprobar; staff 403 (boton deshabilitado y servidor); admin aprueba y queda `cancelled`; rechazo la deja intacta |
| E4 | Clinica: verificacion de logs y registros | `scenario-clinic` (1); Playwright paso 5 | OK: `agent_actions` (propuesta, revisor, notas, ejecucion, `critical: true`), `activities` con autor agente (alta, cita, cancelacion) y autor persona (cambio humano de estado con nombre); el perfil muestra las insignias |
| E5 | Restaurante: reservacion de grupo grande (caso critico) | `scenario-restaurant` (1-2); Playwright | OK: 12 personas = critica, `risk: high`, motivo "supera el limite de 8" |
| E6 | Restaurante: aprobacion por exceder el limite; la regla existe de verdad | `scenario-restaurant` (1-4); `critical-actions` `create_booking.large_party` | OK. La regla NO existia (solo era texto del prompt): se implemento (D-18). Frontera exacta: 8 se ejecuta solo con autonomia total, 9 pide aprobacion; staff no puede aprobar ni bajando `party_size` |
| E7 | Restaurante: aprobacion humana desde la bandeja y confirmacion de estado | `scenario-restaurant` (1); Playwright | OK: el administrador aprueba, la accion queda `executed` con `reviewed_by`, la reservacion existe (`metadata.party_size = 12`, 90 min) y se ve en la agenda; capturas |
| E8 | Inmobiliario: deteccion de lead sin respuesta a las 48 horas | `scenario-realestate` (1); Playwright | OK: frontera inclusiva (50 h si, 47 h no), solo lead/contactado, otra etapa y otra organizacion fuera |
| E9 | Inmobiliario: tarea de recordatorio asignada al asesor humano | `scenario-realestate` (1-4); Playwright | OK. El esquema NO lo permitia: se anadio `activities.assigned_to` (D-19, migracion 008 sin aplicar). Asignada al asesor de la oportunidad; sin asesor queda sin asignar; el historial muestra "Asignada a ..."; idempotente |
| C1 | Cero regresiones en autenticacion (middleware, demo, live sin sesion -> 401/redireccion, con mocks) | `auth-regression` (13) | OK: demo deja pasar y `/login` redirige a `/`; live sin sesion redirige a `/login` (6 rutas), con sesion pasa; **26 rutas `/api` (38 metodos) responden 401 sin sesion y sin consultar la base**; 2 webhooks 401 sin secreto; la cookie de staff no tiene efecto en live. Hallazgo cerrado: R6-01 |
| C2 | Cero regresiones en gestion de citas | `appointments-regression` (7); `scenario-clinic` | OK: lista por organizacion, crear, cambiar estado (actividad de persona), citas y contactos ajenos 404, citas de agentes en la misma lista |
| C3 | 100% de las acciones criticas requieren intervencion humana, para cada una y en cada nivel | `critical-actions` (25) | OK: 5 reglas x 12 casos positivos x 3 niveles = **36 recorridos completos** (pendiente sin tocar la base, staff 403, staff 403 al suavizar el valor, admin ejecuta y registra revisor, segunda aprobacion 409) + 6 negativos en el limite + `decideApproval` obligatorio en los 3 niveles (36 casos) |
| C4 | Falla si se agrega una herramienta critica sin cobertura | `critical-actions` "Cobertura obligatoria" (5) | OK: regla sin casos, caso huerfano, `critical: true` sin regla (y al reves), regla condicional sin negativos; control negativo que demuestra que el detector falla; atajo que salte la gobernanza (`executeTool`/`runPrepared` fuera de `executor.ts` y `governance.ts`) |
| C5 | Todas las herramientas con al menos un caso de integracion por flujo completo | `tool-coverage` (35) | OK: 16 de 16 (tabla en la seccion 4); falla si `TOOL_NAMES` crece sin caso |
| C6 | Aislamiento por organizacion verificado en cada herramienta | `tool-coverage` (16 sondas + invariantes por flujo) | OK: la organizacion B ataca con ids de A: NOT_FOUND o `failed` al aprobar, nada de A cambia; lecturas (busqueda, estancadas, metricas, briefing, disponibilidad) sin fugas; cada flujo comprueba que lo nuevo o modificado es solo de la organizacion y que la otra queda igual byte a byte |
| C7 | Aislamiento multi-tenant de extremo a extremo | los tres escenarios + C6 + `vertical-reset` | OK: en cada escenario se compara una instantanea completa de la otra organizacion antes y despues (identica) y no aparece ningun dato suyo en respuestas |
| C8 | Capturas de escritorio (1360x860) y movil (390x800) de los pasos clave | `docs/v2/capturas-fase6/` (20 imagenes: bandeja con la accion pendiente, aprobacion, tarea creada, etc.) | OK, revisadas a mano |

## 3. Acciones criticas: enumeracion completa

Fuente unica: `CRITICAL_RULES` en `lib/agents/tools/index.ts` (D-22). Toda ejecucion de un agente pasa por `executeToolGoverned`; la unica via para ejecutar una accion pendiente es `approveAction` (solo admin para las criticas, D-12).

| Regla | Herramienta (agente) | Cuando es critica | Casos positivos | Negativos (limite) | Niveles probados |
|---|---|---|---|---|---|
| `update_stage.close` | `update_stage` (Ventas) | etapa `won` o `lost` | ganada; perdida con motivo | a `proposal` | conservative, balanced, autonomous |
| `calculate_quote.discount` | `calculate_quote` (Ventas) | descuento > 10% | 10.5%, 11%, 100% | 10% exacto; sin descuento | los 3 |
| `create_opportunity.discount` | `create_opportunity` (Ventas) | descuento > 10% | 10.01%, 25% | 10% exacto | los 3 |
| `cancel_booking.always` | `cancel_booking` (Agenda) | siempre | sin motivo; con motivo | (no existe) | los 3 |
| `create_booking.large_party` | `create_booking` (Agenda) | `party_size` > 8 | 9, 12, 500 | 8; sin `party_size` | los 3 |

Para cada recorrido: la llamada del agente devuelve `pending_approval` y la base de datos (todas las tablas salvo la bandeja) queda identica; `agent_actions` guarda `requires_approval: true`, `critical: true`, `risk: high`; staff recibe 403 (tambien enviando una version "suavizada" del valor); el administrador aprueba y la accion pasa a `executed` con `reviewed_by`; una segunda aprobacion da 409.

## 4. Cobertura por herramienta (flujo completo + aislamiento)

Flujo = mensaje -> `handleMessage` (clasificacion del orquestador) -> especialista (bucle del LLM) -> interceptor de gobernanza -> herramienta -> base. "Demo" = LLM preprogramado de la app; "guion" = `createMockLlm` (orquestador, especialista y gobernanza reales; solo cambia quien propone la llamada, D-23).

| Herramienta | Caso de flujo | LLM | Sonda de aislamiento (B ataca con datos de A) |
|---|---|---|---|
| `search_contact` | recepcion: paciente ya registrado; alta | demo | B no ve nombre ni correo de A |
| `create_contact` | alta de un prospecto nuevo | demo | mismo correo y telefono en B: crea en B, no deduplica contra A |
| `update_contact_notes` | nota en el expediente | guion | contacto de A: NOT_FOUND |
| `create_opportunity` | cotizacion que se vuelve oportunidad (aprobada) | demo | contacto de A: NOT_FOUND |
| `update_stage` | mover a calificada | guion | oportunidad de A: NOT_FOUND |
| `calculate_quote` | 2 limpiezas con 5% (1600 -> 1520) | guion | item de A: NOT_FOUND |
| `check_availability` | consulta suelta; flujo de cita y reprogramacion | guion + demo | una cita de A no bloquea horarios de B |
| `create_booking` | cita nueva con aprobacion | demo | contacto o item de A: NOT_FOUND |
| `reschedule_booking` | reprogramar con aprobacion | demo | cita de A: NOT_FOUND |
| `cancel_booking` | cancelar (critica, admin aprueba) | demo | cita de A: la ejecucion aprobada por el admin de B falla con NOT_FOUND |
| `create_task` | seguimiento -> tarea | demo | contacto, oportunidad o responsable de A: NOT_FOUND |
| `log_message` | mensaje enviado | guion | contacto de A: NOT_FOUND |
| `set_reminder` | recordatorio a 2 dias | guion | cita u oportunidad de A: NOT_FOUND |
| `find_stale_opportunities` | seguimiento general y a 48 horas | demo | solo oportunidades de B |
| `get_org_metrics` | metricas del mes | guion | totales = filas de B |
| `generate_briefing` | reporte del dia | demo | sin nombres ni titulos de A |

## 5. Mediciones

| Medicion | Valor | Criterio |
|---|---|---|
| Mensaje -> accion pendiente por la API de chat (servidor de produccion local, LLM de demo) | 8 a 18 ms | n/a (sin LLM real no es representativo de produccion) |
| Listado de la bandeja | 5 ms | n/a |
| Escenario de clinica por la UI (6 pasos, 2 roles) | 5.8 a 8 s | n/a |
| Escenario de restaurante / inmobiliario por la UI | 1.9 a 4.7 s / 0.9 a 2.9 s | n/a |
| Movimiento de tarjeta en el Kanban (Fase 5, repetido en las 3 corridas) | 18, 20 y 31 ms | < 200 ms |
| Pruebas vitest de la fase | 8 archivos, 95 pruebas, ~2.5 s | n/a |
| Cobertura de herramientas con flujo completo | 16/16 (100%) | 100% |
| Cobertura de herramientas con sonda de aislamiento | 16/16 (100%) | 100% |
| Reglas criticas con casos en la matriz | 5/5 (100%) | 100% |
| Rutas `/api` sin sesion que responden 401 | 26/26 archivos (38/38 metodos), 2 webhooks 401 sin secreto | 100% |

## 6. Cambios de producto hechos durante la fase (todos con decision registrada)

- D-17 `cancel_booking` critica; `search_contact` devuelve citas proximas y oportunidades con id.
- D-18 limite de comensales (`party_size` > 8) como regla critica.
- D-19 tareas asignadas a una persona (`activities.assigned_to`, migracion 008 SIN aplicar).
- D-20 seguimiento por horas y por etapa.
- D-21 restablecer los datos de un giro (demo).
- D-22 `CRITICAL_RULES` como fuente unica y pruebas que obligan la cobertura.
- R6-01 `POST /api/appointments/[id]/remind` exige sesion y cita propia (era B-01 de la Fase 0b).

## 7. Riesgos abiertos consolidados (todas las fases)

Estado: ABIERTO = pendiente para datos reales; ACEPTADO = decision del dueno; CERRADO = corregido y probado.

| Id | Origen | Estado | Descripcion | Que hacer |
|---|---|---|---|---|
| R-01, R-02 | Fase 3 | CERRADOS (D-12) | Solo admin aprueba criticas; JSON obligatorio y Origin | cubierto por `critical-actions` y los specs de roles |
| R-03 | Fase 3 | ACEPTADO | Dos admins guardando la configuracion a la vez: gana la ultima escritura | version de fila o RPC al pasar a datos reales |
| R-04 | Fase 3 | ACEPTADO | Sin limite de peticiones en `/api/agents/chat` ni en el sondeo de 10 s | limites por organizacion antes de abrir con LLM real (hay costo por mensaje) |
| R4-01 | Fase 4 | ABIERTO | `ModuleGate` y el menu ocultan modulos, no son control de acceso: las rutas `/api` de un modulo inactivo responden | validar el modulo activo por ruta o en middleware si el negocio lo exige |
| R4-02 | Fase 4 | ABIERTO | Etiquetas personalizadas y modulos activos sin pantalla de edicion | pantalla de configuracion de la organizacion |
| R4-03 | Fase 4 | ABIERTO | Hora local inexistente en cambios de hora (DST) se desplaza una hora | probar con una zona con DST antes de operar en ella |
| R4-04 | Fase 4 | ABIERTO | Pantallas de citas antiguas formatean en la zona del navegador | usar la zona de la organizacion |
| R4-05 | Fase 4 | ABIERTO | El estado de demo vive en memoria del proceso (D-08) | desaparece con datos reales |
| R5-01 | Fase 5 | ABIERTO | El movimiento humano de etapa no es una transaccion (compare-and-set + actividad con compensacion) | funcion SQL (RPC) transaccional |
| R5-02 | Fase 5 | ABIERTO | Staff no puede cerrar oportunidades; no hay "proponer cierre" por la bandeja | decision de producto |
| R5-03 | Fase 5 | ABIERTO | El briefing suma valores sin distinguir monedas, tope de 50 estancadas, "primera atencion" sin tabla de mensajes con direccion | modelo de mensajes y moneda |
| R5-04 | Fase 5 | ABIERTO | El briefing se recalcula en cada visita (lee hasta 10 000 filas por tabla) | cache o vistas con volumen real |
| R5-05 | Fase 5 | ABIERTO | Sin actualizacion en vivo del Kanban entre usuarios (409 y recarga) | Realtime |
| H-01, H-04, H-07 (+H-06 mitigado) | Fase 0b | CERRADOS (commit 52e79d1) | Secreto del webhook, fallback de organizacion, rol admin en `PATCH /api/clinic`, validacion de presupuestos | los webhooks sin secreto responden 401 (prueba) |
| B-01 | Fase 0b | CERRADO (R6-01) | `remind` sin sesion | prueba en `auth-regression` y `appointments-regression` |
| H-02 | Fase 0b | ABIERTO (critico para datos reales) | `handle_new_user` confia en `raw_user_meta_data`; depende de que el registro publico de Auth este apagado | apagar el registro publico y endurecer el trigger |
| H-03, H-05 | Fase 0b | ABIERTO | RLS permisiva para escritura desde el navegador y sin coherencia de organizacion entre tablas | migracion 007 (sin aplicar; la 008 extiende su trigger) |
| H-06 (resto), B-02 a B-08, B-10 | Fase 0b | ABIERTO | Errores internos devueltos al cliente, comodines de `ilike`, `search_path` de funciones, comparacion de secretos no constante, rol sin validar en staff, JSON mal formado = 500 | fase de validacion con Zod |
| B-09 | Fase 0b | ABIERTO (confirmado) | El middleware falla abierto si faltan variables o `getUser()` lanza. Las 26 rutas `/api` responden 401 por si mismas (probado), pero las paginas dependen del middleware | fallar cerrado para rutas no publicas |
| D-01 a D-06 (dudas) | Fase 0b | ABIERTO | Registro publico, Auth Hook activado, grants de `authenticated`, RLS de `users` v1, permisos por rol de producto | comprobarlos en el proyecto Supabase real |
| R6-02 | Fase 6 | ABIERTO | Las rutas mutantes humanas anteriores a la v2 (11 archivos: citas, pacientes, servicios, presupuestos, clinica, staff) no usan `guardMutation` (CSRF); un `DELETE` sin cuerpo no cumple "JSON obligatorio" | mitiga `SameSite=Lax`; unificar con una variante de la guardia para `DELETE` |
| R6-03 | Fase 6 | ABIERTO (importante) | La regla de comensales depende de que el modelo informe `party_size`. Si un LLM real lo omite en una reservacion de grupo y la autonomia es `autonomous`, se ejecuta sola. Con el nivel equilibrado (por defecto) toda cita ya pide aprobacion, pero no es critica | hacer `party_size` obligatorio para giros con reservaciones de grupo, derivarlo del texto en el servidor o validarlo contra la capacidad de la mesa (`items`); probar con el LLM real |
| R6-04 | Fase 6 | ABIERTO | El limite de 8 comensales es una constante global (D-18), no un ajuste por organizacion | ajuste en `organizations.settings` leido por la gobernanza |
| R6-05 | Fase 6 | ABIERTO | Los agentes no tienen herramienta para listar el catalogo: `calculate_quote` exige `item_id`; `search_contact` ya expone ids de citas y oportunidades (D-17) | `search_items` o resolver por nombre |
| R6-06 | Fase 6 | ABIERTO | "Sin respuesta" = sin actividad registrada (D-20). No existe tabla de mensajes entrantes/salientes; un cliente que respondio sin que alguien lo registre cuenta como activo | modelo de mensajes (WhatsApp) |
| R6-07 | Fase 6 | ABIERTO | La tarea asignada solo se ve en el historial del contacto: no hay vista "mis tareas" ni aviso al asesor | modulo de tareas y notificaciones |
| R6-08 | Fase 6 | ABIERTO | Las pruebas usan el LLM de demo y un LLM con guion; el comportamiento de un LLM real (ids, redaccion, orden de llamadas) no esta certificado. La gobernanza no depende del modelo (se verifico llamando a las herramientas directamente), el flujo util si | bateria de evaluacion con el modelo real y claves de prueba |
| R6-09 | Fase 6 | ABIERTO (menor) | El resumen de la bandeja no usa el vocabulario del giro ("Agendar una cita ... para 12 personas" en un restaurante) y el de cancelacion muestra el id de la cita; en movil el estado de la cita se encima al texto en el historial del perfil (UI anterior a la fase) | resumenes con nombres y etiquetas del giro |
| R6-10 | Fase 6 | ACEPTADO | Las acciones pendientes no caducan: aprobar una cancelacion de una cita que ya cambio falla con un error legible (queda `failed`) | caducidad configurable |

## 8. Pendientes para el paso a datos reales

1. Supabase: aplicar migraciones 006, 007 y 008 (con sus rollbacks), activar el Auth Hook, apagar el registro publico, resolver D-01 a D-06 y H-02; correr `supabase/tests/fase0_isolation.sql` y repetir la matriz de aislamiento de `tool-coverage` contra la base real (con RLS) con dos organizaciones reales.
2. Cambiar `RAVYN_DATA_MODE=live` y repetir `tests/e2e-flows/auth-regression.test.ts` con un proyecto de pruebas (hoy usa mocks) mas un recorrido manual de inicio de sesion y cierre.
3. LLM real: `ANTHROPIC_API_KEY` solo en el servidor, limites por organizacion (R-04), evaluacion de la bateria de escenarios con el modelo (R6-08), `party_size` obligatorio o derivado (R6-03), `search_items` (R6-05).
4. Transaccionalidad (R5-01) y concurrencia (R-03): funciones SQL/RPC y versionado de configuracion.
5. Cierre de rutas: B-09 (middleware cerrado), R6-02 (CSRF en rutas humanas), B-02 a B-10 y R4-01.
6. Producto: vista de tareas y notificaciones (R6-07), modelo de mensajes (R6-06), limite de comensales por organizacion (R6-04), moneda en el briefing (R5-03), caducidad de acciones pendientes (R6-10).
7. Retirar o proteger lo exclusivo de demo en produccion: la cookie `ravyn_demo_role`, el selector de vertical y `reset` ya son no-ops fuera de demo (probado); confirmar con `RAVYN_DATA_MODE=live`.

## 9. Alcance y limites de esta certificacion

- Cubre el codigo de la app en modo demo y las rutas HTTP reales con sesion simulada; no cubre RLS, Auth ni el rendimiento con datos reales.
- El LLM es el preprogramado (determinista) y uno con guion. La gobernanza, los permisos, el aislamiento y las aprobaciones no dependen del modelo y estan probados llamando directamente a las herramientas, pero la calidad de las respuestas con un modelo real no esta medida.
- Las pruebas de Playwright comparten un servidor y una base en memoria; se escribieron para repetirse (nombres y telefonos unicos, giros restablecidos) y se repitieron 3 veces seguidas sin intermitencias.
- Reparto: el maestro hizo toda la fase solo, sin subagentes (D-23). La revision de seguridad (`revision-seguridad-fase6.md`) es del propio maestro, no independiente.
