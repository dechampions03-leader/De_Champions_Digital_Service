-- Standardise the visible title of the verified highest-privilege administrator across DCDS.
-- Keep the protected super_admin database role and authorization RPC unchanged.

-- Read-only, role-aware operational snapshot for Deyriva.
-- Financial/order/payout records and payment-category support tickets are excluded.
CREATE OR REPLACE FUNCTION public.dcds_ai_platform_snapshot(
  p_include_admin_details boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_superintendent boolean := false;
  v_course_count bigint := 0;
  v_lesson_count bigint := 0;
  v_announcement_count bigint := 0;
  v_open_support bigint := 0;
  v_stale_support bigint := 0;
  v_support_categories jsonb := '{}'::jsonb;
  v_open_reports bigint := 0;
  v_flagged_messages bigint := 0;
  v_recent_ai_conversations bigint := 0;
  v_admin_directory jsonb := NULL;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF NOT COALESCE(public.is_dcds_admin(), false) THEN
    RAISE EXCEPTION 'DCDS administrator access required' USING ERRCODE = '42501';
  END IF;

  v_superintendent := COALESCE(public.is_dcds_super_admin(), false);

  SELECT count(*) INTO v_course_count FROM public.courses;
  SELECT count(*) INTO v_lesson_count FROM public.course_lessons;
  SELECT count(*) INTO v_announcement_count
  FROM public.public_announcements
  WHERE status = 'published'
    AND starts_at <= now()
    AND (expires_at IS NULL OR expires_at > now());

  SELECT count(*) INTO v_open_support
  FROM public.student_support_tickets
  WHERE category <> 'payment' AND status IN ('open', 'in_progress');

  SELECT count(*) INTO v_stale_support
  FROM public.student_support_tickets
  WHERE category <> 'payment'
    AND status IN ('open', 'in_progress')
    AND created_at < now() - interval '48 hours';

  SELECT COALESCE(jsonb_object_agg(category, ticket_count), '{}'::jsonb)
  INTO v_support_categories
  FROM (
    SELECT category, count(*) AS ticket_count
    FROM public.student_support_tickets
    WHERE category <> 'payment' AND status IN ('open', 'in_progress')
    GROUP BY category
  ) AS grouped_support;

  SELECT count(*) INTO v_open_reports
  FROM public.dcds_community_reports WHERE status = 'open';

  SELECT count(*) INTO v_flagged_messages
  FROM public.dcds_community_messages WHERE status = 'flagged';

  SELECT count(*) INTO v_recent_ai_conversations
  FROM public.dcds_ai_conversations
  WHERE updated_at >= now() - interval '7 days';

  IF v_superintendent AND p_include_admin_details THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'admin_display_name', COALESCE(
            NULLIF(u.raw_user_meta_data->>'full_name', ''),
            NULLIF(u.raw_user_meta_data->>'name', ''),
            NULLIF(u.raw_user_meta_data->>'display_name', ''),
            'DCDS Administrator'
          ),
          'admin_role', CASE WHEN a.role = 'super_admin' THEN 'Superintendent Admin' ELSE initcap(replace(a.role, '_', ' ')) END,
          'admin_joined_at', a.created_at,
          'audited_actions_last_30_days', COALESCE(activity.action_count, 0)
        )
        ORDER BY a.created_at ASC
      ),
      '[]'::jsonb
    )
    INTO v_admin_directory
    FROM public.admin_users AS a
    JOIN public.dcds_admins AS d ON d.user_id = a.user_id
    JOIN auth.users AS u ON u.id = a.user_id
    LEFT JOIN LATERAL (
      SELECT count(*) AS action_count
      FROM public.student_admin_audit AS audit
      WHERE audit.admin_id = a.user_id
        AND audit.created_at >= now() - interval '30 days'
    ) AS activity ON true;
  END IF;

  RETURN jsonb_build_object(
    'checked_at', now(),
    'database_snapshot_ready', true,
    'verified_role', CASE WHEN v_superintendent THEN 'superintendent_admin' ELSE 'administrator' END,
    'overview', jsonb_build_object(
      'course_records', v_course_count,
      'lesson_records', v_lesson_count,
      'currently_published_announcements', v_announcement_count,
      'open_non_payment_support_tickets', v_open_support,
      'stale_non_payment_support_tickets_over_48_hours', v_stale_support,
      'open_non_payment_support_by_category', v_support_categories,
      'open_community_reports', v_open_reports,
      'flagged_community_messages', v_flagged_messages,
      'ai_conversations_updated_last_7_days', v_recent_ai_conversations
    ),
    'admin_directory', CASE
      WHEN v_superintendent AND p_include_admin_details THEN v_admin_directory
      ELSE NULL
    END,
    'admin_directory_visible', (v_superintendent AND p_include_admin_details),
    'privacy_scope', jsonb_build_array(
      'No student payment amounts, transaction data, order details, receipts, bank details, wallet balances or payout records were queried.',
      'Payment-category support tickets were excluded from all support counts.',
      'Internal administrator display names, roles and aggregate audit counts are returned only to the verified Superintendent Admin after an explicit request.',
      'Ordinary administrators receive aggregate operational metrics only.'
    ),
    'not_checked', jsonb_build_array(
      'Cloudflare Pages/CDN availability',
      'Supabase ClickHouse logs and full Edge Function invocation logs',
      'Gemini provider live availability or quota status',
      'External payment and payout provider systems',
      'Browser-based public website end-to-end availability'
    )
  );
END;
$function$;

COMMENT ON FUNCTION public.dcds_ai_platform_snapshot(boolean)
IS 'Read-only DCDS platform snapshot for authenticated DCDS administrators. Internal administrator details are visible only to the verified Superintendent Admin. Financial transaction data is excluded.';

REVOKE ALL ON FUNCTION public.dcds_ai_platform_snapshot(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dcds_ai_platform_snapshot(boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.dcds_ai_platform_snapshot(boolean) TO authenticated;
