-- Add a per-account daily AI usage ceiling alongside the rolling minute limit.
ALTER TABLE public.dcds_ai_usage_windows
  ADD COLUMN IF NOT EXISTS daily_window_started_at timestamptz NOT NULL DEFAULT date_trunc('day', now()),
  ADD COLUMN IF NOT EXISTS daily_request_count integer NOT NULL DEFAULT 0
    CHECK (daily_request_count >= 0);

DROP FUNCTION IF EXISTS public.dcds_consume_ai_request(integer);

CREATE FUNCTION public.dcds_consume_ai_request(
  p_limit integer DEFAULT 10,
  p_daily_limit integer DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_minute_limit integer := least(greatest(coalesce(p_limit, 10), 1), 30);
  v_daily_limit integer := least(greatest(coalesce(p_daily_limit, 60), 1), 500);
  v_minute_count integer;
  v_daily_count integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_day_start timestamptz := pg_catalog.date_trunc('day', pg_catalog.clock_timestamp());
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 30 THEN
    RAISE EXCEPTION 'AI per-minute request limit must be between 1 and 30';
  END IF;

  IF p_daily_limit IS NULL OR p_daily_limit < 1 OR p_daily_limit > 500 THEN
    RAISE EXCEPTION 'AI daily request limit must be between 1 and 500';
  END IF;

  INSERT INTO public.dcds_ai_usage_windows (
    user_id,
    window_started_at,
    request_count,
    daily_window_started_at,
    daily_request_count,
    updated_at
  )
  VALUES (v_user_id, v_now, 1, v_day_start, 1, v_now)
  ON CONFLICT (user_id) DO UPDATE
  SET
    window_started_at = CASE
      WHEN public.dcds_ai_usage_windows.window_started_at <= v_now - interval '60 seconds'
      THEN v_now
      ELSE public.dcds_ai_usage_windows.window_started_at
    END,
    request_count = CASE
      WHEN public.dcds_ai_usage_windows.window_started_at <= v_now - interval '60 seconds'
      THEN 1
      ELSE least(public.dcds_ai_usage_windows.request_count + 1, v_minute_limit + 1)
    END,
    daily_window_started_at = CASE
      WHEN public.dcds_ai_usage_windows.daily_window_started_at < v_day_start
      THEN v_day_start
      ELSE public.dcds_ai_usage_windows.daily_window_started_at
    END,
    daily_request_count = CASE
      WHEN public.dcds_ai_usage_windows.daily_window_started_at < v_day_start
      THEN 1
      ELSE least(public.dcds_ai_usage_windows.daily_request_count + 1, v_daily_limit + 1)
    END,
    updated_at = v_now
  RETURNING request_count, daily_request_count
  INTO v_minute_count, v_daily_count;

  RETURN v_minute_count <= v_minute_limit AND v_daily_count <= v_daily_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.dcds_consume_ai_request(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dcds_consume_ai_request(integer, integer) TO authenticated;
