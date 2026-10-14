-- Prueba de aislamiento multi-tenant (solo lectura, termina en ROLLBACK).
-- Simula el rol authenticated con el claim organization_id de dos organizaciones y de ninguna.
-- Requiere las migraciones 001 a 003 aplicadas (datos copiados). Aborta con error si algo no coincide.

BEGIN;

DO $$
DECLARE
  org_a uuid;
  org_b uuid;
  expected_a_contacts int;
  expected_a_bookings int;
  expected_b_contacts int;
  got int;
BEGIN
  SELECT id INTO org_a FROM public.organizations WHERE name = 'ClinicaDemo';
  SELECT id INTO org_b FROM public.organizations WHERE name = 'Ravyn Studio';

  SELECT count(*) INTO expected_a_contacts FROM public.contacts WHERE organization_id = org_a;
  SELECT count(*) INTO expected_a_bookings FROM public.bookings WHERE organization_id = org_a;
  SELECT count(*) INTO expected_b_contacts FROM public.contacts WHERE organization_id = org_b;

  -- Con el claim de la organizacion A
  PERFORM set_config('request.jwt.claims', json_build_object('organization_id', org_a)::text, true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO got FROM public.contacts;
  IF got <> expected_a_contacts THEN RAISE EXCEPTION 'A: contacts % (esperado %)', got, expected_a_contacts; END IF;

  SELECT count(*) INTO got FROM public.bookings;
  IF got <> expected_a_bookings THEN RAISE EXCEPTION 'A: bookings % (esperado %)', got, expected_a_bookings; END IF;

  SELECT count(*) INTO got FROM public.organizations;
  IF got <> 1 THEN RAISE EXCEPTION 'A: organizations % (esperado 1)', got; END IF;

  SELECT count(*) INTO got FROM public.contacts WHERE organization_id = org_b;
  IF got <> 0 THEN RAISE EXCEPTION 'A ve contactos de B: %', got; END IF;

  RESET ROLE;

  -- Con el claim de la organizacion B
  PERFORM set_config('request.jwt.claims', json_build_object('organization_id', org_b)::text, true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO got FROM public.contacts;
  IF got <> expected_b_contacts THEN RAISE EXCEPTION 'B: contacts % (esperado %)', got, expected_b_contacts; END IF;

  SELECT count(*) INTO got FROM public.contacts WHERE organization_id = org_a;
  IF got <> 0 THEN RAISE EXCEPTION 'B ve contactos de A: %', got; END IF;

  RESET ROLE;

  -- Sin claim de organizacion
  PERFORM set_config('request.jwt.claims', '{}', true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO got FROM public.contacts;
  IF got <> 0 THEN RAISE EXCEPTION 'sin claim: contacts % (esperado 0)', got; END IF;

  RESET ROLE;

  RAISE NOTICE 'Aislamiento OK: A=% contactos, B=% contactos, sin claim=0', expected_a_contacts, expected_b_contacts;
END $$;

ROLLBACK;
