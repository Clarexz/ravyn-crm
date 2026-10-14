-- Ravyn CRM v2 - Fase 0 - Migracion 001: esquema universal
-- Basado en docs/v2/fase-0-especificacion-tecnica.md (seccion 3), ajustado a la base real:
--   * Se reutiliza la funcion existente public.update_updated_at() (no se crea otra).
--   * Los planes v2 son starter/standard/enterprise; el plan v1 'basic' se mapea a 'starter' en la migracion 003.
--   * No toca ninguna tabla v1, salvo agregar la columna nullable users.organization_id.
-- Idempotente: se puede ejecutar mas de una vez. Rollback: 001_v2_schema.down.sql

BEGIN;

-- 1. ORGANIZATIONS (tenant principal)
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  industry text NOT NULL CHECK (industry IN ('health', 'restaurant', 'real_estate', 'professional_services', 'retail', 'general')),
  phone text,
  email text,
  subdomain text UNIQUE,
  plan text NOT NULL DEFAULT 'standard' CHECK (plan IN ('starter', 'standard', 'enterprise')),
  settings jsonb NOT NULL DEFAULT '{
    "active_modules": ["contacts", "bookings", "pipeline", "activities"],
    "business_hours": {"start": "09:00", "end": "18:00", "days": [1,2,3,4,5]},
    "agent_autonomy": "balanced"
  }'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_organizations_updated_at ON public.organizations;
CREATE TRIGGER set_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 2. USERS: vinculo con la organizacion (se rellena en la migracion 003)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_users_organization_id ON public.users(organization_id);

-- 3. CONTACTS (evolucion de patients)
CREATE TABLE IF NOT EXISTS public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text,
  email text,
  company_name text,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('whatsapp', 'web', 'manual', 'agent_receptionist', 'import')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contacts_org_id ON public.contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON public.contacts(organization_id, phone);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON public.contacts(organization_id, email);

DROP TRIGGER IF EXISTS set_contacts_updated_at ON public.contacts;
CREATE TRIGGER set_contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 4. ITEMS (catalogo universal de productos y servicios)
CREATE TABLE IF NOT EXISTS public.items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'service' CHECK (type IN ('service', 'product', 'experience')),
  description text,
  price numeric(12,2) NOT NULL DEFAULT 0.00,
  color text NOT NULL DEFAULT '#6366f1',
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_items_org_active ON public.items(organization_id, active);

DROP TRIGGER IF EXISTS set_items_updated_at ON public.items;
CREATE TRIGGER set_items_updated_at
  BEFORE UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 5. OPPORTUNITIES (pipeline de ventas)
CREATE TABLE IF NOT EXISTS public.opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  title text NOT NULL,
  stage text NOT NULL CHECK (stage IN ('lead', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost')),
  value numeric(12,2) NOT NULL DEFAULT 0.00,
  currency text NOT NULL DEFAULT 'MXN',
  probability int NOT NULL DEFAULT 0 CHECK (probability BETWEEN 0 AND 100),
  assigned_to uuid REFERENCES public.users(id) ON DELETE SET NULL,
  expected_close_date date,
  closed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opportunities_org_stage ON public.opportunities(organization_id, stage);
CREATE INDEX IF NOT EXISTS idx_opportunities_contact ON public.opportunities(contact_id);

DROP TRIGGER IF EXISTS set_opportunities_updated_at ON public.opportunities;
CREATE TRIGGER set_opportunities_updated_at
  BEFORE UPDATE ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 6. BOOKINGS (generalizacion de appointments)
-- service_snapshot conserva el texto historico del servicio (appointments.service),
-- item_id la referencia al catalogo (appointments.service_id) y cost_at_booking el precio congelado.
CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  item_id uuid REFERENCES public.items(id) ON DELETE SET NULL,
  scheduled_at timestamptz NOT NULL,
  duration_minutes int NOT NULL DEFAULT 30,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
  service_snapshot text,
  cost_at_booking numeric(12,2),
  notes text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('whatsapp', 'web', 'manual', 'agent_booking')),
  n8n_execution_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookings_org_scheduled ON public.bookings(organization_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_bookings_contact ON public.bookings(contact_id);

DROP TRIGGER IF EXISTS set_bookings_updated_at ON public.bookings;
CREATE TRIGGER set_bookings_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 7. ACTIVITIES (historial unificado de humanos y agentes)
CREATE TABLE IF NOT EXISTS public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('call', 'message', 'meeting', 'task', 'note', 'stage_change', 'agent_interaction')),
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'cancelled')),
  performed_by_type text NOT NULL CHECK (performed_by_type IN ('human', 'agent')),
  performed_by_id text NOT NULL,
  due_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activities_org_contact ON public.activities(organization_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_activities_opportunity ON public.activities(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_activities_booking ON public.activities(booking_id);

-- 8. AGENT_ACTIONS (gobernanza y human-in-the-loop)
CREATE TABLE IF NOT EXISTS public.agent_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_name text NOT NULL CHECK (agent_name IN ('orchestrator', 'receptionist', 'sales', 'follow_up', 'booking', 'analyst')),
  action_type text NOT NULL,
  payload jsonb NOT NULL,
  requires_approval boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'failed')),
  proposed_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_notes text,
  execution_result jsonb,
  error_message text
);

CREATE INDEX IF NOT EXISTS idx_agent_actions_org_status ON public.agent_actions(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_actions_pending ON public.agent_actions(organization_id) WHERE status = 'pending';

COMMIT;
