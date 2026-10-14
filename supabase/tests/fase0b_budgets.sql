-- Prueba de la migracion 006 (presupuestos). Termina en ROLLBACK: no deja datos.
-- Cubre: correlativo por organizacion, CHECKs, coherencia entre organizaciones,
-- aislamiento RLS y ON DELETE CASCADE. Requiere 001, 002 y 006 aplicadas.
-- Aborta con error si algo no coincide. Ejecutar como rol con privilegios (postgres / service role).

BEGIN;

DO $$
DECLARE
  org_a  uuid := gen_random_uuid();
  org_b  uuid := gen_random_uuid();
  ct_a   uuid := gen_random_uuid();
  ct_b   uuid := gen_random_uuid();
  it_a   uuid := gen_random_uuid();
  it_b   uuid := gen_random_uuid();
  bud_a1 uuid;
  bud_a2 uuid;
  bud_b1 uuid;
  mem_a1 uuid;
  mem_b1 uuid;
  num    text;
  got    int;
  ok     boolean;
BEGIN
  -- Datos base
  INSERT INTO public.organizations (id, name, industry) VALUES
    (org_a, 'TestBudgetsA', 'general'),
    (org_b, 'TestBudgetsB', 'general');
  INSERT INTO public.contacts (id, organization_id, full_name) VALUES
    (ct_a, org_a, 'Contacto A'), (ct_b, org_b, 'Contacto B');
  INSERT INTO public.items (id, organization_id, name) VALUES
    (it_a, org_a, 'Servicio A'), (it_b, org_b, 'Servicio B');

  -- 1. Correlativo por organizacion (la app nunca envia budget_number; si lo enviara, se ignora)
  INSERT INTO public.budgets (organization_id, responsible_name, expires_at)
  VALUES (org_a, 'Resp A1', now() + interval '15 days') RETURNING id, budget_number INTO bud_a1, num;
  IF num <> 'PRES-0001' THEN RAISE EXCEPTION 'A1: numero % (esperado PRES-0001)', num; END IF;

  INSERT INTO public.budgets (organization_id, budget_number, responsible_name, expires_at)
  VALUES (org_a, 'PRES-9999', 'Resp A2', now() + interval '15 days') RETURNING id, budget_number INTO bud_a2, num;
  IF num <> 'PRES-0002' THEN RAISE EXCEPTION 'A2: numero % (esperado PRES-0002, el valor enviado debe ignorarse)', num; END IF;

  INSERT INTO public.budgets (organization_id, responsible_name, expires_at)
  VALUES (org_b, 'Resp B1', now() + interval '15 days') RETURNING id, budget_number INTO bud_b1, num;
  IF num <> 'PRES-0001' THEN RAISE EXCEPTION 'B1: numeracion no independiente: % (esperado PRES-0001)', num; END IF;

  -- budget_number y organization_id son inmutables
  UPDATE public.budgets SET budget_number = 'PRES-0777' WHERE id = bud_a1;
  SELECT budget_number INTO num FROM public.budgets WHERE id = bud_a1;
  IF num <> 'PRES-0001' THEN RAISE EXCEPTION 'budget_number fue modificado: %', num; END IF;

  ok := false;
  BEGIN
    UPDATE public.budgets SET organization_id = org_b WHERE id = bud_a1;
  EXCEPTION WHEN raise_exception THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'Se permitio cambiar organization_id de un presupuesto'; END IF;

  -- Miembros y servicios validos
  INSERT INTO public.budget_members (organization_id, budget_id, full_name, relationship)
  VALUES (org_a, bud_a1, 'Miembro A1', 'responsible') RETURNING id INTO mem_a1;
  INSERT INTO public.budget_members (organization_id, budget_id, full_name, relationship)
  VALUES (org_b, bud_b1, 'Miembro B1', 'responsible') RETURNING id INTO mem_b1;
  INSERT INTO public.budget_services (organization_id, budget_member_id, service_id, name, sessions, unit_price)
  VALUES (org_a, mem_a1, it_a, 'Servicio A', 3, 100.50);
  INSERT INTO public.budget_services (organization_id, budget_member_id, service_id, name)
  VALUES (org_b, mem_b1, it_b, 'Servicio B');

  -- 2. CHECKs invalidos rechazados
  ok := false;
  BEGIN
    INSERT INTO public.budgets (organization_id, responsible_name, expires_at, status)
    VALUES (org_a, 'X', now(), 'invalido');
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK status no rechazo el valor invalido'; END IF;

  ok := false;
  BEGIN
    INSERT INTO public.budgets (organization_id, responsible_name, expires_at, discount_type)
    VALUES (org_a, 'X', now(), 'otro');
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK discount_type no rechazo el valor invalido'; END IF;

  ok := false;
  BEGIN
    INSERT INTO public.budget_members (organization_id, budget_id, full_name, relationship)
    VALUES (org_a, bud_a1, 'X', 'amigo');
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK relationship no rechazo el valor invalido'; END IF;

  ok := false;
  BEGIN
    INSERT INTO public.budget_services (organization_id, budget_member_id, name, sessions)
    VALUES (org_a, mem_a1, 'X', 0);
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK sessions > 0 no rechazo 0'; END IF;

  -- 3. Coherencia entre organizaciones
  ok := false;
  BEGIN  -- responsible_id de otra organizacion
    INSERT INTO public.budgets (organization_id, responsible_id, responsible_name, expires_at)
    VALUES (org_a, ct_b, 'X', now());
  EXCEPTION WHEN raise_exception THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'Se permitio responsible_id de otra organizacion'; END IF;

  ok := false;
  BEGIN  -- miembro de org A colgado de un presupuesto de B
    INSERT INTO public.budget_members (organization_id, budget_id, full_name, relationship)
    VALUES (org_a, bud_b1, 'X', 'other');
  EXCEPTION WHEN raise_exception THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'Se permitio budget_members cruzado entre organizaciones'; END IF;

  ok := false;
  BEGIN  -- servicio de org A colgado de un miembro de B
    INSERT INTO public.budget_services (organization_id, budget_member_id, name)
    VALUES (org_a, mem_b1, 'X');
  EXCEPTION WHEN raise_exception THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'Se permitio budget_services cruzado entre organizaciones'; END IF;

  ok := false;
  BEGIN  -- service_id (item) de otra organizacion
    INSERT INTO public.budget_services (organization_id, budget_member_id, service_id, name)
    VALUES (org_a, mem_a1, it_b, 'X');
  EXCEPTION WHEN raise_exception THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'Se permitio service_id de otra organizacion'; END IF;

  -- 4. Aislamiento RLS
  PERFORM set_config('request.jwt.claims', json_build_object('organization_id', org_a)::text, true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO got FROM public.budgets;
  IF got <> 2 THEN RAISE EXCEPTION 'A: budgets % (esperado 2)', got; END IF;
  SELECT count(*) INTO got FROM public.budget_members;
  IF got <> 1 THEN RAISE EXCEPTION 'A: budget_members % (esperado 1)', got; END IF;
  SELECT count(*) INTO got FROM public.budget_services;
  IF got <> 1 THEN RAISE EXCEPTION 'A: budget_services % (esperado 1)', got; END IF;
  SELECT count(*) INTO got FROM public.budgets WHERE organization_id = org_b;
  IF got <> 0 THEN RAISE EXCEPTION 'A ve presupuestos de B: %', got; END IF;

  -- A no puede insertar en B (WITH CHECK implicito de la politica)
  ok := false;
  BEGIN
    INSERT INTO public.budgets (organization_id, responsible_name, expires_at) VALUES (org_b, 'X', now());
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'A pudo insertar presupuestos en B'; END IF;

  -- A inserta en su propia organizacion via trigger SECURITY DEFINER (contador inaccesible directo)
  INSERT INTO public.budgets (organization_id, responsible_name, expires_at) VALUES (org_a, 'Resp A3', now())
  RETURNING budget_number INTO num;
  IF num <> 'PRES-0003' THEN RAISE EXCEPTION 'A3 como authenticated: % (esperado PRES-0003)', num; END IF;

  ok := false;
  BEGIN
    PERFORM 1 FROM public.budget_counters;
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'authenticated pudo leer budget_counters'; END IF;

  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('organization_id', org_b)::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO got FROM public.budgets;
  IF got <> 1 THEN RAISE EXCEPTION 'B: budgets % (esperado 1)', got; END IF;
  SELECT count(*) INTO got FROM public.budget_services WHERE organization_id = org_a;
  IF got <> 0 THEN RAISE EXCEPTION 'B ve servicios de A: %', got; END IF;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', '{}', true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO got FROM public.budgets;
  IF got <> 0 THEN RAISE EXCEPTION 'sin claim: budgets % (esperado 0)', got; END IF;
  RESET ROLE;

  -- anon sin privilegios
  SET LOCAL ROLE anon;
  ok := false;
  BEGIN
    PERFORM 1 FROM public.budgets;
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  RESET ROLE;
  IF NOT ok THEN RAISE EXCEPTION 'anon pudo leer budgets'; END IF;

  -- 5. ON DELETE CASCADE
  DELETE FROM public.budgets WHERE id = bud_a1;
  SELECT count(*) INTO got FROM public.budget_members WHERE id = mem_a1;
  IF got <> 0 THEN RAISE EXCEPTION 'CASCADE: el miembro sobrevivio al borrado del presupuesto'; END IF;
  SELECT count(*) INTO got FROM public.budget_services WHERE budget_member_id = mem_a1;
  IF got <> 0 THEN RAISE EXCEPTION 'CASCADE: el servicio sobrevivio al borrado del presupuesto'; END IF;

  -- El numero borrado no se reutiliza
  INSERT INTO public.budgets (organization_id, responsible_name, expires_at) VALUES (org_a, 'Resp A4', now())
  RETURNING budget_number INTO num;
  IF num <> 'PRES-0004' THEN RAISE EXCEPTION 'A4: % (esperado PRES-0004, sin reutilizar numeros)', num; END IF;

  -- Borrar la organizacion arrastra todo, contador incluido
  DELETE FROM public.organizations WHERE id = org_b;
  SELECT count(*) INTO got FROM public.budgets WHERE organization_id = org_b;
  IF got <> 0 THEN RAISE EXCEPTION 'CASCADE org: quedaron budgets de B'; END IF;
  SELECT count(*) INTO got FROM public.budget_members WHERE organization_id = org_b;
  IF got <> 0 THEN RAISE EXCEPTION 'CASCADE org: quedaron miembros de B'; END IF;
  SELECT count(*) INTO got FROM public.budget_services WHERE organization_id = org_b;
  IF got <> 0 THEN RAISE EXCEPTION 'CASCADE org: quedaron servicios de B'; END IF;
  SELECT count(*) INTO got FROM public.budget_counters WHERE organization_id = org_b;
  IF got <> 0 THEN RAISE EXCEPTION 'CASCADE org: quedo el contador de B'; END IF;

  RAISE NOTICE 'Presupuestos OK: correlativo, CHECKs, coherencia, RLS y CASCADE';
END $$;

ROLLBACK;
