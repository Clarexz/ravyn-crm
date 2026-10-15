-- Rollback de 008_activity_assignee.sql
BEGIN;

CREATE OR REPLACE FUNCTION public.trg_activities_same_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_same_org('contacts', NEW.contact_id, NEW.organization_id);
  PERFORM public.assert_same_org('opportunities', NEW.opportunity_id, NEW.organization_id);
  PERFORM public.assert_same_org('bookings', NEW.booking_id, NEW.organization_id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_activities_same_org() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS activities_same_org ON public.activities;
CREATE TRIGGER activities_same_org BEFORE INSERT OR UPDATE OF organization_id, contact_id, opportunity_id, booking_id
  ON public.activities FOR EACH ROW EXECUTE FUNCTION public.trg_activities_same_org();

DROP INDEX IF EXISTS public.activities_org_assigned_idx;
ALTER TABLE public.activities DROP COLUMN IF EXISTS assigned_to;

COMMIT;
