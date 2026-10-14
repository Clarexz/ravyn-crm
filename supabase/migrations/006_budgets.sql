-- Ravyn CRM v2 - Fase 0b - Migracion 006: presupuestos (budgets) directamente en formato v2
--   * budgets, budget_members, budget_services: tablas nuevas con organization_id (tenant).
--   * budget_counters: contador por organizacion; budget_number ('PRES-0001') lo asigna la base
--     con un trigger BEFORE INSERT (INSERT ... ON CONFLICT DO UPDATE ... RETURNING, seguro ante concurrencia).
--   * Triggers de coherencia entre organizaciones (defensa en profundidad).
--   * RLS org_isolation igual que la migracion 002; budget_counters sin politicas (solo via trigger).
--   * REVOKE a anon (y a authenticated sobre budget_counters).
-- Requiere 001 y 002 (organizations, contacts, items, public.update_updated_at()).
-- Idempotente. Rollback: 006_budgets.down.sql

BEGIN;

-- 1. Tablas
CREATE TABLE IF NOT EXISTS public.budget_counters (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  last_number int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  budget_number text NOT NULL,
  responsible_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  responsible_name text NOT NULL,
  responsible_phone text,
  responsible_email text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'accepted', 'expired')),
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  discount_value numeric(12,2) NOT NULL DEFAULT 0,
  discount_type text NOT NULL DEFAULT 'percentage' CHECK (discount_type IN ('percentage', 'fixed')),
  total numeric(12,2) NOT NULL DEFAULT 0,
  validity_days int NOT NULL DEFAULT 15,
  payment_method text,
  doctor_notes text,
  patient_notes text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT budgets_org_number_key UNIQUE (organization_id, budget_number)
);

CREATE TABLE IF NOT EXISTS public.budget_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  budget_id uuid NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  relationship text NOT NULL CHECK (relationship IN ('responsible', 'spouse', 'child', 'other')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.budget_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  budget_member_id uuid NOT NULL REFERENCES public.budget_members(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.items(id) ON DELETE SET NULL,
  name text NOT NULL,
  sessions int NOT NULL DEFAULT 1 CHECK (sessions > 0),
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  is_manual_price boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Indices
CREATE INDEX IF NOT EXISTS idx_budgets_org_created ON public.budgets(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_budgets_org_status ON public.budgets(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_budgets_responsible ON public.budgets(responsible_id);
CREATE INDEX IF NOT EXISTS idx_budget_members_org_budget ON public.budget_members(organization_id, budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_members_budget ON public.budget_members(budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_services_org_member ON public.budget_services(organization_id, budget_member_id);
CREATE INDEX IF NOT EXISTS idx_budget_services_member ON public.budget_services(budget_member_id);
CREATE INDEX IF NOT EXISTS idx_budget_services_service ON public.budget_services(service_id);

-- 3. Funciones de trigger
-- Asigna el correlativo por organizacion y siempre sobrescribe lo que envie el cliente.
-- El UPSERT toma lock de fila sobre el contador: inserciones concurrentes de la misma
-- organizacion se serializan y no duplican numero. Borrar un presupuesto no reutiliza su numero.
-- En UPDATE hace inmutables organization_id y budget_number.
CREATE OR REPLACE FUNCTION public.budgets_assign_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_next int;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'budgets.organization_id no se puede cambiar';
    END IF;
    NEW.budget_number := OLD.budget_number;
    RETURN NEW;
  END IF;

  INSERT INTO public.budget_counters AS c (organization_id, last_number)
  VALUES (NEW.organization_id, 1)
  ON CONFLICT (organization_id) DO UPDATE SET last_number = c.last_number + 1
  RETURNING c.last_number INTO v_next;

  NEW.budget_number := 'PRES-' || lpad(v_next::text, 4, '0');
  RETURN NEW;
END;
$$;

-- Coherencia de organizacion en budgets (responsible_id).
CREATE OR REPLACE FUNCTION public.budgets_check_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.responsible_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contacts WHERE id = NEW.responsible_id AND organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'responsible_id % no pertenece a la organizacion %', NEW.responsible_id, NEW.organization_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.budget_members_check_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.budgets WHERE id = NEW.budget_id AND organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'budget_id % no pertenece a la organizacion %', NEW.budget_id, NEW.organization_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.budget_services_check_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.budget_members WHERE id = NEW.budget_member_id AND organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'budget_member_id % no pertenece a la organizacion %', NEW.budget_member_id, NEW.organization_id;
  END IF;
  IF NEW.service_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.items WHERE id = NEW.service_id AND organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'service_id % no pertenece a la organizacion %', NEW.service_id, NEW.organization_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Solo las invocan los triggers; nadie necesita EXECUTE directo.
REVOKE ALL ON FUNCTION public.budgets_assign_number()     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.budgets_check_org()         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.budget_members_check_org()  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.budget_services_check_org() FROM PUBLIC, anon, authenticated;

-- 4. Triggers (los BEFORE corren en orden alfabetico por nombre)
DROP TRIGGER IF EXISTS a_budgets_assign_number ON public.budgets;
CREATE TRIGGER a_budgets_assign_number
  BEFORE INSERT OR UPDATE ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION public.budgets_assign_number();

DROP TRIGGER IF EXISTS b_budgets_check_org ON public.budgets;
CREATE TRIGGER b_budgets_check_org
  BEFORE INSERT OR UPDATE OF organization_id, responsible_id ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION public.budgets_check_org();

DROP TRIGGER IF EXISTS set_budgets_updated_at ON public.budgets;
CREATE TRIGGER set_budgets_updated_at
  BEFORE UPDATE ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS budget_members_check_org ON public.budget_members;
CREATE TRIGGER budget_members_check_org
  BEFORE INSERT OR UPDATE OF organization_id, budget_id ON public.budget_members
  FOR EACH ROW EXECUTE FUNCTION public.budget_members_check_org();

DROP TRIGGER IF EXISTS budget_services_check_org ON public.budget_services;
CREATE TRIGGER budget_services_check_org
  BEFORE INSERT OR UPDATE OF organization_id, budget_member_id, service_id ON public.budget_services
  FOR EACH ROW EXECUTE FUNCTION public.budget_services_check_org();

-- 5. RLS
ALTER TABLE public.budget_counters ENABLE ROW LEVEL SECURITY;  -- sin politicas: solo via trigger SECURITY DEFINER
ALTER TABLE public.budgets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation ON public.budgets;
CREATE POLICY org_isolation ON public.budgets
  FOR ALL USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS org_isolation ON public.budget_members;
CREATE POLICY org_isolation ON public.budget_members
  FOR ALL USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS org_isolation ON public.budget_services;
CREATE POLICY org_isolation ON public.budget_services
  FOR ALL USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

-- 6. Privilegios
REVOKE ALL ON public.budgets         FROM anon;
REVOKE ALL ON public.budget_members  FROM anon;
REVOKE ALL ON public.budget_services FROM anon;
REVOKE ALL ON public.budget_counters FROM anon, authenticated;

COMMIT;
