-- Prevent an administrator from approving their own DCDS AI eligibility record.
-- A separate authorised administrator must independently complete age assurance.

CREATE OR REPLACE FUNCTION private.dcds_prevent_ai_self_approval()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
BEGIN
  IF NEW.access_status = 'approved'
     AND v_actor_id IS NOT NULL
     AND NEW.user_id = v_actor_id THEN
    RAISE EXCEPTION 'A different authorised DCDS administrator must approve your own AI access request.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS dcds_ai_prevent_self_approval
  ON public.dcds_ai_access_eligibility;

CREATE TRIGGER dcds_ai_prevent_self_approval
  BEFORE INSERT OR UPDATE OF access_status
  ON public.dcds_ai_access_eligibility
  FOR EACH ROW
  EXECUTE FUNCTION private.dcds_prevent_ai_self_approval();
