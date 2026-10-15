# Prompt del arnes de agentes: Ravyn CRM v2 (Fase 5)

Instrucciones para una sesion nueva de Claude Code que actua como agente maestro. Se usa pegando el prompt de la seccion 1 al abrir la sesion. Reemplaza a `prompt-arnes-fase3.md` (Fases 3 y 4 ya completas).

---

## 1. Prompt (pegar en la sesion)

```text
Eres el AGENTE MAESTRO del proyecto Ravyn CRM v2 (repo Clarexz/ravyn-crm). Tienes autorizacion del dueno para tomar las decisiones tecnicas y de producto de esta sesion dentro de los limites de este prompt. No pidas permiso para decisiones de diseno o de codigo: decide, registra en docs/v2/decisiones.md y sigue. Trabaja en espanol; sin emojis en archivos tecnicos.

PRIMEROS PASOS
1. Si el repo no esta en el entorno: add_repo (Clarexz/ravyn-crm, acceso push), `git clone --depth 1 https://github.com/Clarexz/ravyn-crm /home/user/ravyn-crm` (timeout generoso, un solo clon) y register_repo_root.
2. La rama de trabajo es `claude/beautiful-cerf-eqtfua`, NO `main` (main no tiene nada de la v2). Despues de clonar: `git fetch --depth=50 origin claude/beautiful-cerf-eqtfua && git checkout -B claude/beautiful-cerf-eqtfua FETCH_HEAD`. Verifica que HEAD es 217ec52 o posterior.
3. `npm ci`. Lee en este orden: docs/AGENT_INSTRUCTIONS.md (el dueno te exime de esperar confirmacion tras cada bloque: trabaja por commits pequenos y verificables), docs/v2/plan-implementacion-v2.md (Fase 5 y 6), docs/v2/decisiones.md (D-01 a D-13, sobre todo D-07, D-08, D-09, D-12 y D-13), docs/v2/tablero.md, docs/v2/revision-seguridad-fase4.md y tests/README.md.

ESTADO ACTUAL
- Fases 0, 0b, 1, 2, 3 y 4 COMPLETAS y empujadas. Quedan la 5 y la 6.
- D-08: TODO ES SIMULADO Y PREPROGRAMADO (modo demo por defecto, base en memoria en lib/demo/, usuario admin fijo sin sesion, LLM preprogramado en lib/agents/demoLlm.ts). No pidas claves, migraciones ni configuracion de Supabase. Las migraciones 006 y 007 y los hallazgos de docs/v2/revision-seguridad-fase0b.md quedan para el paso futuro a datos reales; no los trabajes.
- Lo que ya existe y debes reutilizar:
  * Herramientas de agentes (lib/agents/tools/): update_stage (critica si la etapa es won o lost), create_opportunity, find_stale_opportunities, get_org_metrics, create_task, etc. Permisos en lib/agents/permissions.ts; el analista hoy solo lee. Interceptor de aprobacion en lib/agents/governance.ts (R-01: solo un admin aprueba acciones criticas; staff recibe 403).
  * Etapas de oportunidad en la base: lead, contacted, qualified, proposal, negotiation, won, lost. Las actividades (activities) llevan performed_by_type/performed_by_id y alimentan las insignias de autor (components/crm/AuthorBadge.tsx, ActivityTimeline.tsx).
  * Configuracion de industria (D-13): lib/industry/packs.ts. El modulo `pipeline` ya existe en los paquetes con `available: false` (la ruta /pipeline no existe). Al crear la pantalla, pon `available: true` en MODULES.pipeline y agrega la entrada al menu en lib/industry/nav.ts; el nombre sale de labels.pipeline (Tratamientos, Eventos, Operaciones, Oportunidades segun la vertical; el restaurante no la tiene activa). Los tests de menu en tests/industry/ y e2e/industry.spec.ts fijan el menu exacto de cada vertical: actualizalos conscientemente.
  * Zona horaria por organizacion (lib/industry/time.ts) y selector de vertical de demo (lib/demo/verticals.ts: cada giro tiene sus oportunidades de ejemplo, algunas estancadas).
  * Dashboard: components/crm/DashboardClient.tsx y app/(dashboard)/dashboard/page.tsx.
  * Guardia CSRF para rutas mutantes: lib/http/requestGuard.ts (JSON obligatorio, Origin del mismo host). Toda ruta nueva que escriba debe usarla. Simular un staff en demo: cookie ravyn_demo_role=staff (solo modo demo).
- Compuerta de calidad (debe pasar SIN variables de entorno): `npm run typecheck`, `npm run lint`, `npm test` (vitest, 413 pruebas), `npm run build` y `npx playwright test` (20 pruebas de UI; ver tests/README.md: Chromium en /opt/pw-browsers/chromium, NO ejecutar `playwright install`; servidor con `PORT=3123 npm run start`, detenerlo con `fuser -k 3123/tcp`, NO usar `pkill -f`). Hay guardias que fallan si queda una tabla v1 en app/ o lib/ o si una consulta v2 no filtra por organization_id.

OBJETIVO: FASE 5 (pipeline de ventas y agente Analista), segun el plan:
1. Tablero Kanban `/pipeline`: columnas por etapa comercial (Lead, Contactado, Calificado, Propuesta, Negociacion, Ganado, Perdido; justifica en decisiones.md si omites o agrupas alguna), tarjetas con titulo, contacto, valor y dias sin actividad; arrastrar y soltar con actualizacion de estado y registro AUTOMATICO de actividad (type stage_change, autor persona) en la misma operacion; accesible por teclado y utilizable en movil. Respuesta de la interfaz menor a 200 ms al mover una tarjeta (actualizacion optimista con reversion si el servidor falla; mide y documenta el tiempo). Decide y registra: libreria de arrastre (por ejemplo dnd-kit) o HTML5 nativo; quien puede cerrar como Ganado/Perdido (recomendado: coherente con R-01, solo admin; staff ve el movimiento bloqueado con explicacion); ruta propia para el movimiento humano (organization_id de la sesion, guardia CSRF, validacion Zod, transicion atomica) sin pasar por la aprobacion de agentes, que sigue intacta para los agentes.
2. Agente Analista (`lib/agents/analyst.ts`): consulta consolidada de metricas calculadas SOLO desde la base (tiempo de respuesta a prospectos nuevos, porcentaje de conversion de cotizaciones/oportunidades, porcentaje de inasistencias o no-show, valor del embudo, oportunidades estancadas) y generador de resumen ejecutivo en lenguaje natural estructurado (secciones: metricas, alertas de atencion prioritaria, acciones recomendadas). Las cifras del texto deben salir de los numeros calculados (plantilla/formato determinista), nunca de un modelo: cero cifras inventadas. Reutiliza get_org_metrics y find_stale_opportunities cuando convenga y respeta el vocabulario de la vertical activa (D-13). Conecta al especialista analista y al LLM de demo para que el chat lo use.
3. Widget "Briefing Diario" al inicio del dashboard: tarjeta con el resumen del Analista y las alertas prioritarias, con estados de carga, vacio y error, y enlaces a /pipeline y a la bandeja de aprobaciones. Ruta GET para el briefing (solo lectura, filtra por organizacion de la sesion).
Pruebas de la fase (vitest y Playwright):
- ANL-01: con datos simulados de 30 dias, las cifras del reporte coinciden EXACTAMENTE con calculos de control independientes (consultas/filtros escritos aparte en la prueba, no reutilizando el codigo bajo prueba). Cubre bordes: sin datos, division por cero, organizacion distinta sin fugas.
- ANL-02: una oportunidad abierta estancada 15 dias o mas aparece de forma explicita en las acciones recomendadas del resumen (y una con actividad reciente no).
- Kanban: mover entre etapas persiste y crea la actividad; mover a won/lost como staff se bloquea; otra organizacion no se ve afectada; fallo del servidor revierte la tarjeta; tiempo de respuesta de la UI. Playwright: arrastrar una tarjeta, comprobar actividad en el perfil del contacto, capturas en escritorio (1360x860) y movil (390x800) de las verticales con pipeline activo (salud, inmobiliaria, servicios).
Documenta cualquier herramienta nueva en tests/README.md.

TU PAPEL Y SUBAGENTES (opcional)
Eres el unico que decide, integra, hace commits y habla con el dueno. Puedes trabajar tu solo (en las Fases 3 y 4 fue lo mas eficiente) o lanzar subagentes con la herramienta Agent si algun bloque es realmente independiente (por ejemplo, el Kanban de UI y el Analista de backend). Si usas subagentes: define TU el contrato compartido (tipos, firmas, forma de los datos del briefing y del movimiento de etapa) en un commit ANTES de lanzar en paralelo; NO uses `isolation: "worktree"` (crea los worktrees tu: `git worktree add .claude/worktrees/<nombre> -b <nombre> HEAD`, agrega `.claude/worktrees/` a `.git/info/exclude`); un archivo, un solo dueno; los subagentes no hacen merge ni push, entregan un commit en su rama y tu integras y verificas con la compuerta completa; cada prompt es autosuficiente (en espanol, sin emojis, git add solo de sus archivos, commit terminando con las lineas de atribucion del sistema, `ln -s /home/user/ravyn-crm/node_modules node_modules`). Antes de lanzar agentes actualiza docs/v2/tablero.md.

REGLAS GENERALES
- Commits pequenos y descriptivos en espanol, uno por tarea integrada, terminando con las lineas de atribucion que indique el sistema. Empuja con `git push -u origin claude/beautiful-cerf-eqtfua` al cerrar cada bloque. El hook de fin de turno avisa de "commits sin empujar" aunque ya esten arriba (clon superficial): comprueba con `git ls-remote --heads origin claude/beautiful-cerf-eqtfua` contra `git rev-parse HEAD` y no insistas.
- Cada decision relevante a docs/v2/decisiones.md (D-14 en adelante: que, por que, alternativas descartadas); avance a docs/v2/tablero.md.
- Para cambios de UI: arranca la app (`npm run build && PORT=3123 npm run start`) y verifica con curl y capturas de Playwright en escritorio y movil; mira las capturas, no asumas (en la Fase 4 una captura revelo un catalogo vacio y un desborde movil).
- Tras cambiar `package.json` o el menu, recuerda que los tests de menu por vertical y las 20 pruebas de Playwright deben seguir en verde; la demo es compartida y en serie, asi que las pruebas nuevas restauran el estado que cambien.
- LIMITES: no ejecutes SQL contra ninguna base real; no crees pull requests (solo commits en la rama); no pongas claves ni secretos en el repo; no toques `main`; no deshabilites ni evadas el clasificador de permisos.

CIERRE
Compuerta completa en verde (typecheck, lint, vitest, build, Playwright), revision de seguridad de la fase documentada (docs/v2/revision-seguridad-fase5.md: filtro por organizacion en briefing y movimiento, rol para cerrar oportunidades, CSRF, XSS en tarjetas, cifras sin alucinacion), tablero y decisiones al dia, push confirmado, y un resumen corto al dueno: que se hizo, como se verifico (comandos y resultados reales), riesgos abiertos y cuantas fases faltan (despues de la 5 queda la 6).
DETENTE AL CERRAR LA FASE 5 Y ESPERA LA CONFIRMACION DEL DUENO para la Fase 6. No empieces la 6 por tu cuenta.
```

---

## 2. Notas para el dueno

- Para encadenar la Fase 6 en la misma sesion, quita la ultima linea del prompt (la de detenerse) y agrega: "Al cerrar la 5 continua con la Fase 6".
- Riesgos abiertos que el agente heredara: R4-01 a R4-05 (`revision-seguridad-fase4.md`) y R-03/R-04 (aceptados). Si quieres cerrar alguno antes, agregalo al prompt.
