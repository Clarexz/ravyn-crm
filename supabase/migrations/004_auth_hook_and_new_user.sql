-- Ravyn CRM v2 - Fase 0 - Migracion 004: JWT, alta de usuarios y cierre de privilegios
--   * custom_access_token_hook: inyecta organization_id (ademas de clinic_id y user_role).
--   * handle_new_user: cada alta de admin crea la clinic v1 y la organizacion v2 con el MISMO uuid,
--     para que la app v1 siga funcionando mientras se migra a v2.
--   * REVOKE de anon sobre las tablas v2 (defensa en profundidad; RLS ya las protege).
-- Las firmas y atributos de las funciones se conservan (los grants existentes no cambian).
-- Rollback: 004_auth_hook_and_new_user.down.sql

BEGIN;

-- 1. Hook de JWT
CREATE OR REPLACE FUNCTION auth.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  u record;
BEGIN
  SELECT clinic_id, organization_id, role INTO u
  FROM public.users
  WHERE id = (event->>'user_id')::uuid;

  IF u IS NOT NULL THEN
    RETURN jsonb_set(
      event,
      '{claims}',
      event->'claims' || jsonb_build_object(
        'clinic_id', u.clinic_id,
        'organization_id', COALESCE(u.organization_id, u.clinic_id),
        'user_role', u.role
      )
    );
  END IF;

  RETURN event;
END;
$$;

-- 2. Alta de usuarios: crea clinic (v1) y organization (v2) con el mismo id
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
  v_role text;
  v_industry text;
BEGIN
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'admin');

  IF v_role = 'admin' THEN
    v_industry := COALESCE(NEW.raw_user_meta_data->>'industry', 'general');
    IF v_industry NOT IN ('health', 'restaurant', 'real_estate', 'professional_services', 'retail', 'general') THEN
      v_industry := 'general';
    END IF;

    INSERT INTO public.clinics (name, phone, email, plan)
    VALUES (
      NEW.raw_user_meta_data->>'clinic_name',
      NEW.raw_user_meta_data->>'clinic_phone',
      NEW.raw_user_meta_data->>'clinic_email',
      'basic'
    )
    RETURNING id INTO v_clinic_id;

    INSERT INTO public.organizations (id, name, industry, phone, email, plan)
    VALUES (
      v_clinic_id,
      COALESCE(NEW.raw_user_meta_data->>'clinic_name', 'Sin nombre'),
      v_industry,
      NEW.raw_user_meta_data->>'clinic_phone',
      NEW.raw_user_meta_data->>'clinic_email',
      'starter'
    );
  ELSE
    v_clinic_id := (NEW.raw_user_meta_data->>'clinic_id')::uuid;
  END IF;

  INSERT INTO public.users (id, clinic_id, organization_id, full_name, role)
  VALUES (
    NEW.id,
    v_clinic_id,
    v_clinic_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    v_role
  );

  RETURN NEW;
END;
$$;

-- 3. anon no necesita ningun privilegio sobre las tablas v2
REVOKE ALL ON public.organizations FROM anon;
REVOKE ALL ON public.contacts      FROM anon;
REVOKE ALL ON public.items         FROM anon;
REVOKE ALL ON public.opportunities FROM anon;
REVOKE ALL ON public.bookings      FROM anon;
REVOKE ALL ON public.activities    FROM anon;
REVOKE ALL ON public.agent_actions FROM anon;

COMMIT;
