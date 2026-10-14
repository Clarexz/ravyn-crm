-- Ravyn CRM v2 - Fase 0 - Migracion 002: RLS de las tablas v2
-- Habilita RLS y aisla por tenant usando el claim organization_id del JWT.
-- El claim lo inyecta custom_access_token_hook (se actualiza en la migracion 004).
-- Hasta entonces, los roles anon/authenticated no ven nada en estas tablas;
-- el backend Next.js usa service role (bypass de RLS), asi que la app no se afecta.
-- Idempotente. Rollback: 002_v2_rls.down.sql

BEGIN;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation ON public.organizations;
CREATE POLICY org_isolation ON public.organizations
  FOR ALL USING (id = (auth.jwt() ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS org_isolation ON public.contacts;
CREATE POLICY org_isolation ON public.contacts
  FOR ALL USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS org_isolation ON public.items;
CREATE POLICY org_isolation ON public.items
  FOR ALL USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS org_isolation ON public.opportunities;
CREATE POLICY org_isolation ON public.opportunities
  FOR ALL USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS org_isolation ON public.bookings;
CREATE POLICY org_isolation ON public.bookings
  FOR ALL USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS org_isolation ON public.activities;
CREATE POLICY org_isolation ON public.activities
  FOR ALL USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS org_isolation ON public.agent_actions;
CREATE POLICY org_isolation ON public.agent_actions
  FOR ALL USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

COMMIT;
