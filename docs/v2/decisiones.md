# Ravyn CRM v2 - Registro de decisiones

Formato: que se decidio, por que, alternativas descartadas.

## D-01 (2026-10-14) Rama de trabajo y punto de partida
- Que: se trabaja sobre `claude/beautiful-cerf-eqtfua`. Las migraciones 001 a 005 y los documentos v2 no estan en `main`; solo existen en esa rama.
- Por que: es la unica rama que contiene la Fase 0 de base de datos.
- Descartado: partir de `main` (no tiene `supabase/`).
- Nota: la rama incluye un commit de demo del Centro de Agentes (`/agents`, `lib/agents-demo/`, `components/crm/AgentsDemoClient.tsx`) con respuestas preprogramadas. No se toca hasta la Fase 3; es solo demostracion.

## D-02 Respuestas del dueno a las preguntas obligatorias
- Base de datos de la app desplegada: la del servidor donde se aplicaron 001 a 005. La 006 se aplica ahi despues de 005.
- Proveedor de IA: SDK de Anthropic con `ANTHROPIC_API_KEY`. La clave NO esta disponible en el entorno de esta sesion; las pruebas usan LLM simulado y la clave real se configura en Vercel.
- Entrega: solo commits en la rama, sin pull request al terminar cada fase.

## D-03 Capa de mappers en la Fase 0b
- Que: las rutas y paginas consultan las tablas v2 (`contacts`, `items`, `bookings`, ...) filtrando siempre por `organization_id`, y `lib/supabase/mappers.ts` convierte las filas v2 a los view-models que la UI ya usa (`Patient`, `Service`, `Appointment`).
- Por que: no hay forma de ejecutar la app contra la base real desde esta sesion; solo tsc, lint y build. Mantener estables las props de los componentes reduce el riesgo de regresiones silenciosas. Las pantallas nuevas (Fase 3 en adelante) usan tipos v2 directamente.
- Descartado: reescribir las props de los 13 componentes de `components/crm/` a tipos v2 en esta fase (alto riesgo, sin beneficio funcional inmediato).

## D-04 Contexto de auth
- Que: `getClinicContext()` devuelve `organizationId` (desde `users.organization_id`, con respaldo en `clinic_id`) y mantiene `clinicId` como alias deprecado hasta migrar el ultimo consumidor.
- Por que: permite migrar modulo por modulo sin romper la app en ningun commit.

## D-05 Reparto de subagentes por modulo en la Fase 0b
- Que: en la Fase 0b cada subagente es dueno de un modulo completo (ruta API + pagina + componente cliente), no de una capa.
- Por que: ruta, pagina y componente de un mismo modulo cambian juntos; repartir por capa obliga a coordinar archivos compartidos y rompe la app entre commits. Los modulos no comparten archivos, asi que corren en paralelo en worktrees. El reparto por capa del prompt se retoma en la Fase 1.
- Descartado: reparto estricto por capa en esta fase.

## D-06 Correcciones de la revision de seguridad de la Fase 0b
Informe completo: `docs/v2/revision-seguridad-fase0b.md`.
- Corregido en codigo: H-01 (el webhook `appointment-created` exige `X-Webhook-Secret`, igual que `appointment-updated`; se elimino el fallback "primera organizacion"; ahora acepta `organization_id` o un nombre de sucursal exacto y unico, y responde 400 si no se resuelve), H-06 (los nombres se escapan antes de `ilike`), H-04 (`PATCH /api/clinic` exige rol admin), H-07 (los importes y `validity_days` de presupuestos se validan en el servidor).
- Cambio de contrato n8n: el webhook ya no cae en una organizacion arbitraria. n8n debe enviar el secreto y, de preferencia, `organization_id`.
- Pendiente de decision del dueno, no se toco: el middleware redirige a `/login` toda peticion sin sesion, incluidos los webhooks; si n8n debe llamarlos hay que excluir `/api/webhooks/` del matcher, y eso solo es seguro con el secreto ya validado. H-02 (`handle_new_user` confia en metadatos del cliente: deshabilitar registro publico en Auth o mover a `raw_app_meta_data`) y la duda sobre RLS de `public.users`.
- Pendiente en migracion nueva (007): H-03 (quitar escritura a `authenticated` en tablas v2 y dejar solo SELECT) y H-05 (triggers de coherencia de organizacion en bookings, activities y opportunities).

## D-07 Motor de agentes (Fase 1)
- Matriz de permisos fijada por el maestro en `lib/agents/permissions.ts`. Se agregaron `find_stale_opportunities` y `get_org_metrics` (lecturas) para seguimiento y analista; el plan no las nombraba.
- `critical` es estatico por herramienta; la decision exacta para la Fase 2 la da `isCriticalCall(tool, input)` (update_stage a won/lost, descuento > 10%).
- El horario laboral se interpreta en UTC (settings.business_hours no trae zona horaria). Pendiente: zona horaria por organizacion en la Fase 4.
- El organizationId de las herramientas viene siempre de la sesion; el runtime descarta cualquier clave de organizacion que proponga el modelo.
- Migracion 007 (H-03, H-05) escrita y sin ejecutar; el dueno debe aplicarla y correr `supabase/tests/fase0b_hardening.sql`.

## D-08 (2026-10-14) Todo simulado y preprogramado por ahora
- Que: por indicacion del dueno, ningun dato es real durante esta etapa, tampoco el de los modulos que ya funcionaban. Se agrega un modo demo (`lib/demo/`, `RAVYN_DATA_MODE`, activo por defecto): una base en memoria con la API de supabase-js, sembrada con datos de ejemplo, reemplaza a Supabase detras de `createAdminClient` y `getClinicContext`; el middleware no exige sesion; los agentes usan un LLM preprogramado. Las rutas, las herramientas y las pruebas siguen usando el mismo codigo.
- Por que: el dueno no quiere depender de una base real ni de claves en esta etapa; el modo demo permite ver y probar todo el flujo (incluida la aprobacion humana) sin infraestructura y se cambia a datos reales con una variable.
- Consecuencias: las migraciones 006 y 007, Auth, RLS, `ANTHROPIC_API_KEY`, n8n y realtime dejan de ser requisitos inmediatos (quedan documentados para el paso a datos reales). El estado vive en memoria del proceso: se reinicia al reiniciar el servidor y en despliegues serverless cada instancia tiene su copia; es aceptable para demo.
- Descartado: mantener la app contra Supabase y simular solo los agentes.

## D-09 (Fase 3) Configuracion de agentes por organizacion
- Que: `organizations.settings.agents[agente] = {enabled, autonomy}` convive con el valor global `agent_autonomy` (Fase 2), que pasa a ser el valor por defecto de los agentes sin ajuste propio; sin entrada, el agente esta habilitado. Logica en `lib/agents/settings.ts`. `governance.ts` lee el nivel del agente que ejecuta y rechaza (`PERMISSION_DENIED`, sin crear accion) las llamadas de un agente deshabilitado; el orquestador responde con un aviso y no invoca al especialista deshabilitado. Si la lectura de la configuracion falla, se aplica el nivel conservador con agentes activos (ante la duda, mas estricto). El orquestador no es configurable.
- Que NO cambia: las acciones criticas siguen exigiendo aprobacion en cualquier nivel; aprobar una accion ya pendiente de un agente que luego se deshabilito sigue siendo posible (la decision es de una persona).
- API: `GET /api/agents/settings` (cualquier usuario autenticado, informa `is_admin`) y `PATCH` (solo admin, cuerpo estricto con Zod, mezcla sin pisar otras claves de settings).
- Descartado: columna o tabla nueva para la configuracion (no hay migracion en modo demo; `settings` ya es jsonb). Riesgo aceptado: dos admins guardando a la vez hacen lectura-mezcla-escritura sin bloqueo (la ultima escritura gana por agente tocado).

## D-10 (Fase 3) Bandeja, diff y contador
- Que: la vista de diferencia se calcula en el servidor (`lib/agents/diff.ts`, `GET /api/agents/actions/[id]` devuelve `{action, diff}`) leyendo el estado actual de la entidad con filtro de organizacion; un id ajeno se comporta como inexistente. El contador usa `GET /api/agents/pending-count`. Sin realtime en demo: sondeo cada 10 s mas un evento de ventana (`ravyn:agents-changed`) que refresca campana, bandeja y pestanas al instante tras cada accion.
- Aprobar/rechazar en menos de 3 clics: campana (1) -> Aprobar/Rechazar (2); o bandeja -> boton rapido (1). El modal agrega comentario, "Modificar valores" (solo campos escalares; se reenvia `{input}` completo) y el detalle exacto del payload.
- Seguridad de UI: todo valor del agente se pinta como texto de React (sin `dangerouslySetInnerHTML`).
- Descartado: una tabla de diff generica en cliente (el cliente no tiene permiso ni contexto para leer entidades con filtro de organizacion).

## D-11 (Fase 3) Insignias, chat y herramienta de pruebas de UI
- Que: `AuthorBadge` (persona vs agente con color propio) y `ActivityTimeline` (consume `GET /api/activities?contact_id|booking_id`, con nombres de personas resueltos dentro de la organizacion) en el perfil de contacto y en el detalle de la cita. El chat de `/agents` usa `POST /api/agents/chat` y muestra el agente, las herramientas y la tarjeta "accion en espera" (la traza de herramientas ahora incluye `pending: {actionId, summary}`). Se elimino la demo anterior (`AgentsDemoClient`, `lib/agents-demo/`). Se monto el `Toaster` de sonner en el layout del dashboard (antes los `toast` de varios modulos no se veian).
- Pruebas de UI: Playwright contra `next start` en modo demo, Chromium preinstalado (ver `tests/README.md`). Descartado: React Testing Library + jsdom (no ejercita rutas, modal ni sondeo reales).
- Reparto: el maestro hizo toda la fase sin subagentes en paralelo (los modulos compartian contrato y archivos de estilo; coordinar worktrees costaba mas que implementar). La revision de seguridad la hizo el propio maestro sobre el diff y se documenta en `revision-seguridad-fase3.md` (no es una revision independiente).

## D-12 (2026-10-15) Cierre de riesgos de la Fase 3
- R-01: solo `admin` aprueba acciones criticas (`payload.critical` o criticidad recalculada sobre los valores modificados, para que un revisor no pueda volver critica una accion a escondidas); `staff` recibe 403 y la accion sigue pendiente; rechazar y aprobar no criticas siguen abiertos a cualquier usuario de la organizacion. Las rutas de lista y detalle informan `is_admin` y la campana, la bandeja y el modal deshabilitan Aprobar con "Solo un administrador puede aprobar acciones criticas".
- Simular staff en demo: cookie `ravyn_demo_role=staff`, leida solo en modo demo por `getClinicContext` (usa al usuario `reception` de la semilla). Descartado: cabecera (no la puede fijar el navegador) y una segunda sesion demo completa (excesivo).
- R-02: utilidad `lib/http/requestGuard.ts` (JSON obligatorio + Origin del mismo host, 415/403). La UI ya enviaba JSON; approve/reject sin cuerpo envian `{}`.
- R-03 y R-04: aceptados por el dueno, sin implementar (ver revision-seguridad-fase3.md).

## D-13 (Fase 4) Paquetes de industria, zona horaria y selector de vertical
- Que: una sola definicion por vertical en `lib/industry/packs.ts` (modulos activos, etiquetas singular/plural, boton principal de agenda, zona horaria y horario por defecto, directrices de agentes). `resolveTenantConfig(org)` fusiona el paquete con `organizations.settings` (`active_modules` manda si existe y se ignoran ids desconocidos; `labels` puede sobrescribir etiquetas; `timezone` IANA, UTC si falta o es invalida). Sin ramas por industria en los componentes: `TenantProvider` (layout del dashboard) entrega la configuracion y `lib/industry/nav.ts` construye el menu.
- Mapa del plan a la app: Citas/Reservaciones/Visitas/Reuniones = modulo `bookings` (`/appointments`); Paciente/Comensal/Prospecto/Cliente = `contacts` (`/patients`); Servicios/Mesas/Propiedades = `items` (`/services`, solo items de tipo service); Presupuestos/Cotizaciones = `budgets`. `pipeline` esta en los paquetes de salud, inmobiliaria y servicios (el esquema lo reporta activo) pero con `available: false` hasta la Fase 5 (`/pipeline`), asi el menu no muestra rutas inexistentes. Quedan fuera por no tener pantalla: Fidelizacion, Tareas como modulo propio y un modulo Mesas/Propiedades con campos propios (se reutiliza el catalogo con etiquetas del giro).
- Zona horaria: `lib/industry/time.ts` (Intl, sin dependencias). `settings.business_hours` se interpreta en `settings.timezone` en `check_availability`, `create_booking`, `reschedule_booking` y la presentacion (las horas siguen entrando y saliendo en UTC; los slots traen ademas `start_local`; el prompt trae la hora local actual; el modal de aprobacion muestra las fechas del payload en la hora de la organizacion). Sin `timezone` se conserva UTC (compatibilidad con la Fase 1, ver D-07). Descartado: anadir date-fns-tz/luxon (Intl basta). Limite conocido: las pantallas antiguas de citas formatean en la zona del navegador; los horarios en un hueco de cambio de hora (DST) se desplazan.
- Contexto en los prompts: el orquestador carga la configuracion de la organizacion de la sesion y la inyecta en `industryContext` (vocabulario obligatorio, zona horaria y hora local, horario, reglas de cancelacion y limites del giro). Nombre y etiquetas editables se pasan por `oneLine` (una linea, sin comillas) para no abrir inyeccion de prompt. El LLM de demo lee la industria del prompt y cambia saludo y vocabulario.
- Esquema/API: `GET /api/organization/schema` (cualquier usuario autenticado) y `PATCH` (admin, cuerpo estricto `{industry?, timezone?}`, guardia CSRF de D-12). El id de la organizacion sale siempre de la sesion.
- Selector de vertical (solo demo y solo admin): cambia industria, modulos, horario y etiquetas, y el espacio de trabajo de ejemplo de la organizacion. Cada giro conserva su propio espacio (contactos, catalogo, citas, oportunidades, actividades, presupuestos, acciones de agentes): al cambiar se retira el actual (`DemoDb.takeOrgRows`, solo filas de esa organizacion), se guarda en memoria y se restaura al volver, con los cambios hechos. Los datos de cada giro se generan una vez desde `lib/demo/verticals.ts` (una funcion, sin duplicar codigo por giro) en la hora local del giro. Fuera de demo, `PATCH` solo cambia la configuracion. Descartado: sembrar los cuatro giros a la vez con una marca de vertical (obligaria a filtrar todas las consultas) y borrar y resembrar (perderia los cambios del usuario y tocaria la otra organizacion).
- Demo: `Clinica Demo` America/Mexico_City; `Sonrisas del Norte` America/Monterrey, con menu reducido (sin presupuestos ni reportes) para mostrar modulos distintos por organizacion; sus citas se movieron a 16:00-17:00 UTC (10:00-11:00 locales).
- `ModuleGate` muestra un aviso si se entra por URL a un modulo inactivo: es solo UX, no control de acceso (los datos siguen siendo de la propia organizacion).
