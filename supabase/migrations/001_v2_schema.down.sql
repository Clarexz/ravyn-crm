-- Rollback de 001_v2_schema.sql
-- Elimina solo objetos v2. No toca clinics, patients, services, appointments ni appointment_logs.
-- La columna users.organization_id se elimina con CASCADE sobre su FK; users.clinic_id no se modifica.

BEGIN;

DROP TABLE IF EXISTS public.agent_actions;
DROP TABLE IF EXISTS public.activities;
DROP TABLE IF EXISTS public.bookings;
DROP TABLE IF EXISTS public.opportunities;
DROP TABLE IF EXISTS public.items;
DROP TABLE IF EXISTS public.contacts;

DROP INDEX IF EXISTS public.idx_users_organization_id;
ALTER TABLE public.users DROP COLUMN IF EXISTS organization_id;

DROP TABLE IF EXISTS public.organizations;

COMMIT;
