-- DCDS AI age and guardian eligibility gate.
-- Store only an age band, never a full date of birth or identity-document image.
CREATE TABLE IF NOT EXISTS public.dcds_ai_access_eligibility (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  age_band text NOT NULL CHECK (age_band IN ('under_13','13_17','18_plus')),
  access_status text NOT NULL DEFAULT 'pending'
    CHECK (access_status IN ('pending','approved','rejected','blocked')),
  guardian_consent_status text NOT NULL DEFAULT 'not_required'
    CHECK (guardian_consent_status IN ('not_required','pending','verified','rejected')),
  guardian_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  guardian_consent_reference text,
  guardian_consent_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text CHECK (review_note IS NULL OR char_length(review_note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dcds_ai_guardian_verification_consistent CHECK (
    (age_band = '18_plus' AND guardian_consent_status = 'not_required' AND guardian_user_id IS NULL)
    OR
    (age_band IN ('13_17','under_13') AND guardian_consent_status <> 'not_required')
  ),
  CONSTRAINT dcds_ai_guardian_verification_fields CHECK (
    guardian_consent_status <> 'verified'
    OR (
      guardian_user_id IS NOT NULL
      AND guardian_consent_at IS NOT NULL
      AND guardian_consent_reference IS NOT NULL
      AND char_length(guardian_consent_reference) BETWEEN 6 AND 120
    )
  )
);

COMMENT ON TABLE public.dcds_ai_access_eligibility IS
  'Minimal AI access eligibility record. Stores an age band and reviewed guardian-consent status only; never store full date of birth, identity documents or raw guardian evidence here. Access is denied unless the server validates the approved age/consent state.';
COMMENT ON COLUMN public.dcds_ai_access_eligibility.guardian_consent_reference IS
  'DCDS internal audit reference to separately verified guardian consent evidence. Do not store the evidence document or sensitive identity details in this field.';

CREATE OR REPLACE FUNCTION private.dcds_prepare_ai_eligibility_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.access_status := CASE WHEN NEW.age_band = 'under_13' THEN 'blocked' ELSE 'pending' END;
    NEW.guardian_consent_status := CASE WHEN NEW.age_band = '18_plus' THEN 'not_required' ELSE 'pending' END;
    NEW.guardian_user_id := NULL;
    NEW.guardian_consent_reference := NULL;
    NEW.guardian_consent_at := NULL;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.review_note := NULL;
    NEW.created_at := now();
    NEW.updated_at := now();
  ELSE
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS dcds_ai_prepare_eligibility_request
  ON public.dcds_ai_access_eligibility;
CREATE TRIGGER dcds_ai_prepare_eligibility_request
  BEFORE INSERT OR UPDATE ON public.dcds_ai_access_eligibility
  FOR EACH ROW EXECUTE FUNCTION private.dcds_prepare_ai_eligibility_request();

ALTER TABLE public.dcds_ai_access_eligibility ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read their own DCDS AI eligibility"
  ON public.dcds_ai_access_eligibility;
CREATE POLICY "Users read their own DCDS AI eligibility"
  ON public.dcds_ai_access_eligibility
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_dcds_admin()));

DROP POLICY IF EXISTS "Users submit their own DCDS AI eligibility request"
  ON public.dcds_ai_access_eligibility;
CREATE POLICY "Users submit their own DCDS AI eligibility request"
  ON public.dcds_ai_access_eligibility
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (
      (age_band = '18_plus' AND access_status = 'pending' AND guardian_consent_status = 'not_required')
      OR
      (age_band = '13_17' AND access_status = 'pending' AND guardian_consent_status = 'pending')
      OR
      (age_band = 'under_13' AND access_status = 'blocked' AND guardian_consent_status = 'pending')
    )
    AND guardian_user_id IS NULL
    AND guardian_consent_reference IS NULL
    AND guardian_consent_at IS NULL
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
  );

DROP POLICY IF EXISTS "DCDS admins review AI eligibility"
  ON public.dcds_ai_access_eligibility;
CREATE POLICY "DCDS admins review AI eligibility"
  ON public.dcds_ai_access_eligibility
  FOR ALL TO authenticated
  USING ((SELECT public.is_dcds_admin()))
  WITH CHECK ((SELECT public.is_dcds_admin()));

REVOKE ALL ON TABLE public.dcds_ai_access_eligibility FROM anon;
GRANT SELECT, INSERT ON TABLE public.dcds_ai_access_eligibility TO authenticated;
GRANT UPDATE, DELETE ON TABLE public.dcds_ai_access_eligibility TO authenticated;

-- Expose only a boolean guardian eligibility check to the child's authenticated
-- session. The child cannot read the guardian's age record or private profile.
CREATE OR REPLACE FUNCTION public.dcds_ai_guardian_is_approved_adult(p_guardian_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.dcds_ai_access_eligibility AS e
    WHERE e.user_id = p_guardian_user_id
      AND e.age_band = '18_plus'
      AND e.access_status = 'approved'
      AND e.guardian_consent_status = 'not_required'
  );
$function$;

REVOKE ALL ON FUNCTION public.dcds_ai_guardian_is_approved_adult(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dcds_ai_guardian_is_approved_adult(uuid) TO authenticated;
