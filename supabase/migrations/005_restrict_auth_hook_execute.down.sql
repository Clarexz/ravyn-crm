-- Rollback de 005_restrict_auth_hook_execute.sql
-- Devuelve el estado previo: EXECUTE para PUBLIC, anon y authenticated.

BEGIN;

GRANT EXECUTE ON FUNCTION auth.custom_access_token_hook(jsonb) TO PUBLIC, anon, authenticated;

COMMIT;
