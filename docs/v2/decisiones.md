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
