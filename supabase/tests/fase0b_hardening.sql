-- Prueba de la migracion 007 (termina en ROLLBACK). Requiere 001 a 007.
BEGIN;

DO $$
DECLARE
  org_a uuid := gen_random_uuid();
  org_b uuid := gen_random_uuid();
  contact_b uuid := gen_random_uuid();
  failed boolean;
BEGIN
  INSERT INTO public.organizations (id, name, industry) VALUES (org_a, 'T007 A', 'general'), (org_b, 'T007 B', 'general');
  INSERT INTO public.contacts (id, organization_id, full_name) VALUES (contact_b, org_b, 'Contacto de B');

  -- booking de A con contacto de B: debe rechazarse
  failed := false;
  BEGIN
    INSERT INTO public.bookings (organization_id, contact_id, scheduled_at) VALUES (org_a, contact_b, now());
  EXCEPTION WHEN check_violation THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'bookings acepto un contacto de otra organizacion'; END IF;

  -- oportunidad de A con contacto de B: debe rechazarse
  failed := false;
  BEGIN
    INSERT INTO public.opportunities (organization_id, contact_id, title, stage) VALUES (org_a, contact_b, 'x', 'lead');
  EXCEPTION WHEN check_violation THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'opportunities acepto un contacto de otra organizacion'; END IF;

  -- actividad de A con contacto de B: debe rechazarse
  failed := false;
  BEGIN
    INSERT INTO public.activities (organization_id, contact_id, type, title, performed_by_type, performed_by_id)
    VALUES (org_a, contact_b, 'note', 'x', 'human', 'test');
  EXCEPTION WHEN check_violation THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'activities acepto un contacto de otra organizacion'; END IF;

  -- insercion coherente: debe funcionar
  INSERT INTO public.bookings (organization_id, contact_id, scheduled_at) VALUES (org_b, contact_b, now());

  -- authenticated no puede escribir (H-03)
  PERFORM set_config('request.jwt.claims', json_build_object('organization_id', org_b)::text, true);
  SET LOCAL ROLE authenticated;
  failed := false;
  BEGIN
    DELETE FROM public.organizations WHERE id = org_b;
  EXCEPTION WHEN insufficient_privilege THEN failed := true;
  END;
  RESET ROLE;
  IF NOT failed THEN RAISE EXCEPTION 'authenticated pudo borrar una organizacion'; END IF;

  RAISE NOTICE 'Endurecimiento OK';
END $$;

ROLLBACK;
