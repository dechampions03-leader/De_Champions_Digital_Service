-- Narrow age/guardian review permissions to the actions administrators actually need.
-- The SELECT policy already includes administrators; the INSERT policy only permits
-- a user's own safe initial request. This avoids overlapping permissive policies.
DROP POLICY IF EXISTS "DCDS admins review AI eligibility"
  ON public.dcds_ai_access_eligibility;

CREATE POLICY "DCDS admins update AI eligibility"
  ON public.dcds_ai_access_eligibility
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_dcds_admin()))
  WITH CHECK ((SELECT public.is_dcds_admin()));

CREATE POLICY "DCDS admins delete AI eligibility"
  ON public.dcds_ai_access_eligibility
  FOR DELETE TO authenticated
  USING ((SELECT public.is_dcds_admin()));