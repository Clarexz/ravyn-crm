# Revision de seguridad - Fase 5 (pipeline y Analista)

Alcance: `lib/pipeline/*`, `app/api/pipeline/**`, `app/api/briefing`, `lib/agents/analyst.ts` (y su registro como herramienta), `PipelineClient`, `BriefingCard`, cambios en menu y `demoLlm`.
Revisor: el agente maestro (no es una revision independiente; ver D-11). Modo demo activo (D-08): sin RLS ni sesion real, el aislamiento es de aplicacion.

## Verificado (sin hallazgos)
- Filtro por organizacion: toda consulta nueva lleva `.eq("organization_id", ...)` con el id de la sesion (tablero, contactos del tablero, movimiento, metricas del Analista, conteo de acciones). El id de la oportunidad de la URL solo se usa junto con ese filtro: uno ajeno responde 404 y la base no cambia (prueba con snapshot completo). El briefing de una organizacion no cambia aunque la otra tenga datos (prueba ANL-01) y las rutas no aceptan organizacion por parametro. La guardia `tenant-filter` sigue en verde.
- Rol para cerrar oportunidades: ganar, perder o reabrir exige `admin` en el servidor (403, sin cambios de estado ni actividad); la UI solo explica. Staff puede mover entre etapas abiertas. Los agentes no usan esta ruta: `update_stage` conserva la aprobacion (solo admin aprueba criticas, R-01).
- CSRF/entrada: `POST /api/pipeline/[id]/move` usa `guardMutation` (JSON y Origin del mismo host), id UUID, cuerpo Zod estricto (`organization_id`, `performed_by_id` u otras claves dan 400). Autor y organizacion salen de la sesion. `GET /api/pipeline` y `GET /api/briefing` son de solo lectura (prueba de que no modifican la base) y `days` se acota a 1-365.
- Integridad: compare-and-set sobre la etapa leida (409 si cambio); si la actividad no se puede registrar, se restaura la fila (prueba con fallo inyectado). Detalle interno de errores nunca sale al cliente.
- XSS: titulos, nombres de contacto y todo el texto del briefing se pintan como texto de React; no hay `dangerouslySetInnerHTML`. Los textos del briefing recortan y normalizan espacios en titulos y nombres.
- Cifras sin alucinacion: el texto es una plantilla sobre `AnalystMetrics`; la prueba verifica cada numero del resumen contra el conjunto permitido derivado de las metricas, sin NaN/Infinity/undefined, y "sin datos" cuando no hay denominador. La herramienta `generate_briefing` es solo lectura, riesgo bajo, y esta en la lista del analista unicamente (prueba: otros agentes reciben PERMISSION_DENIED y la base no cambia).
- Dependencia nueva `@dnd-kit/core` 6.3.1 (cliente, sin red ni HTML dinamico). `npm install` reporta avisos de `npm audit` heredados del proyecto, ajenos a esta dependencia.

## Riesgos abiertos
1. R5-01 El movimiento humano no es una sola transaccion de base de datos: es compare-and-set + insercion de actividad con compensacion. Un fallo del proceso entre ambas sentencias podria dejar el cambio sin actividad. Con datos reales, moverlo a una funcion SQL (RPC) transaccional.
2. R5-02 Staff no puede cerrar oportunidades en absoluto (decision D-14). Si el negocio quiere que staff proponga el cierre, hay que enrutarlo por la bandeja de aprobaciones; no esta implementado.
3. R5-03 El briefing suma `value` sin distinguir monedas y lista como maximo 50 estancadas (se marca con "+"); la "primera atencion" usa la primera actividad registrada porque no existe tabla de mensajes con direccion (D-15).
4. R5-04 El briefing se calcula en cada visita al dashboard (sin cache) y lee hasta 10 000 filas por tabla; suficiente para la demo, a revisar con volumen real.
5. R5-05 Dos usuarios moviendo la misma tarjeta a la vez: el segundo recibe 409 y su tablero se recarga; no hay actualizacion en vivo del tablero entre usuarios (sin realtime en demo).
6. Siguen vigentes R4-01 a R4-05, R-03 y R-04 y los pendientes de `revision-seguridad-fase0b.md` para el paso a datos reales.
