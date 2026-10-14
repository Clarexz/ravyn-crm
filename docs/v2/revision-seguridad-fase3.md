# Revision de seguridad - Fase 3 (UI de supervision)

Alcance: diff de la fase (`lib/agents/settings.ts`, `diff.ts`, `governance.ts`, `orchestrator.ts`, rutas nuevas de `app/api/agents/` y `app/api/activities/`, componentes de `components/crm/agents/`, `PendingBell`, `AuthorBadge`, `ActivityTimeline`).
Revisor: el agente maestro (sin subagente independiente; ver D-11). Modo demo activo (D-08): no hay RLS ni sesion real, el aislamiento es de aplicacion.

## Verificado (sin hallazgos)
- Aislamiento por organizacion: todas las consultas nuevas filtran por `organization_id` de la sesion (`listActivities`, `countPendingActions`, `getAction`, `buildActionDiff`, `loadOrgAgentConfig`/`saveOrgAgentConfig`). La resolucion de nombres de personas consulta `users` filtrando por organizacion. Pruebas: un id de otra organizacion devuelve 404; el diff de una entidad ajena no revela su estado; el conteo y las actividades no cruzan organizaciones; la configuracion de una organizacion no afecta a otra. La guardia `tenant-filter` sigue en verde.
- Autorizacion: `PATCH /api/agents/settings` exige rol admin (403 para staff) y un cuerpo estricto (agentes y niveles conocidos; claves extra, incluido `organization_id`, se rechazan con 400). El `organizationId` sale siempre de la sesion.
- XSS: ningun componente usa `dangerouslySetInnerHTML`; resumen, motivo, payload, diff y notas de agentes se pintan como texto de React.
- Acciones criticas: siguen pasando por aprobacion en cualquier nivel (prueba: agente en `autonomous` + `update_stage` a won queda pendiente). Un agente deshabilitado no ejecuta ni crea acciones (prueba).
- Modificar valores: el `input` reenviado se valida con el mismo esquema Zod de la herramienta antes de ejecutar (400 y la accion sigue pendiente si es invalido); queda registrado `original_input` y `modified_by_reviewer`.
- Carreras: aprobar dos veces o aprobar y rechazar a la vez sigue siendo atomico (409 para el perdedor); la UI lo informa y refresca.

## Riesgos abiertos (para el paso a datos reales)
1. R-01 Rol para revisar: `approve`/`reject` solo exigen sesion valida; cualquier usuario de la organizacion (incluido `staff`) puede aprobar acciones, incluidas las criticas. El plan dice "valida permisos del usuario" sin definir el rol. Decision del dueno: exigir `admin` (o un permiso especifico) para las criticas.
2. R-02 CSRF en modo real: las rutas POST/PATCH no exigen `Content-Type: application/json` (la ruta de revision lee el cuerpo como texto). Con cookies de Supabase `SameSite=Lax` el riesgo es bajo, pero conviene exigir el tipo de contenido y verificar `Origin` al pasar a datos reales.
3. R-03 Configuracion concurrente: dos administradores guardando a la vez hacen lectura-mezcla-escritura de `organizations.settings` sin control de version; gana la ultima escritura. Aceptable en demo.
4. R-04 Sin limite de peticiones en `/api/agents/chat` ni en el sondeo (10 s por pestana). Con LLM real hay costo por mensaje: agregar limites por organizacion antes de abrirlo.
5. Siguen vigentes los pendientes de `revision-seguridad-fase0b.md` (H-02, RLS de `users`, migraciones 006 y 007) para el paso a datos reales.
