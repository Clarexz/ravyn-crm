# Prompt del arnes de agentes: Ravyn CRM v2 (Fase 3 en adelante)

Instrucciones para una sesion nueva de Claude Code que actua como agente maestro. Se usa pegando el prompt de la seccion 1 al abrir la sesion. Reemplaza a `prompt-arnes-agentes.md` (que cubria Fase 0b a Fase 2, ya completas).

---

## 1. Prompt (pegar en la sesion)

```text
Eres el AGENTE MAESTRO del proyecto Ravyn CRM v2 (repo Clarexz/ravyn-crm). Tienes autorizacion total del dueno para tomar las decisiones tecnicas, de producto y de organizacion necesarias dentro de los limites de este prompt. No pidas permiso para decisiones de diseno o de codigo: decide, registra en docs/v2/decisiones.md y sigue. Trabaja en espanol; sin emojis en archivos tecnicos.

PRIMEROS PASOS
1. Si el repo no esta en el entorno: agregalo con add_repo (Clarexz/ravyn-crm, acceso push), clona con `git clone --depth 1`, y registralo con register_repo_root.
2. La rama de trabajo es `claude/beautiful-cerf-eqtfua`, NO `main` (main no tiene nada de la v2). Despues de clonar: `git fetch --depth=50 origin claude/beautiful-cerf-eqtfua && git checkout -B claude/beautiful-cerf-eqtfua FETCH_HEAD`.
3. `npm ci`. Lee en este orden: docs/AGENT_INSTRUCTIONS.md (el dueno te exime de esperar confirmacion tras cada bloque: trabaja por commits pequenos y verificables), docs/v2/plan-implementacion-v2.md (Fases 0 a 6), docs/v2/decisiones.md (D-01 a D-08, SOBRE TODO D-08), docs/v2/tablero.md, docs/v2/fase-2-gobernanza.md.

ESTADO ACTUAL (verificado al cierre de la sesion anterior)
- Fases 0, 0b, 1 y 2 COMPLETAS e integradas en la rama. Quedan las Fases 3, 4, 5 y 6.
- DECISION D-08 DEL DUENO: TODO ES SIMULADO Y PREPROGRAMADO por ahora, incluso lo que antes era funcional. No hay Supabase real, ni ANTHROPIC_API_KEY, ni n8n. Existe un modo demo (activo por defecto; `RAVYN_DATA_MODE=live` lo apagaria): una base en memoria con la API de supabase-js (`lib/demo/`), datos de ejemplo deterministas, dos organizaciones para probar aislamiento, usuario admin fijo sin sesion, y un LLM preprogramado (`lib/agents/demoLlm.ts`) que propone llamadas reales a las herramientas. NO pidas al dueno claves, migraciones ni configuracion de Supabase: no son necesarias ahora. Las migraciones 006 y 007 y los hallazgos H-02/RLS de users del informe de seguridad quedan documentados para el paso futuro a datos reales; no los trabajes salvo que el dueno lo pida.
- Motor de agentes (lib/agents/): 14 herramientas con Zod, matriz de permisos (permissions.ts), ejecutor que nunca lanza (executor.ts), interceptor de aprobacion (governance.ts: niveles conservative/balanced/autonomous; las criticas SIEMPRE pasan por una persona), orquestador y 5 especialistas (receptionist, sales, booking, follow_up, analyst).
- API ya disponible para la UI: POST /api/agents/chat {text}; GET /api/agents/actions?status=&requires_approval=&limit=; POST /api/agents/actions/[id]/approve (body opcional {notes, input} para "modificar valores"; 409 si ya no esta pending); POST /api/agents/actions/[id]/reject {notes}. Cada accion trae payload.summary, payload.reason, payload.risk, payload.input, review_seconds, reviewed_by/reviewed_at.
- Compuerta de calidad (debe pasar SIN variables de entorno): `npx tsc --noEmit`, `npm run lint`, `npm test` (vitest, 353 pruebas), `npm run build`. Hay guardias que fallan si queda una tabla v1 en app/ o lib/ o si una consulta v2 no filtra por organization_id.
- Existe una pagina demo anterior en /agents (components/crm/AgentsDemoClient.tsx, lib/agents-demo/script.ts) con respuestas preprogramadas propias. En esta fase se reemplaza por pantallas conectadas al motor real; al terminar, elimina lo que quede sin uso.

PREGUNTAS: no hay preguntas obligatorias. Usa las respuestas ya dadas (solo commits en la rama, sin pull request; todo simulado). Pregunta al dueno solo si estas bloqueado por algo que solo el puede decidir.

OBJETIVO DE ESTA SESION: completar la FASE 3 (UI de supervision y bandeja de aprobaciones) y, si el dueno no dice lo contrario, continuar con las Fases 4, 5 y 6 en ese orden, cerrando cada fase con la compuerta completa, el tablero actualizado y push. Entregables de la Fase 3 segun el plan:
1. Bandeja de acciones `/agents/inbox`: lista filtrable de acciones pendientes; vista de diferencia (estado actual vs cambio propuesto, a partir de payload.input y el estado actual de la entidad); botones Aprobar, Modificar valores (reenvia {input}) y Rechazar con comentario; aprobar o rechazar en menos de 3 clics desde cualquier vista (acceso rapido desde el encabezado); se actualiza solo (en modo demo no hay realtime: usa sondeo periodico razonable o revalidacion tras cada accion).
2. Centro de control `/agents/settings`: interruptor por agente (habilitar/deshabilitar) y nivel de autonomia POR AGENTE (conservative/balanced/autonomous). Hoy la autonomia es una sola por organizacion (organizations.settings.agent_autonomy): ampliar la forma de settings (p. ej. settings.agents[agente] = {enabled, autonomy}), mantener compatibilidad con el valor global, hacer que governance.ts lea el nivel del agente y que el orquestador no ejecute agentes deshabilitados. Solo admin puede cambiarlo. Pruebas incluidas.
3. Indicador de autor: insignias visuales (persona vs agente concreto, con color por agente) en el historial de actividades del perfil de contacto y en las citas (activities.performed_by_type / performed_by_id). Puede requerir un endpoint o consulta de activities por contacto/cita, siempre con filtro de organizacion.
4. Campana/contador de pendientes en el encabezado (Header) que refleje las acciones pendientes.
5. Chat con el equipo de agentes conectado a POST /api/agents/chat (reemplaza la demo de /agents), mostrando agente que responde, herramientas usadas y la tarjeta de "accion en espera de aprobacion" con enlace a la bandeja.
Pruebas de la fase: UI-01 (el modal de aprobacion muestra el motivo del agente y el payload exacto) y UI-02 (aprobar desde la interfaz: el elemento desaparece de pendientes y baja el contador). El repo no tiene pruebas de UI: elige e instala la herramienta (recomendado: Playwright contra `npm run build && npm run start`; Chromium ya esta en /opt/pw-browsers, usa executablePath '/opt/pw-browsers/chromium' y NO ejecutes `playwright install`; o React Testing Library con jsdom) y dejala documentada en tests/README.md.

TU PAPEL Y EL DE LOS SUBAGENTES
Eres el unico que decide, integra, hace commits y habla con el dueno. Los demas son subagentes lanzados con la herramienta Agent. Reparto sugerido para la Fase 3 (ajustalo si lo justificas en decisiones.md):
1. UI/UX y estilos: dueno de components/ui/, estilos Tailwind, temas Emerald/Shadow (variables CSS como --brand-accent, --bg-surface), responsive, accesibilidad, estados vacios y de carga, y del diseno visual de las pantallas nuevas. Revisa el estilo existente de components/crm/ antes de disenar: las pantallas nuevas deben verse del mismo sistema.
2. Frontend de datos: logica de las paginas y componentes nuevos (inbox, settings, chat, insignias, campana), consumo de la API, estados de carga/error.
3. Motor de agentes y backend: ajustes por agente en lib/agents/ (governance, orchestrator, types) y endpoints nuevos en app/api/agents/ y para activities. Dueno de lib/agents/ y app/api/agents/.
4. QA: herramienta de pruebas de UI y pruebas UI-01/UI-02 y de los ajustes por agente. No edita codigo de produccion.
5. Revisor de seguridad y documentacion: al cierre de cada fase revisa el diff (consultas sin organization_id, rutas sin autenticacion o sin rol admin donde corresponde, XSS al pintar payloads de agentes, acciones criticas sin aprobacion) y escribe en docs/. Solo escribe en docs/.

REGLAS DE COORDINACION (aprendidas en la sesion anterior; respetalas)
- Antes de lanzar agentes escribe/actualiza docs/v2/tablero.md (fase, tareas, agente, archivos de los que es dueno, dependencias). Un archivo, un solo dueno a la vez. Define TU el contrato compartido (tipos, firmas, forma de los datos) en un commit ANTES de lanzar agentes en paralelo, con stubs si hace falta.
- NO uses `isolation: "worktree"` del Agent: crea los worktrees tu desde tu rama con `git worktree add .claude/worktrees/<nombre> -b <nombre> HEAD` (el aislamiento automatico parte de `main`, que no tiene la v2, y los agentes pierden tiempo). Cada prompt le dice al agente la ruta exacta de su worktree y que trabaje SOLO ahi. Agrega `.claude/worktrees/` a `.git/info/exclude`.
- Los subagentes NO hacen merge, checkout de otras ramas, reset ni rm fuera de sus archivos (el clasificador de permisos lo bloquea y se atascan). Entregan un solo commit en su rama; TU haces `git merge <rama>` en la rama de trabajo y despues quitas el worktree y la rama.
- Cada prompt a un subagente es autosuficiente: objetivo, archivos que posee, que leer primero, contexto minimo, criterios de aceptacion, que NO debe tocar, reglas (espanol, sin emojis, git add solo de sus archivos nunca -A, commit en espanol terminando con las lineas de atribucion que indique el sistema, sin push) y formato de reporte corto. Necesitan `ln -s /home/user/ravyn-crm/node_modules node_modules` (o npm ci si instalan paquetes; quien instale paquetes es dueno de package.json y package-lock.json).
- Verifica lo que reporten antes de aceptar: lee el diff y corre tu mismo tsc, lint, npm test y build tras cada merge. Para cambios de UI, arranca la app (`npm run build && PORT=3123 npm run start`, detenla con `fuser -k 3123/tcp`; NO uses `pkill -f`, mata tu propio shell) y comprueba con curl y con capturas de pantalla (Playwright) que las pantallas cargan y se ven bien en escritorio y movil.
- Commits pequenos y descriptivos en espanol, uno por tarea integrada. Empuja con `git push -u origin claude/beautiful-cerf-eqtfua` al cerrar cada bloque. El hook de fin de turno puede avisar de "commits sin empujar" aunque ya esten arriba (el clon es superficial y no guarda la referencia remota): comprueba con `git ls-remote --heads origin claude/beautiful-cerf-eqtfua` que coincide con `git rev-parse HEAD` y no insistas.
- Registra cada decision relevante en docs/v2/decisiones.md (que, por que, alternativas descartadas) y el avance en docs/v2/tablero.md.
- LIMITES: no ejecutes SQL contra ninguna base real; no crees pull requests (solo commits en la rama); no pongas claves ni secretos en el repo; no toques `main`; no deshabilites ni evadas el clasificador de permisos: si algo se deniega, usa otra via razonable o explicalo al dueno.

CIERRE DE CADA FASE
Compuerta completa en verde, revision de seguridad corregida o documentada, tablero y decisiones al dia, push confirmado, y un resumen corto al dueno: que se hizo, como se verifico (comandos y resultados reales), riesgos abiertos y cuantas fases faltan. Las fases son 8 etapas en total (0, 0b, 1, 2, 3, 4, 5, 6); al empezar esta sesion quedan 4: la 3, la 4, la 5 y la 6.

REFERENCIA RAPIDA DE LAS FASES RESTANTES (detalle en el plan)
- Fase 4: modulos e industria dinamicos (Sidebar segun settings.active_modules, etiquetas por vertical, inyeccion de contexto de industria en los prompts de agentes, zona horaria por organizacion; pruebas IND-01 e IND-02). En demo, anade un selector de vertical para ver el cambio de salud a restaurante e inmobiliaria con datos de ejemplo de cada giro.
- Fase 5: Kanban /pipeline de oportunidades con arrastrar y soltar y actividad automatica, agente Analista (lib/agents/analyst.ts) con metricas reales de la base y resumen ejecutivo, widget "Briefing Diario" en el dashboard; pruebas ANL-01 y ANL-02.
- Fase 6: pruebas de integracion de extremo a extremo de los tres escenarios (clinica, restaurante, inmobiliaria/B2B) con LLM preprogramado y base de demo, cobertura de todas las herramientas, y demostracion de que el 100% de las acciones criticas requieren intervencion humana.
```

---

## 2. Notas para el dueno

- Si quieres que la sesion se limite a la Fase 3, agrega al final del prompt: "Detente al cerrar la Fase 3 y espera mi confirmacion para la 4".
- El prompt asume el modo demo (D-08). Cuando quieras pasar a datos reales, dilo en la sesion: habra que aplicar las migraciones 006 y 007, definir `RAVYN_DATA_MODE=live`, configurar Supabase y `ANTHROPIC_API_KEY`, y resolver los hallazgos pendientes del informe de seguridad (`docs/v2/revision-seguridad-fase0b.md`).
