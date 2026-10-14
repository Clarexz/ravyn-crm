-- Ravyn CRM v2 - Migracion 007: endurecimiento (hallazgos H-03 y H-05 de docs/v2/revision-seguridad-fase0b.md)
--   H-03: el navegador (rol authenticated) solo lee; toda escritura pasa por la API con service role.
--   H-05: triggers que impiden referenciar filas de otra organizacion (contact_id, item_id, ...).
-- Requiere 001 a 006. Idempotente. Rollback: 007_hardening.down.sql
-- NO aplicar sin revisar: si algun cliente de navegador escribe directo en estas tablas, dejara de poder hacerlo.

BEGIN;

-- H-03: quitar escritura directa a authenticated (las politicas RLS seguian permitiendo FOR ALL).
REVOKE INSERT, UPDATE, DELETE ON
  public.organizations, public.contacts, public.items, public.opportunities,
  public.bookings, public.activities, public.agent_actions,
  public.budgets, public.budget_members, public.budget_services
FROM authenticated;

-- H-05: coherencia de organizacion entre tablas relacionadas.
CREATE OR REPLACE FUNCTION public.assert_same_org(ref_table text, ref_id uuid, org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref_org uuid;
BEGIN
  IF ref_id IS NULL THEN
    RETURN;
  END IF;
  EXECUTE format('SELECT organization_id FROM public.%I WHERE id = $1', ref_table) INTO ref_org USING ref_id;
  IF ref_org IS NULL OR ref_org <> org THEN
    RAISE EXCEPTION 'Referencia % % no pertenece a la organizacion %', ref_table, ref_id, org
      USING ERRCODE = '23514';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_same_org(text, uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_bookings_same_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_same_org('contacts', NEW.contact_id, NEW.organization_id);
  PERFORM public.assert_same_org('items', NEW.item_id, NEW.organization_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_activities_same_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_same_org('contacts', NEW.contact_id, NEW.organization_id);
  PERFORM public.assert_same_org('opportunities', NEW.opportunity_id, NEW.organization_id);
  PERFORM public.assert_same_org('bookings', NEW.booking_id, NEW.organization_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_opportunities_same_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_same_org('contacts', NEW.contact_id, NEW.organization_id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_bookings_same_org(), public.trg_activities_same_org(),
  public.trg_opportunities_same_org() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS bookings_same_org ON public.bookings;
CREATE TRIGGER bookings_same_org BEFORE INSERT OR UPDATE OF organization_id, contact_id, item_id
  ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.trg_bookings_same_org();

DROP TRIGGER IF EXISTS activities_same_org ON public.activities;
CREATE TRIGGER activities_same_org BEFORE INSERT OR UPDATE OF organization_id, contact_id, opportunity_id, booking_id
  ON public.activities FOR EACH ROW EXECUTE FUNCTION public.trg_activities_same_org();

DROP TRIGGER IF EXISTS opportunities_same_org ON public.opportunities;
CREATE TRIGGER opportunities_same_org BEFORE INSERT OR UPDATE OF organization_id, contact_id
  ON public.opportunities FOR EACH ROW EXECUTE FUNCTION public.trg_opportunities_same_org();

COMMIT;
