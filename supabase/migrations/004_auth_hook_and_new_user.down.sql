-- Rollback de 004_auth_hook_and_new_user.sql
-- Restaura las funciones a su definicion previa (v1) y devuelve los grants por defecto a anon.

BEGIN;

CREATE OR REPLACE FUNCTION auth.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  u record;
BEGIN
  SELECT clinic_id, role INTO u FROM public.users WHERE id = (event->>'user_id')::uuid;
  IF u IS NOT NULL THEN
    RETURN jsonb_set(event, '{claims}',
      event->'claims' || jsonb_build_object('clinic_id', u.clinic_id, 'user_role', u.role));
  END IF;
  RETURN event;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_clinic_id uuid;
  v_role text;
BEGIN
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'admin');
  IF v_role = 'admin' THEN
    INSERT INTO public.clinics (name, phone, email, plan)
    VALUES (NEW.raw_user_meta_data->>'clinic_name',
            NEW.raw_user_meta_data->>'clinic_phone',
            NEW.raw_user_meta_data->>'clinic_email', 'basic')
    RETURNING id INTO v_clinic_id;
  ELSE
    v_clinic_id := (NEW.raw_user_meta_data->>'clinic_id')::uuid;
  END IF;
  INSERT INTO public.users (id, clinic_id, full_name, role)
  VALUES (NEW.id, v_clinic_id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), v_role);
  RETURN NEW;
END;
$$;

GRANT ALL ON public.organizations TO anon;
GRANT ALL ON public.contacts      TO anon;
GRANT ALL ON public.items         TO anon;
GRANT ALL ON public.opportunities TO anon;
GRANT ALL ON public.bookings      TO anon;
GRANT ALL ON public.activities    TO anon;
GRANT ALL ON public.agent_actions TO anon;

COMMIT;
