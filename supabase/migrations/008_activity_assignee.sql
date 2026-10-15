-- Ravyn CRM v2 - Migracion 008: tareas asignadas a una persona (D-19, Fase 6).
-- Agrega activities.assigned_to (users.id) para que el agente de seguimiento pueda dejar una tarea al asesor humano,
-- y extiende el trigger de coherencia de organizacion de la migracion 007 para que no se pueda asignar a un usuario de otra.
-- Requiere 001 a 007. Idempotente. Rollback: 008_activity_assignee.down.sql
-- NO aplicada: en modo demo el esquema en memoria (lib/demo/engine/schema.ts) ya incluye la columna.

BEGIN;

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS activities_org_assigned_idx
  ON public.activities (organization_id, assigned_to)
  WHERE assigned_to IS NOT NULL;

CREATE OR REPLACE FUNCTION public.trg_activities_same_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_same_org('contacts', NEW.contact_id, NEW.organization_id);
  PERFORM public.assert_same_org('opportunities', NEW.opportunity_id, NEW.organization_id);
  PERFORM public.assert_same_org('bookings', NEW.booking_id, NEW.organization_id);
  PERFORM public.assert_same_org('users', NEW.assigned_to, NEW.organization_id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_activities_same_org() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS activities_same_org ON public.activities;
CREATE TRIGGER activities_same_org BEFORE INSERT OR UPDATE OF organization_id, contact_id, opportunity_id, booking_id, assigned_to
  ON public.activities FOR EACH ROW EXECUTE FUNCTION public.trg_activities_same_org();

COMMIT;
