-- Rollback de 006_budgets.sql
-- Elimina presupuestos, contador y funciones en orden inverso. No toca otras tablas.
-- ATENCION: borra todos los datos de presupuestos.

BEGIN;

DROP TABLE IF EXISTS public.budget_services;
DROP TABLE IF EXISTS public.budget_members;
DROP TABLE IF EXISTS public.budgets;
DROP TABLE IF EXISTS public.budget_counters;

DROP FUNCTION IF EXISTS public.budget_services_check_org();
DROP FUNCTION IF EXISTS public.budget_members_check_org();
DROP FUNCTION IF EXISTS public.budgets_check_org();
DROP FUNCTION IF EXISTS public.budgets_assign_number();

COMMIT;
