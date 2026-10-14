# Pruebas

Se usa vitest (entorno node). El alias `@` apunta a la raiz del repo.

## Comandos

- `npm test` corre todas las pruebas (`tests/**/*.test.ts`).
- `npm run typecheck` corre `tsc --noEmit`.
- `npm run lint` corre `next lint`.

## Estructura

- `tests/unit/mappers.test.ts`: mapeadores v2 a vista (`lib/supabase/mappers.ts`).
- `tests/guards/no-v1-tables.test.ts`: falla si `app/` o `lib/` (sin `lib/agents-demo/`)
  usan `.from("clinics" | "patients" | "services" | "appointments" | "appointment_logs")`.
  Acepta comillas simples, dobles o backticks y saltos de linea. Lista archivo:linea.
- `tests/guards/tenant-filter.test.ts`: heuristica. Cada archivo de `app/api/**` y
  `app/(dashboard)/**` que consulta una tabla v2 con tenant debe contener
  `organization_id` u `organizationId`. Lista los archivos infractores.
  Excepcion: `lib/agents-demo` no se escanea.

Las guardias son la compuerta final de la migracion v2: fallan mientras quede codigo
sin migrar. Es una heuristica por archivo; no prueba que cada consulta filtre.
