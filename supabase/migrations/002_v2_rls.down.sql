-- Rollback de 002_v2_rls.sql
-- Quita las politicas y desactiva RLS en las tablas v2.
-- Advertencia: tras este rollback las tablas v2 quedan sin proteccion para anon/authenticated.

BEGIN;

DROP POLICY IF EXISTS org_isolation ON public.agent_actions;
DROP POLICY IF EXISTS org_isolation ON public.activities;
DROP POLICY IF EXISTS org_isolation ON public.bookings;
DROP POLICY IF EXISTS org_isolation ON public.opportunities;
DROP POLICY IF EXISTS org_isolation ON public.items;
DROP POLICY IF EXISTS org_isolation ON public.contacts;
DROP POLICY IF EXISTS org_isolation ON public.organizations;

ALTER TABLE public.agent_actions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities    DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunities DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.items         DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations DISABLE ROW LEVEL SECURITY;

COMMIT;
