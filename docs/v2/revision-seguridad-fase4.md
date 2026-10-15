# Revision de seguridad - Fase 4 (industria dinamica)

Alcance: `lib/industry/*`, `app/api/organization/schema`, `lib/demo/verticals.ts` y `engine/db.ts`, cambios de zona horaria en `lib/agents/tools/*`, inyeccion en `orchestrator.ts`, `demoLlm.ts`, componentes de menu y selector.
Revisor: el agente maestro (no es una revision independiente; ver D-11). Modo demo activo (D-08): sin RLS ni sesion real, el aislamiento es de aplicacion.

## Verificado (sin hallazgos)
- Aislamiento por organizacion: `loadTenantConfig`, `applyTenantChange` y la ruta filtran por el `organization_id` de la sesion; el cuerpo es estricto (cualquier `organization_id` extra responde 400). Pruebas: cambiar la vertical de una organizacion deja intactos esquema, contactos, citas, items y presupuestos de la otra; el contexto del prompt es siempre el de la organizacion que consulta. La guardia `tenant-filter` sigue en verde.
- Autorizacion: `PATCH /api/organization/schema` exige rol admin (403 para staff, sin cambios en la base) y pasa por la guardia CSRF de D-12 (415 y 403). `GET` solo entrega el esquema propio.
- Cambio de vertical (demo): solo se ejecuta si `RAVYN_DATA_MODE` no es `live` y la base es la de demo; retira unicamente filas con ese `organization_id`, dentro de una transaccion (si algo falla no cambia nada) y guarda lo retirado en memoria para restaurarlo. Prueba de snapshot de la otra organizacion antes y despues.
- Inyeccion de prompt: el nombre de la organizacion y las etiquetas (editables por un admin en `settings`) se normalizan a una linea, sin comillas y con longitud acotada antes de entrar al prompt del agente (prueba). El resto del contexto sale de paquetes estaticos del codigo.
- XSS: las etiquetas se pintan como texto de React; ningun `dangerouslySetInnerHTML`.
- Zona horaria: se valida con `Intl` (zona invalida: 400 en el PATCH, UTC en la lectura); sin entradas del usuario en consultas.
- El simulador de staff (`ravyn_demo_role`) solo se lee en modo demo y solo puede bajar privilegios.

## Riesgos abiertos
1. R4-01 `ModuleGate` y el menu ocultan modulos pero no son control de acceso: las rutas `/api/*` de un modulo inactivo siguen respondiendo con los datos de la propia organizacion. Si el negocio requiere que un modulo inactivo sea inaccesible, hay que validarlo en cada ruta (o en middleware).
2. R4-02 Las etiquetas personalizadas (`settings.labels`) y `active_modules` solo se editan hoy por base de datos o por el selector de vertical (que las restablece al paquete); no hay pantalla de edicion.
3. R4-03 En un hueco de cambio de hora (DST) una hora local inexistente se desplaza una hora. Las zonas de la demo no tienen DST.
4. R4-04 Las pantallas de citas anteriores a la fase siguen formateando fechas en la zona del navegador, no en la de la organizacion.
5. R4-05 El estado de demo (incluidos los espacios de trabajo guardados por giro) vive en la memoria del proceso: se pierde al reiniciar y en serverless cada instancia tiene su copia (D-08).
6. Siguen vigentes R-03 y R-04 de la Fase 3 (aceptados) y los pendientes de `revision-seguridad-fase0b.md` para el paso a datos reales.
