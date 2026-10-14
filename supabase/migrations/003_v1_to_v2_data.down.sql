-- Rollback de 003_v1_to_v2_data.sql
-- Borra solo las filas v2 que provienen de v1 (mismos UUID) y limpia users.organization_id.
-- ADVERTENCIA: usar solo antes de que la app empiece a escribir en las tablas v2.
-- Despues de ese punto, este rollback borraria datos nuevos; usar el dump previo en su lugar.

BEGIN;

DELETE FROM public.activities
WHERE type = 'note'
  AND booking_id IN (SELECT id FROM public.appointments);

DELETE FROM public.bookings      WHERE id IN (SELECT id FROM public.appointments);
DELETE FROM public.items         WHERE id IN (SELECT id FROM public.services);
DELETE FROM public.contacts      WHERE id IN (SELECT id FROM public.patients);

UPDATE public.users SET organization_id = NULL;

DELETE FROM public.organizations WHERE id IN (SELECT id FROM public.clinics);

COMMIT;
