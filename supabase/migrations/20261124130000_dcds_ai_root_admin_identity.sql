-- Give Deyriva a server-verified distinction between ordinary admins and the root owner.
-- The root-admin check requires BOTH the existing DCDS admin membership and the
-- existing super_admin role in public.admin_users. It does not trust browser metadata.
CREATE OR REPLACE FUNCTION public.is_dcds_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users AS a
    JOIN public.dcds_admins AS d ON d.user_id = a.user_id
    WHERE a.user_id = (SELECT auth.uid())
      AND a.role = 'super_admin'
  );
$function$;

COMMENT ON FUNCTION public.is_dcds_super_admin()
IS 'Returns true only for the authenticated user who has both DCDS admin membership and the super_admin role. Used for verified DCDS root-admin recognition in Deyriva.';

REVOKE ALL ON FUNCTION public.is_dcds_super_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_dcds_super_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_dcds_super_admin() TO authenticated;
