-- DCDS admin support lookup and auditable case handling.
-- Exposes only a narrow student identity/status summary to signed-in DCDS admins.

CREATE OR REPLACE FUNCTION public.admin_lookup_student_for_support(p_lookup text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_lookup text := btrim(COALESCE(p_lookup, ''));
  v_digits text;
  v_alternate_digits text;
  v_match_count integer := 0;
  v_result jsonb;
  v_student_id uuid;
  v_lookup_type text;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT COALESCE(public.is_dcds_admin(), false) THEN
    RAISE EXCEPTION 'DCDS administrator access required' USING ERRCODE = '42501';
  END IF;

  IF v_lookup = '' OR char_length(v_lookup) > 254 THEN
    RAISE EXCEPTION 'Enter a registered student email address or mobile number';
  END IF;

  IF strpos(v_lookup, '@') > 0 THEN
    v_lookup_type := 'email';
    SELECT count(*)::integer
      INTO v_match_count
      FROM auth.users AS u
     WHERE lower(COALESCE(u.email, '')) = lower(v_lookup)
       AND NOT EXISTS (
         SELECT 1 FROM public.dcds_admins AS da WHERE da.user_id = u.id
       );
  ELSE
    IF v_lookup !~ '^[+0-9() .-]+$' THEN
      RAISE EXCEPTION 'Enter a complete registered email address or mobile number';
    END IF;

    v_lookup_type := 'mobile';
    v_digits := regexp_replace(v_lookup, '[^0-9]', '', 'g');
    IF char_length(v_digits) < 7 OR char_length(v_digits) > 15 THEN
      RAISE EXCEPTION 'Enter a complete mobile number, including its country code where required';
    END IF;

    -- Compare Nigerian local 0XXXXXXXXXX and international 234XXXXXXXXXX
    -- forms as equivalent, while still allowing exact matches for other countries.
    v_alternate_digits := CASE
      WHEN char_length(v_digits) = 11 AND left(v_digits, 1) = '0'
        THEN '234' || substr(v_digits, 2)
      WHEN char_length(v_digits) = 13 AND left(v_digits, 3) = '234'
        THEN '0' || substr(v_digits, 4)
      ELSE NULL
    END;

    SELECT count(DISTINCT u.id)::integer
      INTO v_match_count
      FROM auth.users AS u
      LEFT JOIN public.dcds_student_contact_numbers AS contact
        ON contact.user_id = u.id
     WHERE (
       regexp_replace(COALESCE(u.phone, ''), '[^0-9]', '', 'g') = ANY (ARRAY[v_digits, v_alternate_digits])
       OR regexp_replace(COALESCE(u.raw_user_meta_data ->> 'phone', ''), '[^0-9]', '', 'g') = ANY (ARRAY[v_digits, v_alternate_digits])
       OR regexp_replace(COALESCE(u.raw_user_meta_data ->> 'dcds_phone_e164', ''), '[^0-9]', '', 'g') = ANY (ARRAY[v_digits, v_alternate_digits])
       OR regexp_replace(COALESCE(contact.mobile_e164, ''), '[^0-9]', '', 'g') = ANY (ARRAY[v_digits, v_alternate_digits])
     )
       AND NOT EXISTS (
         SELECT 1 FROM public.dcds_admins AS da WHERE da.user_id = u.id
       );
  END IF;

  IF v_match_count = 0 THEN
    RETURN jsonb_build_object('found', false, 'message', 'No exact DCDS student account matched that email address or mobile number. Check the details and try again.');
  END IF;

  IF v_match_count > 1 THEN
    RETURN jsonb_build_object('found', false, 'ambiguous', true, 'message', 'More than one account matched that mobile number. Please use the student’s registered email address to identify the correct account.');
  END IF;

  SELECT u.id
    INTO v_student_id
    FROM auth.users AS u
    LEFT JOIN public.dcds_student_contact_numbers AS contact
      ON contact.user_id = u.id
   WHERE (
     (v_lookup_type = 'email' AND lower(COALESCE(u.email, '')) = lower(v_lookup))
     OR
     (v_lookup_type = 'mobile' AND (
       regexp_replace(COALESCE(u.phone, ''), '[^0-9]', '', 'g') = ANY (ARRAY[v_digits, v_alternate_digits])
       OR regexp_replace(COALESCE(u.raw_user_meta_data ->> 'phone', ''), '[^0-9]', '', 'g') = ANY (ARRAY[v_digits, v_alternate_digits])
       OR regexp_replace(COALESCE(u.raw_user_meta_data ->> 'dcds_phone_e164', ''), '[^0-9]', '', 'g') = ANY (ARRAY[v_digits, v_alternate_digits])
       OR regexp_replace(COALESCE(contact.mobile_e164, ''), '[^0-9]', '', 'g') = ANY (ARRAY[v_digits, v_alternate_digits])
     ))
   )
     AND NOT EXISTS (
       SELECT 1 FROM public.dcds_admins AS da WHERE da.user_id = u.id
     )
   LIMIT 1;

  SELECT jsonb_build_object(
    'found', true,
    'student', jsonb_build_object(
      'user_id', u.id,
      'full_name', COALESCE(
        NULLIF(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
        NULLIF(btrim(u.raw_user_meta_data ->> 'name'), ''),
        NULLIF(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
        NULLIF(btrim(concat_ws(' ', u.raw_user_meta_data ->> 'first_name', u.raw_user_meta_data ->> 'last_name')), ''),
        'DCDS Student'
      ),
      'email', u.email,
      'phone', COALESCE(
        NULLIF(btrim(contact.mobile_e164), ''),
        NULLIF(btrim(u.raw_user_meta_data ->> 'dcds_phone_e164'), ''),
        NULLIF(btrim(u.raw_user_meta_data ->> 'phone'), ''),
        NULLIF(btrim(u.phone), '')
      ),
      'account_created_at', u.created_at,
      'last_sign_in_at', u.last_sign_in_at,
      'email_verified', u.email_confirmed_at IS NOT NULL,
      'phone_verified', u.phone_confirmed_at IS NOT NULL,
      'account_status', CASE
        WHEN u.banned_until IS NOT NULL AND u.banned_until > now() THEN 'suspended'
        ELSE 'active'
      END,
      'enrollment_count', (
        SELECT count(*) FROM public.enrollments AS e WHERE e.user_id = u.id
      ),
      'open_support_count', (
        SELECT count(*) FROM public.student_support_tickets AS ticket
         WHERE ticket.user_id = u.id AND ticket.status IN ('open', 'in_progress')
      )
    )
  )
    INTO v_result
    FROM auth.users AS u
    LEFT JOIN public.dcds_student_contact_numbers AS contact
      ON contact.user_id = u.id
   WHERE u.id = v_student_id;

  -- Audit that a student identity was opened, without storing the email or phone
  -- supplied in the lookup field.
  INSERT INTO public.student_admin_audit (student_id, admin_id, action, details)
  VALUES (
    v_student_id,
    (SELECT auth.uid()),
    'support_identity_lookup',
    jsonb_build_object('lookup_type', v_lookup_type)
  );

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_create_student_support_case(
  p_student_id uuid,
  p_subject text,
  p_category text,
  p_message text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_ticket_id uuid;
  v_subject text := btrim(COALESCE(p_subject, ''));
  v_category text := lower(btrim(COALESCE(p_category, 'general')));
  v_message text := btrim(COALESCE(p_message, ''));
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT COALESCE(public.is_dcds_admin(), false) THEN
    RAISE EXCEPTION 'DCDS administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_student_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM auth.users AS u
     WHERE u.id = p_student_id
       AND NOT EXISTS (SELECT 1 FROM public.dcds_admins AS da WHERE da.user_id = u.id)
  ) THEN
    RAISE EXCEPTION 'A valid student account is required';
  END IF;
  IF char_length(v_subject) < 5 OR char_length(v_subject) > 150 THEN
    RAISE EXCEPTION 'Issue subject must be between 5 and 150 characters';
  END IF;
  IF v_category NOT IN ('account', 'course_access', 'learning', 'payment', 'technical', 'certificate', 'general') THEN
    RAISE EXCEPTION 'Choose a valid support category';
  END IF;
  IF char_length(v_message) < 10 OR char_length(v_message) > 5000 THEN
    RAISE EXCEPTION 'Issue description must be between 10 and 5000 characters';
  END IF;

  INSERT INTO public.student_support_tickets (
    user_id, subject, category, message, status, created_at, updated_at
  )
  VALUES (
    p_student_id, v_subject, v_category, v_message, 'open', now(), now()
  )
  RETURNING id INTO v_ticket_id;

  INSERT INTO public.student_admin_audit (student_id, admin_id, action, details)
  VALUES (
    p_student_id,
    (SELECT auth.uid()),
    'admin_support_case_created',
    jsonb_build_object(
      'ticket_id', v_ticket_id,
      'category', v_category,
      'subject', v_subject,
      'created_via', 'admin_support_lookup'
    )
  );

  RETURN jsonb_build_object('success', true, 'ticket_id', v_ticket_id, 'status', 'open');
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_student_support_ticket(
  p_ticket_id uuid,
  p_admin_response text,
  p_status text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_student_id uuid;
  v_status text := lower(btrim(COALESCE(p_status, '')));
  v_response text := btrim(COALESCE(p_admin_response, ''));
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT COALESCE(public.is_dcds_admin(), false) THEN
    RAISE EXCEPTION 'DCDS administrator access required' USING ERRCODE = '42501';
  END IF;
  IF v_status NOT IN ('open', 'in_progress', 'resolved', 'closed') THEN
    RAISE EXCEPTION 'Choose a valid support status';
  END IF;
  IF char_length(v_response) < 2 OR char_length(v_response) > 5000 THEN
    RAISE EXCEPTION 'Admin response must be between 2 and 5000 characters';
  END IF;

  SELECT ticket.user_id
    INTO v_student_id
    FROM public.student_support_tickets AS ticket
   WHERE ticket.id = p_ticket_id
   FOR UPDATE;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Support ticket not found';
  END IF;

  UPDATE public.student_support_tickets
     SET admin_response = v_response,
         status = v_status,
         responded_by = (SELECT auth.uid()),
         responded_at = now(),
         updated_at = now()
   WHERE id = p_ticket_id;

  INSERT INTO public.student_admin_audit (student_id, admin_id, action, details)
  VALUES (
    v_student_id,
    (SELECT auth.uid()),
    'admin_support_case_updated',
    jsonb_build_object(
      'ticket_id', p_ticket_id,
      'status', v_status,
      'response_length', char_length(v_response)
    )
  );

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_lookup_student_for_support(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_create_student_support_case(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_student_support_ticket(uuid, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_lookup_student_for_support(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_student_support_case(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_student_support_ticket(uuid, text, text) TO authenticated;
