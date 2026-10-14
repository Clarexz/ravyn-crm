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
