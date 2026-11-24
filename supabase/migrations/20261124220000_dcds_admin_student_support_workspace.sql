-- DCDS administrator-only exact student lookup and support case workspace.
-- This migration intentionally excludes student payment/order details from the support workspace.

CREATE OR REPLACE FUNCTION public.admin_lookup_student_support_contact(p_contact text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_contact text := btrim(coalesce(p_contact, ''));
  v_digits text;
  v_phone_key text;
  v_count integer := 0;
  v_matches jsonb := '[]'::jsonb;
BEGIN
  IF NOT coalesce(public.is_dcds_admin(), false) THEN
    RAISE EXCEPTION 'Administrator access required' USING errcode = '42501';
  END IF;

  IF char_length(v_contact) < 5 OR char_length(v_contact) > 254 THEN
    RAISE EXCEPTION 'Enter a valid student email address or phone number';
  END IF;

  IF position('@' IN v_contact) > 0 THEN
    SELECT count(*)::integer
      INTO v_count
      FROM auth.users u
     WHERE lower(btrim(coalesce(u.email, ''))) = lower(v_contact);

    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'student_id', matched.id,
      'full_name', matched.full_name,
      'email', matched.email,
      'phone', matched.phone,
      'created_at', matched.created_at,
      'last_sign_in_at', matched.last_sign_in_at,
      'email_confirmed_at', matched.email_confirmed_at,
      'phone_confirmed_at', matched.phone_confirmed_at,
      'banned_until', matched.banned_until
    )), '[]'::jsonb)
      INTO v_matches
      FROM (
        SELECT
          u.id,
          coalesce(
            nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
            nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
            'DCDS Student'
          ) AS full_name,
          u.email::text AS email,
          coalesce(
            nullif(btrim(u.raw_user_meta_data ->> 'dcds_phone_e164'), ''),
            nullif(btrim(u.raw_user_meta_data ->> 'phone'), ''),
            nullif(btrim(u.phone), '')
          ) AS phone,
          u.created_at,
          u.last_sign_in_at,
          u.email_confirmed_at,
          u.phone_confirmed_at,
          u.banned_until
        FROM auth.users u
        WHERE lower(btrim(coalesce(u.email, ''))) = lower(v_contact)
        ORDER BY u.created_at DESC
        LIMIT 5
      ) AS matched;
  ELSE
    v_digits := regexp_replace(v_contact, '[^0-9]', '', 'g');
    IF char_length(v_digits) < 7 OR char_length(v_digits) > 15 THEN
      RAISE EXCEPTION 'Enter a complete email address or phone number';
    END IF;

    v_phone_key := CASE
      WHEN char_length(v_digits) = 11 AND left(v_digits, 1) = '0'
        THEN '234' || substr(v_digits, 2)
      WHEN char_length(v_digits) = 10 AND left(v_digits, 1) IN ('7', '8', '9')
        THEN '234' || v_digits
      ELSE v_digits
    END;

    SELECT count(*)::integer
      INTO v_count
      FROM auth.users u
     WHERE EXISTS (
       SELECT 1
         FROM unnest(ARRAY[
           u.raw_user_meta_data ->> 'dcds_phone_e164',
           u.raw_user_meta_data ->> 'phone',
           u.phone
         ]::text[]) AS candidate(value)
         CROSS JOIN LATERAL (
           SELECT regexp_replace(coalesce(candidate.value, ''), '[^0-9]', '', 'g') AS digits
         ) AS raw_phone
        WHERE raw_phone.digits <> ''
          AND CASE
            WHEN char_length(raw_phone.digits) = 11 AND left(raw_phone.digits, 1) = '0'
              THEN '234' || substr(raw_phone.digits, 2)
            WHEN char_length(raw_phone.digits) = 10 AND left(raw_phone.digits, 1) IN ('7', '8', '9')
              THEN '234' || raw_phone.digits
            ELSE raw_phone.digits
          END = v_phone_key
     );

    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'student_id', matched.id,
      'full_name', matched.full_name,
      'email', matched.email,
      'phone', matched.phone,
      'created_at', matched.created_at,
      'last_sign_in_at', matched.last_sign_in_at,
      'email_confirmed_at', matched.email_confirmed_at,
      'phone_confirmed_at', matched.phone_confirmed_at,
      'banned_until', matched.banned_until
    )), '[]'::jsonb)
      INTO v_matches
      FROM (
        SELECT
          u.id,
          coalesce(
            nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
            nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
            'DCDS Student'
          ) AS full_name,
          u.email::text AS email,
          coalesce(
            nullif(btrim(u.raw_user_meta_data ->> 'dcds_phone_e164'), ''),
            nullif(btrim(u.raw_user_meta_data ->> 'phone'), ''),
            nullif(btrim(u.phone), '')
          ) AS phone,
          u.created_at,
          u.last_sign_in_at,
          u.email_confirmed_at,
          u.phone_confirmed_at,
          u.banned_until
        FROM auth.users u
        WHERE EXISTS (
          SELECT 1
            FROM unnest(ARRAY[
              u.raw_user_meta_data ->> 'dcds_phone_e164',
              u.raw_user_meta_data ->> 'phone',
              u.phone
            ]::text[]) AS candidate(value)
            CROSS JOIN LATERAL (
              SELECT regexp_replace(coalesce(candidate.value, ''), '[^0-9]', '', 'g') AS digits
            ) AS raw_phone
           WHERE raw_phone.digits <> ''
             AND CASE
               WHEN char_length(raw_phone.digits) = 11 AND left(raw_phone.digits, 1) = '0'
                 THEN '234' || substr(raw_phone.digits, 2)
               WHEN char_length(raw_phone.digits) = 10 AND left(raw_phone.digits, 1) IN ('7', '8', '9')
                 THEN '234' || raw_phone.digits
               ELSE raw_phone.digits
             END = v_phone_key
        )
        ORDER BY u.created_at DESC
        LIMIT 5
      ) AS matched;
  END IF;

  RETURN jsonb_build_object(
    'match_count', v_count,
    'matches', v_matches,
    'match_type', CASE WHEN position('@' IN v_contact) > 0 THEN 'email' ELSE 'phone' END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_get_student_support_workspace(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT coalesce(public.is_dcds_admin(), false) THEN
    RAISE EXCEPTION 'Administrator access required' USING errcode = '42501';
  END IF;

  SELECT jsonb_build_object(
    'student', jsonb_build_object(
      'student_id', u.id,
      'full_name', coalesce(
        nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
        nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
        'DCDS Student'
      ),
      'email', u.email,
      'phone', coalesce(
        nullif(btrim(u.raw_user_meta_data ->> 'dcds_phone_e164'), ''),
        nullif(btrim(u.raw_user_meta_data ->> 'phone'), ''),
        nullif(btrim(u.phone), '')
      ),
      'created_at', u.created_at,
      'last_sign_in_at', u.last_sign_in_at,
      'email_confirmed_at', u.email_confirmed_at,
      'phone_confirmed_at', u.phone_confirmed_at,
      'banned_until', u.banned_until,
      'account_active', (u.banned_until IS NULL OR u.banned_until <= now())
    ),
    'support_tickets', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', t.id,
        'subject', t.subject,
        'category', t.category,
        'message', t.message,
        'status', t.status,
        'admin_response', t.admin_response,
        'responded_at', t.responded_at,
        'created_at', t.created_at,
        'updated_at', t.updated_at
      ) ORDER BY t.created_at DESC)
      FROM (
        SELECT *
        FROM public.student_support_tickets
        WHERE user_id = u.id
          AND category <> 'payment'
        ORDER BY created_at DESC
        LIMIT 30
      ) AS t
    ), '[]'::jsonb),
    'internal_notes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', n.id,
        'note', n.note,
        'created_at', n.created_at
      ) ORDER BY n.created_at DESC)
      FROM (
        SELECT id, note, created_at
        FROM public.student_admin_notes
        WHERE student_id = u.id
        ORDER BY created_at DESC
        LIMIT 20
      ) AS n
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM auth.users u
  WHERE u.id = p_student_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Student account not found';
  END IF;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_create_student_support_ticket(
  p_student_id uuid,
  p_subject text,
  p_category text,
  p_message text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_ticket_id uuid;
BEGIN
  IF NOT coalesce(public.is_dcds_admin(), false) THEN
    RAISE EXCEPTION 'Administrator access required' USING errcode = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_student_id) THEN
    RAISE EXCEPTION 'Student account not found';
  END IF;
  IF p_subject IS NULL OR char_length(btrim(p_subject)) < 5 OR char_length(btrim(p_subject)) > 150 THEN
    RAISE EXCEPTION 'Issue title must be between 5 and 150 characters';
  END IF;
  IF p_message IS NULL OR char_length(btrim(p_message)) < 10 OR char_length(btrim(p_message)) > 5000 THEN
    RAISE EXCEPTION 'Issue description must be between 10 and 5000 characters';
  END IF;
  IF p_category NOT IN ('account', 'course_access', 'learning', 'technical', 'certificate', 'general') THEN
    RAISE EXCEPTION 'Choose a supported non-payment support category';
  END IF;

  INSERT INTO public.student_support_tickets(user_id, subject, category, message, status)
  VALUES (p_student_id, btrim(p_subject), p_category, btrim(p_message), 'open')
  RETURNING id INTO v_ticket_id;

  INSERT INTO public.student_admin_audit(student_id, admin_id, action, details)
  VALUES (
    p_student_id,
    auth.uid(),
    'admin_support_case_created',
    jsonb_build_object('ticket_id', v_ticket_id, 'category', p_category)
  );

  RETURN v_ticket_id;
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
BEGIN
  IF NOT coalesce(public.is_dcds_admin(), false) THEN
    RAISE EXCEPTION 'Administrator access required' USING errcode = '42501';
  END IF;
  IF p_admin_response IS NULL OR char_length(btrim(p_admin_response)) < 2 OR char_length(btrim(p_admin_response)) > 5000 THEN
    RAISE EXCEPTION 'Enter a response between 2 and 5000 characters';
  END IF;
  IF p_status NOT IN ('open', 'in_progress', 'resolved', 'closed') THEN
    RAISE EXCEPTION 'Choose a valid support status';
  END IF;

  UPDATE public.student_support_tickets
     SET admin_response = btrim(p_admin_response),
         status = p_status,
         responded_by = auth.uid(),
         responded_at = now(),
         updated_at = now()
   WHERE id = p_ticket_id
     AND category <> 'payment'
   RETURNING user_id INTO v_student_id;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Support case not found or is handled in the separate payment workspace';
  END IF;

  INSERT INTO public.student_admin_audit(student_id, admin_id, action, details)
  VALUES (
    v_student_id,
    auth.uid(),
    'admin_support_case_updated',
    jsonb_build_object('ticket_id', p_ticket_id, 'status', p_status)
  );

  RETURN true;
END;
$function$;

COMMENT ON FUNCTION public.admin_lookup_student_support_contact(text) IS
'Exact email or phone lookup for the DCDS administrator support workspace. Returns minimal identity/contact-verification fields only; never returns financial records.';
COMMENT ON FUNCTION public.admin_get_student_support_workspace(uuid) IS
'Returns one student account''s support tickets excluding payment tickets and internal administrator notes; never returns orders, payments, balances, or payout data.';
COMMENT ON FUNCTION public.admin_create_student_support_ticket(uuid,text,text,text) IS
'Creates a non-payment student support case on behalf of a student, with an administrator audit event.';
COMMENT ON FUNCTION public.admin_update_student_support_ticket(uuid,text,text) IS
'Updates a non-payment student support response and status, with an administrator audit event.';

REVOKE ALL ON FUNCTION public.admin_lookup_student_support_contact(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_get_student_support_workspace(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_create_student_support_ticket(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_update_student_support_ticket(uuid,text,text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_lookup_student_support_contact(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_student_support_workspace(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_student_support_ticket(uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_student_support_ticket(uuid,text,text) TO authenticated;
