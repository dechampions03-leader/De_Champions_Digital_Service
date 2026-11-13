-- Limit guardian eligibility lookups to the linked child's own record or an authorised administrator.
-- This keeps the public RPC callable by authenticated clients while preventing arbitrary
-- authenticated users from probing whether other account UUIDs are approved adults.

CREATE OR REPLACE FUNCTION public.dcds_ai_guardian_is_approved_adult(p_guardian_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_caller_id uuid := (SELECT auth.uid());
  v_is_admin boolean := false;
  v_has_linked_guardian boolean := false;
BEGIN
  IF v_caller_id IS NULL OR p_guardian_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT COALESCE((SELECT public.is_dcds_admin()), false)
    INTO v_is_admin;

  IF NOT v_is_admin THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.dcds_ai_access_eligibility AS child
      WHERE child.user_id = v_caller_id
        AND child.guardian_user_id = p_guardian_user_id
        AND child.guardian_consent_status = 'verified'
        AND child.guardian_consent_reference IS NOT NULL
        AND child.guardian_consent_at IS NOT NULL
    ) INTO v_has_linked_guardian;

    IF NOT v_has_linked_guardian THEN
      RETURN false;
    END IF;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.dcds_ai_access_eligibility AS adult
    JOIN auth.users AS u ON u.id = adult.user_id
    WHERE adult.user_id = p_guardian_user_id
      AND adult.age_band = '18_plus'
      AND adult.access_status = 'approved'
      AND adult.guardian_consent_status = 'not_required'
      AND u.is_anonymous IS NOT TRUE
      AND (u.email_confirmed_at IS NOT NULL OR u.phone_confirmed_at IS NOT NULL)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.dcds_ai_guardian_is_approved_adult(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dcds_ai_guardian_is_approved_adult(uuid) TO authenticated;
