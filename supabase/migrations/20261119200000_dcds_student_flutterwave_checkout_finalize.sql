-- Atomic, student-owned finalization for Flutterwave hosted course checkout.
-- The Edge Function verifies the transaction with Flutterwave first; this RPC
-- then persists payment, order completion and enrollment in one transaction.

CREATE OR REPLACE FUNCTION public.dcds_finalize_flutterwave_checkout(
  p_order_id uuid,
  p_user_id uuid,
  p_transaction_id text,
  p_tx_ref text,
  p_amount numeric,
  p_currency text,
  p_raw_response jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_order public.orders%rowtype;
  v_payment_by_id public.payments%rowtype;
  v_payment_by_ref public.payments%rowtype;
  v_course_slug text;
  v_payment_id uuid;
BEGIN
  IF p_order_id IS NULL
     OR p_user_id IS NULL
     OR p_transaction_id IS NULL
     OR p_transaction_id !~ '^[0-9]{1,30}$'
     OR p_tx_ref IS NULL
     OR length(p_tx_ref) < 12
     OR length(p_tx_ref) > 120
     OR p_amount IS NULL
     OR p_amount <= 0
     OR p_currency IS NULL
     OR upper(p_currency) !~ '^[A-Z]{3}$'
     OR p_raw_response IS NULL
     OR pg_catalog.jsonb_typeof(p_raw_response) <> 'object' THEN
    RAISE EXCEPTION 'Verified transaction details are incomplete or invalid.'
      USING errcode = '22023';
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.' USING errcode = 'P0001';
  END IF;

  IF v_order.user_id <> p_user_id THEN
    RAISE EXCEPTION 'This order does not belong to the signed-in student.'
      USING errcode = '42501';
  END IF;

  IF coalesce(v_order.tx_ref, '') LIKE 'DCDS-MANUAL-%' THEN
    RAISE EXCEPTION 'Direct bank-transfer orders cannot be completed through hosted checkout.'
      USING errcode = 'P0001';
  END IF;

  IF v_order.tx_ref <> p_tx_ref
     OR v_order.amount <> p_amount
     OR upper(v_order.currency) <> upper(p_currency) THEN
    RAISE EXCEPTION 'Verified Flutterwave transaction does not match this order.'
      USING errcode = 'P0001';
  END IF;

  IF v_order.status NOT IN ('pending', 'successful') THEN
    RAISE EXCEPTION 'This order is not eligible for payment completion.'
      USING errcode = 'P0001';
  END IF;

  SELECT *
  INTO v_payment_by_id
  FROM public.payments
  WHERE transaction_id = p_transaction_id
  FOR UPDATE;

  IF FOUND AND (
    v_payment_by_id.order_id <> v_order.id
    OR v_payment_by_id.tx_ref <> v_order.tx_ref
  ) THEN
    RAISE EXCEPTION 'This Flutterwave transaction ID is already linked to another order.'
      USING errcode = '23505';
  END IF;

  SELECT *
  INTO v_payment_by_ref
  FROM public.payments
  WHERE tx_ref = v_order.tx_ref
  FOR UPDATE;

  IF FOUND AND (
    v_payment_by_ref.order_id <> v_order.id
    OR v_payment_by_ref.transaction_id <> p_transaction_id
  ) THEN
    RAISE EXCEPTION 'This order reference already has a different payment transaction.'
      USING errcode = '23505';
  END IF;

  v_payment_id := coalesce(v_payment_by_ref.id, v_payment_by_id.id);

  IF v_payment_id IS NULL THEN
    INSERT INTO public.payments (
      order_id, user_id, provider, transaction_id, tx_ref,
      amount, currency, status, raw_response
    )
    VALUES (
      v_order.id, v_order.user_id, 'flutterwave', p_transaction_id, v_order.tx_ref,
      p_amount, upper(p_currency), 'successful', p_raw_response
    );
  ELSE
    UPDATE public.payments
    SET provider = 'flutterwave',
        transaction_id = p_transaction_id,
        tx_ref = v_order.tx_ref,
        amount = p_amount,
        currency = upper(p_currency),
        status = 'successful',
        raw_response = p_raw_response
    WHERE id = v_payment_id;
  END IF;

  UPDATE public.orders
  SET status = 'successful',
      updated_at = now()
  WHERE id = v_order.id
    AND status = 'pending';

  -- Preserve existing admin-granted enrolments; create a purchase enrolment
  -- only when one does not already exist for this student/course.
  INSERT INTO public.enrollments (
    user_id, course_id, order_id, enrollment_source
  )
  VALUES (
    v_order.user_id, v_order.course_id, v_order.id, 'purchase'
  )
  ON CONFLICT (user_id, course_id) DO NOTHING;

  SELECT c.slug
  INTO v_course_slug
  FROM public.courses c
  WHERE c.id = v_order.course_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.dcds_payment_review_events e
    WHERE e.order_id = v_order.id
      AND e.event_type = 'flutterwave_payment_verified'
      AND e.details ->> 'transaction_id' = p_transaction_id
  ) THEN
    INSERT INTO public.dcds_payment_review_events (
      order_id, actor_user_id, event_type, details
    )
    VALUES (
      v_order.id,
      v_order.user_id,
      'flutterwave_payment_verified',
      pg_catalog.jsonb_build_object(
        'transaction_id', p_transaction_id,
        'amount', p_amount,
        'currency', upper(p_currency),
        'source', 'student_hosted_checkout_verification'
      )
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'order_id', v_order.id,
    'status', 'successful',
    'learning_slug', coalesce(v_course_slug, '')
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.dcds_finalize_flutterwave_checkout(
  uuid, uuid, text, text, numeric, text, jsonb
) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.dcds_finalize_flutterwave_checkout(
  uuid, uuid, text, text, numeric, text, jsonb
) TO service_role;
