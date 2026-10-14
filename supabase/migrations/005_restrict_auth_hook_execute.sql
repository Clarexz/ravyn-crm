-- Ravyn CRM v2 - Fase 0 - Migracion 005: restringir EXECUTE del hook de JWT
-- auth.custom_access_token_hook es SECURITY DEFINER y solo debe invocarlo GoTrue (supabase_auth_admin).
-- Antes lo podian ejecutar PUBLIC, anon y authenticated. Es el patron recomendado por Supabase.
-- Rollback: 005_restrict_auth_hook_execute.down.sql

BEGIN;

GRANT USAGE ON SCHEMA auth TO supabase_auth_admin;

REVOKE EXECUTE ON FUNCTION auth.custom_access_token_hook(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.custom_access_token_hook(jsonb) TO supabase_auth_admin;

COMMIT;
