-- Rollback de 007_hardening.sql
BEGIN;

DROP TRIGGER IF EXISTS bookings_same_org ON public.bookings;
DROP TRIGGER IF EXISTS activities_same_org ON public.activities;
DROP TRIGGER IF EXISTS opportunities_same_org ON public.opportunities;
DROP FUNCTION IF EXISTS public.trg_bookings_same_org();
DROP FUNCTION IF EXISTS public.trg_activities_same_org();
DROP FUNCTION IF EXISTS public.trg_opportunities_same_org();
DROP FUNCTION IF EXISTS public.assert_same_org(text, uuid, uuid);

GRANT INSERT, UPDATE, DELETE ON
  public.organizations, public.contacts, public.items, public.opportunities,
  public.bookings, public.activities, public.agent_actions,
  public.budgets, public.budget_members, public.budget_services
TO authenticated;

COMMIT;
