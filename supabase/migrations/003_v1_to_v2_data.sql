-- Ravyn CRM v2 - Fase 0 - Migracion 003: copia de datos v1 -> v2
-- Conserva los UUID (organizations.id = clinics.id, contacts.id = patients.id, etc.).
-- Las tablas v1 no se modifican; solo se rellena users.organization_id.
-- Ajustes respecto al spec, segun la base real:
--   * clinics no tiene subdomain: se migra como NULL.
--   * plan v1 'basic' -> 'starter' (v2 solo acepta starter/standard/enterprise).
--   * industry por nombre de organizacion; lo no listado queda en 'general'.
--   * appointment_logs se copia a activities (type 'note'), ligada a la cita (booking_id).
-- Idempotente (ON CONFLICT / NOT EXISTS). Aborta si los conteos no coinciden.
-- Rollback: 003_v1_to_v2_data.down.sql

BEGIN;

-- 1. clinics -> organizations
INSERT INTO public.organizations (id, name, industry, phone, email, plan, created_at)
SELECT
  c.id,
  c.name,
  CASE c.name
    WHEN 'ClinicaDemo'  THEN 'health'
    WHEN 'Ravyn Studio' THEN 'health'
    WHEN 'Klinos'       THEN 'health'
    WHEN 'carlosstore'  THEN 'retail'
    ELSE 'general'
  END,
  c.phone,
  c.email,
  CASE WHEN c.plan IN ('starter', 'standard', 'enterprise') THEN c.plan ELSE 'starter' END,
  COALESCE(c.created_at, now())
FROM public.clinics c
ON CONFLICT (id) DO NOTHING;

-- 2. users.organization_id
UPDATE public.users
SET organization_id = clinic_id
WHERE organization_id IS NULL AND clinic_id IS NOT NULL;

-- 3. patients -> contacts
INSERT INTO public.contacts (id, organization_id, full_name, phone, email, notes, source, created_at)
SELECT
  p.id,
  p.clinic_id,
  p.full_name,
  p.phone,
  p.email,
  p.notes,
  COALESCE(p.source, 'manual'),
  COALESCE(p.created_at, now())
FROM public.patients p
WHERE p.clinic_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- 4. services -> items
INSERT INTO public.items (id, organization_id, name, type, description, price, color, active, created_at, updated_at)
SELECT
  s.id,
  s.clinic_id,
  s.name,
  'service',
  s.description,
  s.cost,
  s.color,
  s.active,
  s.created_at,
  s.updated_at
FROM public.services s
ON CONFLICT (id) DO NOTHING;

-- 5. appointments -> bookings
INSERT INTO public.bookings (id, organization_id, contact_id, item_id, scheduled_at, duration_minutes, status,
                             service_snapshot, cost_at_booking, notes, source, n8n_execution_id, created_at, updated_at)
SELECT
  a.id,
  a.clinic_id,
  a.patient_id,
  a.service_id,
  a.scheduled_at,
  COALESCE(a.duration_minutes, 30),
  COALESCE(a.status, 'pending'),
  a.service,
  a.cost_at_booking,
  a.notes,
  COALESCE(a.source, 'manual'),
  a.n8n_execution_id,
  COALESCE(a.created_at, now()),
  COALESCE(a.updated_at, now())
FROM public.appointments a
WHERE a.clinic_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- 6. appointment_logs -> activities
INSERT INTO public.activities (organization_id, contact_id, booking_id, type, title, description, status,
                               performed_by_type, performed_by_id, created_at)
SELECT
  a.clinic_id,
  a.patient_id,
  a.id,
  'note',
  'Cambio de estado: ' || COALESCE(l.old_status, '-') || ' -> ' || COALESCE(l.new_status, '-'),
  l.note,
  'completed',
  'human',
  COALESCE(l.changed_by::text, 'unknown'),
  COALESCE(l.created_at, now())
FROM public.appointment_logs l
JOIN public.appointments a ON a.id = l.appointment_id
WHERE a.clinic_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.activities x
    WHERE x.booking_id = a.id
      AND x.type = 'note'
      AND x.created_at = COALESCE(l.created_at, x.created_at)
      AND x.title = 'Cambio de estado: ' || COALESCE(l.old_status, '-') || ' -> ' || COALESCE(l.new_status, '-')
  );

-- 7. Validacion de conteos: si algo no coincide, aborta toda la transaccion
DO $$
DECLARE
  n_org int; n_con int; n_itm int; n_bkg int; n_act int; n_usr int;
BEGIN
  SELECT count(*) INTO n_org FROM public.organizations o JOIN public.clinics c ON c.id = o.id;
  IF n_org <> (SELECT count(*) FROM public.clinics) THEN
    RAISE EXCEPTION 'organizations no coincide con clinics (% vs %)', n_org, (SELECT count(*) FROM public.clinics);
  END IF;

  SELECT count(*) INTO n_con FROM public.contacts k JOIN public.patients p ON p.id = k.id AND p.clinic_id = k.organization_id;
  IF n_con <> (SELECT count(*) FROM public.patients WHERE clinic_id IS NOT NULL) THEN
    RAISE EXCEPTION 'contacts no coincide con patients (% vs %)', n_con, (SELECT count(*) FROM public.patients WHERE clinic_id IS NOT NULL);
  END IF;

  SELECT count(*) INTO n_itm FROM public.items i JOIN public.services s ON s.id = i.id AND s.clinic_id = i.organization_id;
  IF n_itm <> (SELECT count(*) FROM public.services) THEN
    RAISE EXCEPTION 'items no coincide con services (% vs %)', n_itm, (SELECT count(*) FROM public.services);
  END IF;

  SELECT count(*) INTO n_bkg FROM public.bookings b JOIN public.appointments a ON a.id = b.id AND a.clinic_id = b.organization_id;
  IF n_bkg <> (SELECT count(*) FROM public.appointments WHERE clinic_id IS NOT NULL) THEN
    RAISE EXCEPTION 'bookings no coincide con appointments (% vs %)', n_bkg, (SELECT count(*) FROM public.appointments WHERE clinic_id IS NOT NULL);
  END IF;

  SELECT count(*) INTO n_act FROM public.activities WHERE type = 'note' AND booking_id IS NOT NULL;
  IF n_act < (SELECT count(*) FROM public.appointment_logs) THEN
    RAISE EXCEPTION 'activities tiene menos filas que appointment_logs (% vs %)', n_act, (SELECT count(*) FROM public.appointment_logs);
  END IF;

  SELECT count(*) INTO n_usr FROM public.users WHERE organization_id IS DISTINCT FROM clinic_id;
  IF n_usr <> 0 THEN
    RAISE EXCEPTION 'users con organization_id distinto de clinic_id: %', n_usr;
  END IF;
END $$;

COMMIT;
