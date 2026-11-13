-- Keep the verified-account RLS helper out of the exposed public API schema.
-- Policies continue to call the same function; only its schema visibility changes.

CREATE SCHEMA IF NOT EXISTS private;
ALTER FUNCTION public.dcds_is_verified_ai_user()
  SET SCHEMA private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon;
GRANT USAGE ON SCHEMA private TO authenticated;

REVOKE ALL ON FUNCTION private.dcds_is_verified_ai_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.dcds_is_verified_ai_user() FROM anon;
GRANT EXECUTE ON FUNCTION private.dcds_is_verified_ai_user() TO authenticated;
