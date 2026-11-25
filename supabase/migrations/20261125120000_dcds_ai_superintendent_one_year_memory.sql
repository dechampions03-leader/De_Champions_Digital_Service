-- Persistent private conversation history and one-year retrieval for the verified DCDS Superintendent Admin.
-- Reuses the existing owner-scoped conversation tables. No student conversations or records are exposed.

CREATE INDEX IF NOT EXISTS dcds_ai_messages_content_fts_idx
  ON public.dcds_ai_messages
  USING gin (to_tsvector('simple', content));

CREATE OR REPLACE FUNCTION public.dcds_ai_search_superintendent_memory(
  p_query text,
  p_limit integer DEFAULT 6
)
RETURNS TABLE (
  conversation_id uuid,
  conversation_title text,
  message_role text,
  message_created_at timestamptz,
  excerpt text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  WITH parsed_terms AS (
    SELECT string_agg(term || ':*', ' | ') AS query_text
    FROM (
      SELECT DISTINCT token AS term
      FROM pg_catalog.regexp_split_to_table(
        pg_catalog.lower(pg_catalog.left(coalesce(p_query, ''), 360)),
        '[^a-z0-9]+'
      ) AS tokens(token)
      WHERE pg_catalog.char_length(token) >= 3
        AND token NOT IN (
          'the','and','for','with','from','what','when','where','which','who','why','how',
          'can','could','would','should','does','did','are','was','were','have','has','had',
          'this','that','these','those','about','into','your','you','our','their','them',
          'please','tell','show','give','help','want','need','know','like','just','then',
          'there','here','previous','earlier','discussed','discussion','remember','recall'
        )
      LIMIT 12
    ) AS distinct_terms
  ),
  parsed_query AS (
    SELECT CASE
      WHEN query_text IS NULL OR query_text = '' THEN NULL
      ELSE pg_catalog.to_tsquery('simple', query_text)
    END AS ts_query
    FROM parsed_terms
  )
  SELECT
    c.id,
    c.title,
    m.role,
    m.created_at,
    pg_catalog.left(
      pg_catalog.regexp_replace(m.content, '[[:space:]]+', ' ', 'g'),
      700
    )
  FROM public.dcds_ai_messages AS m
  JOIN public.dcds_ai_conversations AS c
    ON c.id = m.conversation_id
  CROSS JOIN parsed_query AS q
  WHERE c.user_id = (SELECT auth.uid())
    AND public.is_dcds_super_admin()
    AND m.created_at >= (now() - interval '365 days')
    AND q.ts_query IS NOT NULL
    AND pg_catalog.to_tsvector('simple', m.content) @@ q.ts_query
    -- Do not retrieve financial/account-secret discussions into the AI prompt.
    AND m.content !~* '(^|[^[:alnum:]])(payment|payments|payout|payouts|wallet|bank|transaction|refund|receipt|beneficiary|card|cvv|otp|password|account number|balance)([^[:alnum:]]|$)'
  ORDER BY
    pg_catalog.ts_rank_cd(pg_catalog.to_tsvector('simple', m.content), q.ts_query) DESC,
    m.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 6), 8));
$function$;

REVOKE ALL ON FUNCTION public.dcds_ai_search_superintendent_memory(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dcds_ai_search_superintendent_memory(text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.dcds_ai_search_superintendent_memory(text, integer) TO authenticated;

COMMENT ON FUNCTION public.dcds_ai_search_superintendent_memory(text, integer) IS
  'Searches only the authenticated verified Superintendent Admin own saved DCDS AI messages from the previous 365 days. SECURITY INVOKER and owner RLS apply; financial/account-secret message text is excluded.';
