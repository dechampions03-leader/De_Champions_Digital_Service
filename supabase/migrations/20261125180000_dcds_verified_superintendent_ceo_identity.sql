-- Link the authenticated Superintendent Admin account to the approved DCDS Founder & CEO identity.
-- This is an identity assertion only; it does not create or change administrator privileges.
-- The protected account must have a confirmed Supabase Auth email and existing admin/super_admin credentials.

CREATE OR REPLACE FUNCTION public.dcds_get_verified_superintendent_identity()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_email_confirmed boolean := false;
BEGIN
  IF v_user_id IS NULL OR NOT COALESCE(public.is_dcds_super_admin(), false) THEN
    RETURN jsonb_build_object(
      'identity_verified', false,
      'email_verified', false,
      'administrator_membership_verified', false,
      'protected_role_verified', false
    );
  END IF;

  SELECT (u.email IS NOT NULL AND u.email_confirmed_at IS NOT NULL)
  INTO v_email_confirmed
  FROM auth.users AS u
  WHERE u.id = v_user_id;

  IF NOT COALESCE(v_email_confirmed, false) THEN
    RETURN jsonb_build_object(
      'identity_verified', false,
      'email_verified', false,
      'administrator_membership_verified', true,
      'protected_role_verified', true
    );
  END IF;

  RETURN jsonb_build_object(
    'identity_verified', true,
    'email_verified', true,
    'administrator_membership_verified', true,
    'protected_role_verified', true,
    'owner_name', 'Jeremiah Chuks Godspower',
    'owner_alias', 'De Champions',
    'founder_title', 'Founder & CEO',
    'platform_title', 'Superintendent Admin',
    'organisation', 'De Champions Digital Services'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.dcds_get_verified_superintendent_identity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dcds_get_verified_superintendent_identity() FROM anon;
GRANT EXECUTE ON FUNCTION public.dcds_get_verified_superintendent_identity() TO authenticated;

COMMENT ON FUNCTION public.dcds_get_verified_superintendent_identity() IS
  'Returns the DCDS Founder & CEO identity only to the authenticated account whose email is confirmed and whose user ID has DCDS administrator membership plus the protected super_admin role. Never returns the actual email address. This does not grant or change permissions.';
