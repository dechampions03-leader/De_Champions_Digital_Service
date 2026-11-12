-- DCDS safe pending checkout reconciliation.
-- Legacy checkouts have no recorded Flutterwave link expiry and are never auto-released.
-- New checkouts carry an explicit provider session/link expiry and can be safely reopened
-- only after the provider check and the recorded expiry (or administrator-confirmed link disable).

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS checkout_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS orders_pending_checkout_expiry_idx
  ON public.orders (user_id, course_id, checkout_expires_at)
  WHERE status = 'pending';

ALTER TABLE public.dcds_payment_review_events
  DROP CONSTRAINT IF EXISTS dcds_payment_review_events_event_type_check;

ALTER TABLE public.dcds_payment_review_events
  ADD CONSTRAINT dcds_payment_review_events_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'manual_order_created',
    'receipt_submitted',
    'receipt_rejected',
    'manual_payment_approved',
    'flutterwave_payment_verified',
    'checkout_session_expired',
    'flutterwave_reconciliation_checked',
    'pending_checkout_released'
  ]::text[]));

-- A retry can expire an old DCDS checkout only when DCDS recorded its provider
-- expiry and there is no successful/pending payment or purchase enrollment.
-- A legacy pending order with checkout_expires_at IS NULL continues to block
-- checkout until it is reconciled by an administrator.
DROP FUNCTION IF EXISTS public.dcds_create_checkout_order(uuid,uuid,text,text);

CREATE FUNCTION public.dcds_create_checkout_order(
  p_user_id uuid,
  p_course_id uuid,
  p_tx_ref text,
  p_currency text DEFAULT 'NGN',
  p_checkout_expires_at timestamptz DEFAULT (now() + interval '60 minutes')
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user auth.users%rowtype;
  v_course public.courses%rowtype;
  v_existing_enrolment uuid;
  v_pending_order uuid;
  v_order public.orders%rowtype;
  v_expired_order record;
  v_currency text := upper(coalesce(nullif(trim(p_currency), ''), 'NGN'));
  v_amount numeric(14,2);
  v_checkout_expires_at timestamptz := coalesce(p_checkout_expires_at, now() + interval '60 minutes');
BEGIN
  IF p_user_id IS NULL OR p_course_id IS NULL OR p_tx_ref IS NULL
     OR length(trim(p_tx_ref)) < 12 OR length(p_tx_ref) > 120
     OR v_currency !~ '^[A-Z]{3}
  END IF;

  SELECT * INTO v_user FROM auth.users WHERE id = p_user_id FOR SHARE;
  IF NOT FOUND OR v_user.email IS NULL THEN
    RAISE EXCEPTION 'Your account has no email address.' USING errcode = 'P0001';
  END IF;
  IF v_user.email_confirmed_at IS NULL AND v_user.phone_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Please verify your email address or mobile number before making a payment.' USING errcode = 'P0001';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':' || p_course_id::text, 0)
  );

  -- Expire only DCDS-managed sessions whose recorded provider expiry has passed.
  -- Payments still pending/successful and enrolments tied to an order prevent expiry.
  FOR v_expired_order IN
    UPDATE public.orders o
    SET status = 'failed', updated_at = now()
    WHERE o.user_id = p_user_id
      AND o.course_id = p_course_id
      AND o.status = 'pending'
      AND o.checkout_expires_at IS NOT NULL
      AND o.checkout_expires_at <= now()
      AND NOT EXISTS (
        SELECT 1 FROM public.payments p
        WHERE p.order_id = o.id AND p.status IN ('pending','successful')
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.enrollments e WHERE e.order_id = o.id
      )
    RETURNING o.id, o.tx_ref, o.amount, o.currency, o.checkout_expires_at
  LOOP
    INSERT INTO public.dcds_payment_review_events(
      order_id, actor_user_id, event_type, details
    ) VALUES (
      v_expired_order.id,
      p_user_id,
      'checkout_session_expired',
      pg_catalog.jsonb_build_object(
        'reason', 'recorded_flutterwave_checkout_expiry_elapsed',
        'tx_ref', v_expired_order.tx_ref,
        'amount', v_expired_order.amount,
        'currency', v_expired_order.currency,
        'checkout_expires_at', v_expired_order.checkout_expires_at,
        'trigger', 'student_checkout_retry'
      )
    );
  END LOOP;

  SELECT id INTO v_existing_enrolment
  FROM public.enrollments
  WHERE user_id = p_user_id AND course_id = p_course_id
  LIMIT 1;
  IF v_existing_enrolment IS NOT NULL THEN
    RAISE EXCEPTION 'You are already enrolled in this course.' USING errcode = 'P0001';
  END IF;

  SELECT id INTO v_pending_order
  FROM public.orders
  WHERE user_id = p_user_id AND course_id = p_course_id AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_pending_order IS NOT NULL THEN
    RAISE EXCEPTION 'A checkout is already pending for this course. Contact support to verify its status before trying again.' USING errcode = 'P0001';
  END IF;

  SELECT * INTO v_course FROM public.courses WHERE id = p_course_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Course not found.' USING errcode = 'P0001'; END IF;

  IF v_currency = coalesce(v_course.currency, 'NGN') THEN
    v_amount := v_course.price;
  ELSE
    SELECT rp.amount INTO v_amount
    FROM public.course_regional_prices rp
    WHERE rp.course_id = p_course_id
      AND rp.currency = v_currency
      AND rp.is_active = true;
    IF v_amount IS NULL THEN
      RAISE EXCEPTION 'This currency is not yet enabled for this course. Please select NGN or contact DCDS support.' USING errcode = 'P0001';
    END IF;
  END IF;

  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'Course price is invalid.' USING errcode = '22023';
  END IF;

  INSERT INTO public.orders (user_id, course_id, amount, currency, status, tx_ref, checkout_expires_at)
  VALUES (p_user_id, p_course_id, v_amount, v_currency, 'pending', p_tx_ref, v_checkout_expires_at)
  RETURNING * INTO v_order;

  RETURN pg_catalog.jsonb_build_object(
    'id', v_order.id,
    'tx_ref', v_order.tx_ref,
    'amount', v_order.amount,
    'currency', v_order.currency,
    'course_title', v_course.title
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.dcds_create_checkout_order(uuid,uuid,text,text,timestamptz)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dcds_create_checkout_order(uuid,uuid,text,text,timestamptz)
  TO service_role;

-- Release requires a recent provider-reference check, no payment record that
-- could represent money received, and either an elapsed recorded expiry or an
-- explicit administrator attestation that the old hosted link was disabled.
CREATE OR REPLACE FUNCTION public.admin_release_pending_flutterwave_checkout(
  p_order_id uuid,
  p_admin_user_id uuid,
  p_admin_confirmation_note text,
  p_confirm_link_disabled boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_order public.orders%rowtype;
  v_check public.dcds_payment_review_events%rowtype;
  v_link_expired boolean;
BEGIN
  IF p_order_id IS NULL OR p_admin_user_id IS NULL
     OR p_admin_confirmation_note IS NULL
     OR pg_catalog.length(pg_catalog.btrim(p_admin_confirmation_note)) < 20 THEN
    RAISE EXCEPTION 'An order, administrator, and a detailed reconciliation note are required.'
      USING errcode = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.dcds_admins a WHERE a.user_id = p_admin_user_id
  ) THEN
    RAISE EXCEPTION 'Administrator access required.' USING errcode = '42501';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.' USING errcode = 'P0001';
  END IF;
  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending orders can be released.' USING errcode = 'P0001';
  END IF;
  IF coalesce(v_order.tx_ref, '') LIKE 'DCDS-MANUAL-%' THEN
    RAISE EXCEPTION 'Manual bank-transfer orders use the receipt review workflow.' USING errcode = 'P0001';
  END IF;

  SELECT * INTO v_check
  FROM public.dcds_payment_review_events e
  WHERE e.order_id = p_order_id
    AND e.event_type = 'flutterwave_reconciliation_checked'
    AND e.details ->> 'outcome' IN ('not_found','failed')
    AND e.created_at >= now() - interval '2 hours'
  ORDER BY e.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Run a fresh Flutterwave reference check first. Only a confirmed not-found or failed result can proceed.'
      USING errcode = 'P0001';
  END IF;

  v_link_expired := v_order.checkout_expires_at IS NOT NULL
    AND v_order.checkout_expires_at <= now();

  IF NOT v_link_expired AND p_confirm_link_disabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'This legacy or active checkout has no confirmed expiry. Disable the hosted payment link in Flutterwave before releasing it.'
      USING errcode = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payments p
    WHERE p.order_id = p_order_id AND p.status <> 'failed'
  ) THEN
    RAISE EXCEPTION 'A payment record still exists for this order. Reconcile it before release.'
      USING errcode = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.enrollments e WHERE e.order_id = p_order_id
  ) THEN
    RAISE EXCEPTION 'This order already has a linked course enrolment and cannot be released.'
      USING errcode = 'P0001';
  END IF;

  UPDATE public.orders
  SET status = 'failed', updated_at = now()
  WHERE id = p_order_id AND status = 'pending';

  INSERT INTO public.dcds_payment_review_events(
    order_id, actor_user_id, event_type, details
  ) VALUES (
    p_order_id,
    p_admin_user_id,
    'pending_checkout_released',
    pg_catalog.jsonb_build_object(
      'reason', 'provider_checked_unpaid_and_checkout_closed',
      'provider_outcome', v_check.details ->> 'outcome',
      'provider_status', v_check.details ->> 'provider_status',
      'provider_transaction_id', v_check.details ->> 'transaction_id',
      'provider_reference', v_check.details ->> 'provider_reference',
      'provider_checked_at', v_check.created_at,
      'checkout_expires_at', v_order.checkout_expires_at,
      'checkout_expired', v_link_expired,
      'administrator_confirmed_link_disabled', coalesce(p_confirm_link_disabled, false),
      'administrator_confirmation_note', pg_catalog.btrim(p_admin_confirmation_note)
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'status', 'failed',
    'message', 'The unpaid checkout was released and the audit record was saved.'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_release_pending_flutterwave_checkout(uuid,uuid,text,boolean)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_release_pending_flutterwave_checkout(uuid,uuid,text,boolean)
  TO service_role;

-- Keep the admin payment queue API compatible while exposing the recorded
-- hosted-checkout expiry alongside each order.
DROP FUNCTION IF EXISTS public.admin_list_payment_orders(text,text,text,integer);

CREATE FUNCTION public.admin_list_payment_orders(
  p_status text DEFAULT 'pending',
  p_search text DEFAULT NULL,
  p_currency text DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  order_id uuid,
  user_id uuid,
  student_email text,
  student_name text,
  course_id uuid,
  course_title text,
  amount numeric,
  currency text,
  order_status text,
  tx_ref text,
  order_created_at timestamptz,
  checkout_expires_at timestamptz,
  order_source text,
  review_id uuid,
  review_status text,
  receipt_path text,
  bank_reference text,
  payment_channel text,
  payer_name text,
  claimed_amount numeric,
  claimed_currency text,
  admin_note text,
  reviewed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT coalesce(public.is_dcds_admin(), false) THEN
    RAISE EXCEPTION 'Administrator access required' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.user_id,
    coalesce(u.email::text, ''),
    coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
      'DCDS Student'
    ),
    o.course_id,
    c.title,
    o.amount,
    o.currency,
    o.status,
    coalesce(o.tx_ref, ''),
    o.created_at,
    o.checkout_expires_at,
    CASE WHEN o.tx_ref LIKE 'DCDS-MANUAL-%' THEN 'manual_bank_transfer' ELSE 'flutterwave_checkout' END,
    r.id,
    r.review_status,
    r.receipt_path,
    r.bank_reference,
    r.payment_channel,
    r.payer_name,
    r.claimed_amount,
    r.claimed_currency,
    r.admin_note,
    r.reviewed_at
  FROM public.orders o
  JOIN auth.users u ON u.id = o.user_id
  JOIN public.courses c ON c.id = o.course_id
  LEFT JOIN public.dcds_payment_receipt_reviews r ON r.order_id = o.id
  WHERE
    (
      coalesce(p_status, 'pending') = 'all'
      OR (p_status = 'receipt_submitted' AND r.review_status = 'submitted')
      OR (p_status = 'pending' AND o.status = 'pending')
      OR (p_status = 'successful' AND o.status = 'successful')
      OR (p_status = 'failed' AND o.status IN ('failed','cancelled'))
    )
    AND (p_currency IS NULL OR upper(o.currency) = upper(p_currency))
    AND (
      p_search IS NULL OR btrim(p_search) = ''
      OR lower(
        coalesce(u.email,'') || ' ' ||
        coalesce(u.raw_user_meta_data ->> 'full_name','') || ' ' ||
        coalesce(c.title,'') || ' ' ||
        coalesce(o.tx_ref,'') || ' ' ||
        coalesce(r.bank_reference,'')
      ) LIKE '%' || lower(btrim(p_search)) || '%'
    )
  ORDER BY o.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit,100),200));
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_payment_orders(text,text,text,integer)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_payment_orders(text,text,text,integer)
  TO authenticated;

     OR v_checkout_expires_at <= now()
     OR v_checkout_expires_at > now() + interval '61 minutes' THEN
    RAISE EXCEPTION 'Invalid checkout request.' USING errcode = '22023';
  END IF;

  SELECT * INTO v_user FROM auth.users WHERE id = p_user_id FOR SHARE;
  IF NOT FOUND OR v_user.email IS NULL THEN
    RAISE EXCEPTION 'Your account has no email address.' USING errcode = 'P0001';
  END IF;
  IF v_user.email_confirmed_at IS NULL AND v_user.phone_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Please verify your email address or mobile number before making a payment.' USING errcode = 'P0001';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':' || p_course_id::text, 0)
  );

  -- Expire only DCDS-managed sessions whose recorded provider expiry has passed.
  -- Payments still pending/successful and enrolments tied to an order prevent expiry.
  FOR v_expired_order IN
    UPDATE public.orders o
    SET status = 'failed', updated_at = now()
    WHERE o.user_id = p_user_id
      AND o.course_id = p_course_id
      AND o.status = 'pending'
      AND o.checkout_expires_at IS NOT NULL
      AND o.checkout_expires_at <= now()
      AND NOT EXISTS (
        SELECT 1 FROM public.payments p
        WHERE p.order_id = o.id AND p.status IN ('pending','successful')
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.enrollments e WHERE e.order_id = o.id
      )
    RETURNING o.id, o.tx_ref, o.amount, o.currency, o.checkout_expires_at
  LOOP
    INSERT INTO public.dcds_payment_review_events(
      order_id, actor_user_id, event_type, details
    ) VALUES (
      v_expired_order.id,
      p_user_id,
      'checkout_session_expired',
      pg_catalog.jsonb_build_object(
        'reason', 'recorded_flutterwave_checkout_expiry_elapsed',
        'tx_ref', v_expired_order.tx_ref,
        'amount', v_expired_order.amount,
        'currency', v_expired_order.currency,
        'checkout_expires_at', v_expired_order.checkout_expires_at,
        'trigger', 'student_checkout_retry'
      )
    );
  END LOOP;

  SELECT id INTO v_existing_enrolment
  FROM public.enrollments
  WHERE user_id = p_user_id AND course_id = p_course_id
  LIMIT 1;
  IF v_existing_enrolment IS NOT NULL THEN
    RAISE EXCEPTION 'You are already enrolled in this course.' USING errcode = 'P0001';
  END IF;

  SELECT id INTO v_pending_order
  FROM public.orders
  WHERE user_id = p_user_id AND course_id = p_course_id AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_pending_order IS NOT NULL THEN
    RAISE EXCEPTION 'A checkout is already pending for this course. Contact support to verify its status before trying again.' USING errcode = 'P0001';
  END IF;

  SELECT * INTO v_course FROM public.courses WHERE id = p_course_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Course not found.' USING errcode = 'P0001'; END IF;

  IF v_currency = coalesce(v_course.currency, 'NGN') THEN
    v_amount := v_course.price;
  ELSE
    SELECT rp.amount INTO v_amount
    FROM public.course_regional_prices rp
    WHERE rp.course_id = p_course_id
      AND rp.currency = v_currency
      AND rp.is_active = true;
    IF v_amount IS NULL THEN
      RAISE EXCEPTION 'This currency is not yet enabled for this course. Please select NGN or contact DCDS support.' USING errcode = 'P0001';
    END IF;
  END IF;

  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'Course price is invalid.' USING errcode = '22023';
  END IF;

  INSERT INTO public.orders (user_id, course_id, amount, currency, status, tx_ref)
  VALUES (p_user_id, p_course_id, v_amount, v_currency, 'pending', p_tx_ref)
  RETURNING * INTO v_order;

  RETURN pg_catalog.jsonb_build_object(
    'id', v_order.id,
    'tx_ref', v_order.tx_ref,
    'amount', v_order.amount,
    'currency', v_order.currency,
    'course_title', v_course.title
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.dcds_create_checkout_order(uuid,uuid,text,text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dcds_create_checkout_order(uuid,uuid,text,text)
  TO service_role;

-- Release requires a recent provider-reference check, no payment record that
-- could represent money received, and either an elapsed recorded expiry or an
-- explicit administrator attestation that the old hosted link was disabled.
CREATE OR REPLACE FUNCTION public.admin_release_pending_flutterwave_checkout(
  p_order_id uuid,
  p_admin_user_id uuid,
  p_admin_confirmation_note text,
  p_confirm_link_disabled boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_order public.orders%rowtype;
  v_check public.dcds_payment_review_events%rowtype;
  v_link_expired boolean;
BEGIN
  IF p_order_id IS NULL OR p_admin_user_id IS NULL
     OR p_admin_confirmation_note IS NULL
     OR pg_catalog.length(pg_catalog.btrim(p_admin_confirmation_note)) < 20 THEN
    RAISE EXCEPTION 'An order, administrator, and a detailed reconciliation note are required.'
      USING errcode = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.dcds_admins a WHERE a.user_id = p_admin_user_id
  ) THEN
    RAISE EXCEPTION 'Administrator access required.' USING errcode = '42501';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.' USING errcode = 'P0001';
  END IF;
  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending orders can be released.' USING errcode = 'P0001';
  END IF;
  IF coalesce(v_order.tx_ref, '') LIKE 'DCDS-MANUAL-%' THEN
    RAISE EXCEPTION 'Manual bank-transfer orders use the receipt review workflow.' USING errcode = 'P0001';
  END IF;

  SELECT * INTO v_check
  FROM public.dcds_payment_review_events e
  WHERE e.order_id = p_order_id
    AND e.event_type = 'flutterwave_reconciliation_checked'
    AND e.details ->> 'outcome' IN ('not_found','failed')
    AND e.created_at >= now() - interval '2 hours'
  ORDER BY e.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Run a fresh Flutterwave reference check first. Only a confirmed not-found or failed result can proceed.'
      USING errcode = 'P0001';
  END IF;

  v_link_expired := v_order.checkout_expires_at IS NOT NULL
    AND v_order.checkout_expires_at <= now();

  IF NOT v_link_expired AND p_confirm_link_disabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'This legacy or active checkout has no confirmed expiry. Disable the hosted payment link in Flutterwave before releasing it.'
      USING errcode = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payments p
    WHERE p.order_id = p_order_id AND p.status <> 'failed'
  ) THEN
    RAISE EXCEPTION 'A payment record still exists for this order. Reconcile it before release.'
      USING errcode = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.enrollments e WHERE e.order_id = p_order_id
  ) THEN
    RAISE EXCEPTION 'This order already has a linked course enrolment and cannot be released.'
      USING errcode = 'P0001';
  END IF;

  UPDATE public.orders
  SET status = 'failed', updated_at = now()
  WHERE id = p_order_id AND status = 'pending';

  INSERT INTO public.dcds_payment_review_events(
    order_id, actor_user_id, event_type, details
  ) VALUES (
    p_order_id,
    p_admin_user_id,
    'pending_checkout_released',
    pg_catalog.jsonb_build_object(
      'reason', 'provider_checked_unpaid_and_checkout_closed',
      'provider_outcome', v_check.details ->> 'outcome',
      'provider_status', v_check.details ->> 'provider_status',
      'provider_transaction_id', v_check.details ->> 'transaction_id',
      'provider_reference', v_check.details ->> 'provider_reference',
      'provider_checked_at', v_check.created_at,
      'checkout_expires_at', v_order.checkout_expires_at,
      'checkout_expired', v_link_expired,
      'administrator_confirmed_link_disabled', coalesce(p_confirm_link_disabled, false),
      'administrator_confirmation_note', pg_catalog.btrim(p_admin_confirmation_note)
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'status', 'failed',
    'message', 'The unpaid checkout was released and the audit record was saved.'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_release_pending_flutterwave_checkout(uuid,uuid,text,boolean)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_release_pending_flutterwave_checkout(uuid,uuid,text,boolean)
  TO service_role;

-- Keep the admin payment queue API compatible while exposing the recorded
-- hosted-checkout expiry alongside each order.
DROP FUNCTION IF EXISTS public.admin_list_payment_orders(text,text,text,integer);

CREATE FUNCTION public.admin_list_payment_orders(
  p_status text DEFAULT 'pending',
  p_search text DEFAULT NULL,
  p_currency text DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  order_id uuid,
  user_id uuid,
  student_email text,
  student_name text,
  course_id uuid,
  course_title text,
  amount numeric,
  currency text,
  order_status text,
  tx_ref text,
  order_created_at timestamptz,
  checkout_expires_at timestamptz,
  order_source text,
  review_id uuid,
  review_status text,
  receipt_path text,
  bank_reference text,
  payment_channel text,
  payer_name text,
  claimed_amount numeric,
  claimed_currency text,
  admin_note text,
  reviewed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT coalesce(public.is_dcds_admin(), false) THEN
    RAISE EXCEPTION 'Administrator access required' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.user_id,
    coalesce(u.email::text, ''),
    coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
      'DCDS Student'
    ),
    o.course_id,
    c.title,
    o.amount,
    o.currency,
    o.status,
    coalesce(o.tx_ref, ''),
    o.created_at,
    o.checkout_expires_at,
    CASE WHEN o.tx_ref LIKE 'DCDS-MANUAL-%' THEN 'manual_bank_transfer' ELSE 'flutterwave_checkout' END,
    r.id,
    r.review_status,
    r.receipt_path,
    r.bank_reference,
    r.payment_channel,
    r.payer_name,
    r.claimed_amount,
    r.claimed_currency,
    r.admin_note,
    r.reviewed_at
  FROM public.orders o
  JOIN auth.users u ON u.id = o.user_id
  JOIN public.courses c ON c.id = o.course_id
  LEFT JOIN public.dcds_payment_receipt_reviews r ON r.order_id = o.id
  WHERE
    (
      coalesce(p_status, 'pending') = 'all'
      OR (p_status = 'receipt_submitted' AND r.review_status = 'submitted')
      OR (p_status = 'pending' AND o.status = 'pending')
      OR (p_status = 'successful' AND o.status = 'successful')
      OR (p_status = 'failed' AND o.status IN ('failed','cancelled'))
    )
    AND (p_currency IS NULL OR upper(o.currency) = upper(p_currency))
    AND (
      p_search IS NULL OR btrim(p_search) = ''
      OR lower(
        coalesce(u.email,'') || ' ' ||
        coalesce(u.raw_user_meta_data ->> 'full_name','') || ' ' ||
        coalesce(c.title,'') || ' ' ||
        coalesce(o.tx_ref,'') || ' ' ||
        coalesce(r.bank_reference,'')
      ) LIKE '%' || lower(btrim(p_search)) || '%'
    )
  ORDER BY o.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit,100),200));
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_payment_orders(text,text,text,integer)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_payment_orders(text,text,text,integer)
  TO authenticated;

     OR v_checkout_expires_at <= now()
     OR v_checkout_expires_at > now() + interval '61 minutes' THEN
    RAISE EXCEPTION 'Invalid checkout request.' USING errcode = '22023';
  END IF;

  SELECT * INTO v_user FROM auth.users WHERE id = p_user_id FOR SHARE;
  IF NOT FOUND OR v_user.email IS NULL THEN
    RAISE EXCEPTION 'Your account has no email address.' USING errcode = 'P0001';
  END IF;
  IF v_user.email_confirmed_at IS NULL AND v_user.phone_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Please verify your email address or mobile number before making a payment.' USING errcode = 'P0001';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':' || p_course_id::text, 0)
  );

  -- Expire only DCDS-managed sessions whose recorded provider expiry has passed.
  -- Payments still pending/successful and enrolments tied to an order prevent expiry.
  FOR v_expired_order IN
    UPDATE public.orders o
    SET status = 'failed', updated_at = now()
    WHERE o.user_id = p_user_id
      AND o.course_id = p_course_id
      AND o.status = 'pending'
      AND o.checkout_expires_at IS NOT NULL
      AND o.checkout_expires_at <= now()
      AND NOT EXISTS (
        SELECT 1 FROM public.payments p
        WHERE p.order_id = o.id AND p.status IN ('pending','successful')
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.enrollments e WHERE e.order_id = o.id
      )
    RETURNING o.id, o.tx_ref, o.amount, o.currency, o.checkout_expires_at
  LOOP
    INSERT INTO public.dcds_payment_review_events(
      order_id, actor_user_id, event_type, details
    ) VALUES (
      v_expired_order.id,
      p_user_id,
      'checkout_session_expired',
      pg_catalog.jsonb_build_object(
        'reason', 'recorded_flutterwave_checkout_expiry_elapsed',
        'tx_ref', v_expired_order.tx_ref,
        'amount', v_expired_order.amount,
        'currency', v_expired_order.currency,
        'checkout_expires_at', v_expired_order.checkout_expires_at,
        'trigger', 'student_checkout_retry'
      )
    );
  END LOOP;

  SELECT id INTO v_existing_enrolment
  FROM public.enrollments
  WHERE user_id = p_user_id AND course_id = p_course_id
  LIMIT 1;
  IF v_existing_enrolment IS NOT NULL THEN
    RAISE EXCEPTION 'You are already enrolled in this course.' USING errcode = 'P0001';
  END IF;

  SELECT id INTO v_pending_order
  FROM public.orders
  WHERE user_id = p_user_id AND course_id = p_course_id AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_pending_order IS NOT NULL THEN
    RAISE EXCEPTION 'A checkout is already pending for this course. Contact support to verify its status before trying again.' USING errcode = 'P0001';
  END IF;

  SELECT * INTO v_course FROM public.courses WHERE id = p_course_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Course not found.' USING errcode = 'P0001'; END IF;

  IF v_currency = coalesce(v_course.currency, 'NGN') THEN
    v_amount := v_course.price;
  ELSE
    SELECT rp.amount INTO v_amount
    FROM public.course_regional_prices rp
    WHERE rp.course_id = p_course_id
      AND rp.currency = v_currency
      AND rp.is_active = true;
    IF v_amount IS NULL THEN
      RAISE EXCEPTION 'This currency is not yet enabled for this course. Please select NGN or contact DCDS support.' USING errcode = 'P0001';
    END IF;
  END IF;

  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'Course price is invalid.' USING errcode = '22023';
  END IF;

  INSERT INTO public.orders (user_id, course_id, amount, currency, status, tx_ref, checkout_expires_at)
  VALUES (p_user_id, p_course_id, v_amount, v_currency, 'pending', p_tx_ref, v_checkout_expires_at)
  RETURNING * INTO v_order;

  RETURN pg_catalog.jsonb_build_object(
    'id', v_order.id,
    'tx_ref', v_order.tx_ref,
    'amount', v_order.amount,
    'currency', v_order.currency,
    'course_title', v_course.title
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.dcds_create_checkout_order(uuid,uuid,text,text,timestamptz)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dcds_create_checkout_order(uuid,uuid,text,text,timestamptz)
  TO service_role;

-- Release requires a recent provider-reference check, no payment record that
-- could represent money received, and either an elapsed recorded expiry or an
-- explicit administrator attestation that the old hosted link was disabled.
CREATE OR REPLACE FUNCTION public.admin_release_pending_flutterwave_checkout(
  p_order_id uuid,
  p_admin_user_id uuid,
  p_admin_confirmation_note text,
  p_confirm_link_disabled boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_order public.orders%rowtype;
  v_check public.dcds_payment_review_events%rowtype;
  v_link_expired boolean;
BEGIN
  IF p_order_id IS NULL OR p_admin_user_id IS NULL
     OR p_admin_confirmation_note IS NULL
     OR pg_catalog.length(pg_catalog.btrim(p_admin_confirmation_note)) < 20 THEN
    RAISE EXCEPTION 'An order, administrator, and a detailed reconciliation note are required.'
      USING errcode = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.dcds_admins a WHERE a.user_id = p_admin_user_id
  ) THEN
    RAISE EXCEPTION 'Administrator access required.' USING errcode = '42501';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.' USING errcode = 'P0001';
  END IF;
  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending orders can be released.' USING errcode = 'P0001';
  END IF;
  IF coalesce(v_order.tx_ref, '') LIKE 'DCDS-MANUAL-%' THEN
    RAISE EXCEPTION 'Manual bank-transfer orders use the receipt review workflow.' USING errcode = 'P0001';
  END IF;

  SELECT * INTO v_check
  FROM public.dcds_payment_review_events e
  WHERE e.order_id = p_order_id
    AND e.event_type = 'flutterwave_reconciliation_checked'
    AND e.details ->> 'outcome' IN ('not_found','failed')
    AND e.created_at >= now() - interval '2 hours'
  ORDER BY e.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Run a fresh Flutterwave reference check first. Only a confirmed not-found or failed result can proceed.'
      USING errcode = 'P0001';
  END IF;

  v_link_expired := v_order.checkout_expires_at IS NOT NULL
    AND v_order.checkout_expires_at <= now();

  IF NOT v_link_expired AND p_confirm_link_disabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'This legacy or active checkout has no confirmed expiry. Disable the hosted payment link in Flutterwave before releasing it.'
      USING errcode = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payments p
    WHERE p.order_id = p_order_id AND p.status <> 'failed'
  ) THEN
    RAISE EXCEPTION 'A payment record still exists for this order. Reconcile it before release.'
      USING errcode = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.enrollments e WHERE e.order_id = p_order_id
  ) THEN
    RAISE EXCEPTION 'This order already has a linked course enrolment and cannot be released.'
      USING errcode = 'P0001';
  END IF;

  UPDATE public.orders
  SET status = 'failed', updated_at = now()
  WHERE id = p_order_id AND status = 'pending';

  INSERT INTO public.dcds_payment_review_events(
    order_id, actor_user_id, event_type, details
  ) VALUES (
    p_order_id,
    p_admin_user_id,
    'pending_checkout_released',
    pg_catalog.jsonb_build_object(
      'reason', 'provider_checked_unpaid_and_checkout_closed',
      'provider_outcome', v_check.details ->> 'outcome',
      'provider_status', v_check.details ->> 'provider_status',
      'provider_transaction_id', v_check.details ->> 'transaction_id',
      'provider_reference', v_check.details ->> 'provider_reference',
      'provider_checked_at', v_check.created_at,
      'checkout_expires_at', v_order.checkout_expires_at,
      'checkout_expired', v_link_expired,
      'administrator_confirmed_link_disabled', coalesce(p_confirm_link_disabled, false),
      'administrator_confirmation_note', pg_catalog.btrim(p_admin_confirmation_note)
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'status', 'failed',
    'message', 'The unpaid checkout was released and the audit record was saved.'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_release_pending_flutterwave_checkout(uuid,uuid,text,boolean)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_release_pending_flutterwave_checkout(uuid,uuid,text,boolean)
  TO service_role;

-- Keep the admin payment queue API compatible while exposing the recorded
-- hosted-checkout expiry alongside each order.
DROP FUNCTION IF EXISTS public.admin_list_payment_orders(text,text,text,integer);

CREATE FUNCTION public.admin_list_payment_orders(
  p_status text DEFAULT 'pending',
  p_search text DEFAULT NULL,
  p_currency text DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  order_id uuid,
  user_id uuid,
  student_email text,
  student_name text,
  course_id uuid,
  course_title text,
  amount numeric,
  currency text,
  order_status text,
  tx_ref text,
  order_created_at timestamptz,
  checkout_expires_at timestamptz,
  order_source text,
  review_id uuid,
  review_status text,
  receipt_path text,
  bank_reference text,
  payment_channel text,
  payer_name text,
  claimed_amount numeric,
  claimed_currency text,
  admin_note text,
  reviewed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT coalesce(public.is_dcds_admin(), false) THEN
    RAISE EXCEPTION 'Administrator access required' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.user_id,
    coalesce(u.email::text, ''),
    coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
      'DCDS Student'
    ),
    o.course_id,
    c.title,
    o.amount,
    o.currency,
    o.status,
    coalesce(o.tx_ref, ''),
    o.created_at,
    o.checkout_expires_at,
    CASE WHEN o.tx_ref LIKE 'DCDS-MANUAL-%' THEN 'manual_bank_transfer' ELSE 'flutterwave_checkout' END,
    r.id,
    r.review_status,
    r.receipt_path,
    r.bank_reference,
    r.payment_channel,
    r.payer_name,
    r.claimed_amount,
    r.claimed_currency,
    r.admin_note,
    r.reviewed_at
  FROM public.orders o
  JOIN auth.users u ON u.id = o.user_id
  JOIN public.courses c ON c.id = o.course_id
  LEFT JOIN public.dcds_payment_receipt_reviews r ON r.order_id = o.id
  WHERE
    (
      coalesce(p_status, 'pending') = 'all'
      OR (p_status = 'receipt_submitted' AND r.review_status = 'submitted')
      OR (p_status = 'pending' AND o.status = 'pending')
      OR (p_status = 'successful' AND o.status = 'successful')
      OR (p_status = 'failed' AND o.status IN ('failed','cancelled'))
    )
    AND (p_currency IS NULL OR upper(o.currency) = upper(p_currency))
    AND (
      p_search IS NULL OR btrim(p_search) = ''
      OR lower(
        coalesce(u.email,'') || ' ' ||
        coalesce(u.raw_user_meta_data ->> 'full_name','') || ' ' ||
        coalesce(c.title,'') || ' ' ||
        coalesce(o.tx_ref,'') || ' ' ||
        coalesce(r.bank_reference,'')
      ) LIKE '%' || lower(btrim(p_search)) || '%'
    )
  ORDER BY o.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit,100),200));
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_payment_orders(text,text,text,integer)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_payment_orders(text,text,text,integer)
  TO authenticated;

     OR v_checkout_expires_at <= now()
     OR v_checkout_expires_at > now() + interval '61 minutes' THEN
    RAISE EXCEPTION 'Invalid checkout request.' USING errcode = '22023';
  END IF;

  SELECT * INTO v_user FROM auth.users WHERE id = p_user_id FOR SHARE;
  IF NOT FOUND OR v_user.email IS NULL THEN
    RAISE EXCEPTION 'Your account has no email address.' USING errcode = 'P0001';
  END IF;
  IF v_user.email_confirmed_at IS NULL AND v_user.phone_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Please verify your email address or mobile number before making a payment.' USING errcode = 'P0001';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':' || p_course_id::text, 0)
  );

  -- Expire only DCDS-managed sessions whose recorded provider expiry has passed.
  -- Payments still pending/successful and enrolments tied to an order prevent expiry.
  FOR v_expired_order IN
    UPDATE public.orders o
    SET status = 'failed', updated_at = now()
    WHERE o.user_id = p_user_id
      AND o.course_id = p_course_id
      AND o.status = 'pending'
      AND o.checkout_expires_at IS NOT NULL
      AND o.checkout_expires_at <= now()
      AND NOT EXISTS (
        SELECT 1 FROM public.payments p
        WHERE p.order_id = o.id AND p.status IN ('pending','successful')
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.enrollments e WHERE e.order_id = o.id
      )
    RETURNING o.id, o.tx_ref, o.amount, o.currency, o.checkout_expires_at
  LOOP
    INSERT INTO public.dcds_payment_review_events(
      order_id, actor_user_id, event_type, details
    ) VALUES (
      v_expired_order.id,
      p_user_id,
      'checkout_session_expired',
      pg_catalog.jsonb_build_object(
        'reason', 'recorded_flutterwave_checkout_expiry_elapsed',
        'tx_ref', v_expired_order.tx_ref,
        'amount', v_expired_order.amount,
        'currency', v_expired_order.currency,
        'checkout_expires_at', v_expired_order.checkout_expires_at,
        'trigger', 'student_checkout_retry'
      )
    );
  END LOOP;

  SELECT id INTO v_existing_enrolment
  FROM public.enrollments
  WHERE user_id = p_user_id AND course_id = p_course_id
  LIMIT 1;
  IF v_existing_enrolment IS NOT NULL THEN
    RAISE EXCEPTION 'You are already enrolled in this course.' USING errcode = 'P0001';
  END IF;

  SELECT id INTO v_pending_order
  FROM public.orders
  WHERE user_id = p_user_id AND course_id = p_course_id AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_pending_order IS NOT NULL THEN
    RAISE EXCEPTION 'A checkout is already pending for this course. Contact support to verify its status before trying again.' USING errcode = 'P0001';
  END IF;

  SELECT * INTO v_course FROM public.courses WHERE id = p_course_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Course not found.' USING errcode = 'P0001'; END IF;

  IF v_currency = coalesce(v_course.currency, 'NGN') THEN
    v_amount := v_course.price;
  ELSE
    SELECT rp.amount INTO v_amount
    FROM public.course_regional_prices rp
    WHERE rp.course_id = p_course_id
      AND rp.currency = v_currency
      AND rp.is_active = true;
    IF v_amount IS NULL THEN
      RAISE EXCEPTION 'This currency is not yet enabled for this course. Please select NGN or contact DCDS support.' USING errcode = 'P0001';
    END IF;
  END IF;

  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'Course price is invalid.' USING errcode = '22023';
  END IF;

  INSERT INTO public.orders (user_id, course_id, amount, currency, status, tx_ref)
  VALUES (p_user_id, p_course_id, v_amount, v_currency, 'pending', p_tx_ref)
  RETURNING * INTO v_order;

  RETURN pg_catalog.jsonb_build_object(
    'id', v_order.id,
    'tx_ref', v_order.tx_ref,
    'amount', v_order.amount,
    'currency', v_order.currency,
    'course_title', v_course.title
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.dcds_create_checkout_order(uuid,uuid,text,text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dcds_create_checkout_order(uuid,uuid,text,text)
  TO service_role;

-- Release requires a recent provider-reference check, no payment record that
-- could represent money received, and either an elapsed recorded expiry or an
-- explicit administrator attestation that the old hosted link was disabled.
CREATE OR REPLACE FUNCTION public.admin_release_pending_flutterwave_checkout(
  p_order_id uuid,
  p_admin_user_id uuid,
  p_admin_confirmation_note text,
  p_confirm_link_disabled boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_order public.orders%rowtype;
  v_check public.dcds_payment_review_events%rowtype;
  v_link_expired boolean;
BEGIN
  IF p_order_id IS NULL OR p_admin_user_id IS NULL
     OR p_admin_confirmation_note IS NULL
     OR pg_catalog.length(pg_catalog.btrim(p_admin_confirmation_note)) < 20 THEN
    RAISE EXCEPTION 'An order, administrator, and a detailed reconciliation note are required.'
      USING errcode = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.dcds_admins a WHERE a.user_id = p_admin_user_id
  ) THEN
    RAISE EXCEPTION 'Administrator access required.' USING errcode = '42501';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.' USING errcode = 'P0001';
  END IF;
  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending orders can be released.' USING errcode = 'P0001';
  END IF;
  IF coalesce(v_order.tx_ref, '') LIKE 'DCDS-MANUAL-%' THEN
    RAISE EXCEPTION 'Manual bank-transfer orders use the receipt review workflow.' USING errcode = 'P0001';
  END IF;

  SELECT * INTO v_check
  FROM public.dcds_payment_review_events e
  WHERE e.order_id = p_order_id
    AND e.event_type = 'flutterwave_reconciliation_checked'
    AND e.details ->> 'outcome' IN ('not_found','failed')
    AND e.created_at >= now() - interval '2 hours'
  ORDER BY e.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Run a fresh Flutterwave reference check first. Only a confirmed not-found or failed result can proceed.'
      USING errcode = 'P0001';
  END IF;

  v_link_expired := v_order.checkout_expires_at IS NOT NULL
    AND v_order.checkout_expires_at <= now();

  IF NOT v_link_expired AND p_confirm_link_disabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'This legacy or active checkout has no confirmed expiry. Disable the hosted payment link in Flutterwave before releasing it.'
      USING errcode = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payments p
    WHERE p.order_id = p_order_id AND p.status <> 'failed'
  ) THEN
    RAISE EXCEPTION 'A payment record still exists for this order. Reconcile it before release.'
      USING errcode = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.enrollments e WHERE e.order_id = p_order_id
  ) THEN
    RAISE EXCEPTION 'This order already has a linked course enrolment and cannot be released.'
      USING errcode = 'P0001';
  END IF;

  UPDATE public.orders
  SET status = 'failed', updated_at = now()
  WHERE id = p_order_id AND status = 'pending';

  INSERT INTO public.dcds_payment_review_events(
    order_id, actor_user_id, event_type, details
  ) VALUES (
    p_order_id,
    p_admin_user_id,
    'pending_checkout_released',
    pg_catalog.jsonb_build_object(
      'reason', 'provider_checked_unpaid_and_checkout_closed',
      'provider_outcome', v_check.details ->> 'outcome',
      'provider_status', v_check.details ->> 'provider_status',
      'provider_transaction_id', v_check.details ->> 'transaction_id',
      'provider_reference', v_check.details ->> 'provider_reference',
      'provider_checked_at', v_check.created_at,
      'checkout_expires_at', v_order.checkout_expires_at,
      'checkout_expired', v_link_expired,
      'administrator_confirmed_link_disabled', coalesce(p_confirm_link_disabled, false),
      'administrator_confirmation_note', pg_catalog.btrim(p_admin_confirmation_note)
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'status', 'failed',
    'message', 'The unpaid checkout was released and the audit record was saved.'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_release_pending_flutterwave_checkout(uuid,uuid,text,boolean)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_release_pending_flutterwave_checkout(uuid,uuid,text,boolean)
  TO service_role;

-- Keep the admin payment queue API compatible while exposing the recorded
-- hosted-checkout expiry alongside each order.
DROP FUNCTION IF EXISTS public.admin_list_payment_orders(text,text,text,integer);

CREATE FUNCTION public.admin_list_payment_orders(
  p_status text DEFAULT 'pending',
  p_search text DEFAULT NULL,
  p_currency text DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  order_id uuid,
  user_id uuid,
  student_email text,
  student_name text,
  course_id uuid,
  course_title text,
  amount numeric,
  currency text,
  order_status text,
  tx_ref text,
  order_created_at timestamptz,
  checkout_expires_at timestamptz,
  order_source text,
  review_id uuid,
  review_status text,
  receipt_path text,
  bank_reference text,
  payment_channel text,
  payer_name text,
  claimed_amount numeric,
  claimed_currency text,
  admin_note text,
  reviewed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT coalesce(public.is_dcds_admin(), false) THEN
    RAISE EXCEPTION 'Administrator access required' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.user_id,
    coalesce(u.email::text, ''),
    coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
      'DCDS Student'
    ),
    o.course_id,
    c.title,
    o.amount,
    o.currency,
    o.status,
    coalesce(o.tx_ref, ''),
    o.created_at,
    o.checkout_expires_at,
    CASE WHEN o.tx_ref LIKE 'DCDS-MANUAL-%' THEN 'manual_bank_transfer' ELSE 'flutterwave_checkout' END,
    r.id,
    r.review_status,
    r.receipt_path,
    r.bank_reference,
    r.payment_channel,
    r.payer_name,
    r.claimed_amount,
    r.claimed_currency,
    r.admin_note,
    r.reviewed_at
  FROM public.orders o
  JOIN auth.users u ON u.id = o.user_id
  JOIN public.courses c ON c.id = o.course_id
  LEFT JOIN public.dcds_payment_receipt_reviews r ON r.order_id = o.id
  WHERE
    (
      coalesce(p_status, 'pending') = 'all'
      OR (p_status = 'receipt_submitted' AND r.review_status = 'submitted')
      OR (p_status = 'pending' AND o.status = 'pending')
      OR (p_status = 'successful' AND o.status = 'successful')
      OR (p_status = 'failed' AND o.status IN ('failed','cancelled'))
    )
    AND (p_currency IS NULL OR upper(o.currency) = upper(p_currency))
    AND (
      p_search IS NULL OR btrim(p_search) = ''
      OR lower(
        coalesce(u.email,'') || ' ' ||
        coalesce(u.raw_user_meta_data ->> 'full_name','') || ' ' ||
        coalesce(c.title,'') || ' ' ||
        coalesce(o.tx_ref,'') || ' ' ||
        coalesce(r.bank_reference,'')
      ) LIKE '%' || lower(btrim(p_search)) || '%'
    )
  ORDER BY o.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit,100),200));
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_payment_orders(text,text,text,integer)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_payment_orders(text,text,text,integer)
  TO authenticated;
