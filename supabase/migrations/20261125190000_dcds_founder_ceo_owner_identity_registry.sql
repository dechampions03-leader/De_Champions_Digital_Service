-- Bind the DCDS Founder & CEO identity to one designated protected owner account.
-- A generic or subsequently-created super_admin account must not automatically become the CEO.
-- The current unique, email-confirmed DCDS super_admin account is seeded once into a private registry.

CREATE TABLE IF NOT EXISTS public.dcds_verified_owner_identities (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_name text NOT NULL,
  owner_alias text NOT NULL,
  founder_title text NOT NULL,
  platform_title text NOT NULL,
  organisation text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dcds_verified_owner_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dcds_verified_owner_identities FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.dcds_verified_owner_identities FROM PUBLIC;
REVOKE ALL ON TABLE public.dcds_verified_owner_identities FROM anon;
REVOKE ALL ON TABLE public.dcds_verified_owner_identities FROM authenticated;
GRANT ALL ON TABLE public.dcds_verified_owner_identities TO service_role;

COMMENT ON TABLE public.dcds_verified_owner_identities IS
  'Private mapping of specifically designated DCDS owner accounts to approved founder identities. Never readable by anon or authenticated clients.';

-- Fail closed if there is more than one protected super_admin. A future administrator
-- promoted to super_admin will not inherit the CEO identity from the role alone.
INSERT INTO public.dcds_verified_owner_identities (
  user_id,
  owner_name,
  owner_alias,
  founder_title,
  platform_title,
  organisation,
  is_active
)
SELECT
  a.user_id,
  'Jeremiah Chuks Godspower',
  'De Champions',
  'Founder & CEO',
  'Superintendent Admin',
  'De Champions Digital Services',
  true
FROM public.admin_users AS a
JOIN public.dcds_admins AS d ON d.user_id = a.user_id
JOIN auth.users AS u ON u.id = a.user_id
WHERE a.role = 'super_admin'
  AND u.email IS NOT NULL
  AND u.email_confirmed_at IS NOT NULL
  AND (
    SELECT count(*)
    FROM public.admin_users AS all_super_admins
    WHERE all_super_admins.role = 'super_admin'
  ) = 1
ON CONFLICT (user_id) DO NOTHING;

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
  v_owner public.dcds_verified_owner_identities%ROWTYPE;
BEGIN
  IF v_user_id IS NULL OR NOT COALESCE(public.is_dcds_super_admin(), false) THEN
    RETURN jsonb_build_object(
      'identity_verified', false,
      'email_verified', false,
      'administrator_membership_verified', false,
      'protected_role_verified', false,
      'designated_owner_mapping_verified', false
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
      'protected_role_verified', true,
      'designated_owner_mapping_verified', false
    );
  END IF;

  SELECT oi.*
  INTO v_owner
  FROM public.dcds_verified_owner_identities AS oi
  WHERE oi.user_id = v_user_id
    AND oi.is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'identity_verified', false,
      'email_verified', true,
      'administrator_membership_verified', true,
      'protected_role_verified', true,
      'designated_owner_mapping_verified', false
    );
  END IF;

  RETURN jsonb_build_object(
    'identity_verified', true,
    'email_verified', true,
    'administrator_membership_verified', true,
    'protected_role_verified', true,
    'designated_owner_mapping_verified', true,
    'owner_name', v_owner.owner_name,
    'owner_alias', v_owner.owner_alias,
    'founder_title', v_owner.founder_title,
    'platform_title', v_owner.platform_title,
    'organisation', v_owner.organisation
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.dcds_get_verified_superintendent_identity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dcds_get_verified_superintendent_identity() FROM anon;
GRANT EXECUTE ON FUNCTION public.dcds_get_verified_superintendent_identity() TO authenticated;

COMMENT ON FUNCTION public.dcds_get_verified_superintendent_identity() IS
  'Returns the Founder & CEO identity only when the current auth.uid() has a confirmed email, DCDS administrator membership, protected super_admin role, and a matching active private designated-owner identity row. Does not disclose the email or grant privileges.';
