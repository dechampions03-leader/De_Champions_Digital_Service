-- Persistent, owner-scoped DCDS AI conversation history for verified accounts.
-- Development-first rollout. Do not apply to Production until explicitly approved.

CREATE OR REPLACE FUNCTION public.dcds_is_verified_ai_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users AS u
    WHERE u.id = (SELECT auth.uid())
      AND NOT COALESCE(u.is_anonymous, false)
      AND (u.email_confirmed_at IS NOT NULL OR u.phone_confirmed_at IS NOT NULL)
  );
$function$;

REVOKE ALL ON FUNCTION public.dcds_is_verified_ai_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dcds_is_verified_ai_user() FROM anon;
GRANT EXECUTE ON FUNCTION public.dcds_is_verified_ai_user() TO authenticated;

CREATE TABLE IF NOT EXISTS public.dcds_ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dcds_ai_conversations_user_last_message_idx
  ON public.dcds_ai_conversations (user_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.dcds_ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.dcds_ai_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 20000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dcds_ai_messages_conversation_created_idx
  ON public.dcds_ai_messages (conversation_id, created_at ASC);

CREATE TABLE IF NOT EXISTS public.dcds_ai_student_memory (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  learning_context text NOT NULL DEFAULT '' CHECK (char_length(learning_context) <= 1200),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.dcds_touch_ai_student_memory()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS dcds_touch_ai_student_memory_updated_at
  ON public.dcds_ai_student_memory;
CREATE TRIGGER dcds_touch_ai_student_memory_updated_at
  BEFORE UPDATE ON public.dcds_ai_student_memory
  FOR EACH ROW EXECUTE FUNCTION public.dcds_touch_ai_student_memory();

ALTER TABLE public.dcds_ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dcds_ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dcds_ai_student_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Verified users manage their own DCDS AI conversations"
  ON public.dcds_ai_conversations;
CREATE POLICY "Verified users manage their own DCDS AI conversations"
  ON public.dcds_ai_conversations
  FOR ALL TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND (SELECT public.dcds_is_verified_ai_user())
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (SELECT public.dcds_is_verified_ai_user())
  );

DROP POLICY IF EXISTS "Verified users read their own DCDS AI messages"
  ON public.dcds_ai_messages;
CREATE POLICY "Verified users read their own DCDS AI messages"
  ON public.dcds_ai_messages
  FOR SELECT TO authenticated
  USING (
    (SELECT public.dcds_is_verified_ai_user())
    AND EXISTS (
      SELECT 1
      FROM public.dcds_ai_conversations AS c
      WHERE c.id = conversation_id
        AND c.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Verified users add messages to their own DCDS AI conversations"
  ON public.dcds_ai_messages;
CREATE POLICY "Verified users add messages to their own DCDS AI conversations"
  ON public.dcds_ai_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.dcds_is_verified_ai_user())
    AND EXISTS (
      SELECT 1
      FROM public.dcds_ai_conversations AS c
      WHERE c.id = conversation_id
        AND c.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Verified users delete messages from their own DCDS AI conversations"
  ON public.dcds_ai_messages;
CREATE POLICY "Verified users delete messages from their own DCDS AI conversations"
  ON public.dcds_ai_messages
  FOR DELETE TO authenticated
  USING (
    (SELECT public.dcds_is_verified_ai_user())
    AND EXISTS (
      SELECT 1
      FROM public.dcds_ai_conversations AS c
      WHERE c.id = conversation_id
        AND c.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Verified users manage their own DCDS AI learning memory"
  ON public.dcds_ai_student_memory;
CREATE POLICY "Verified users manage their own DCDS AI learning memory"
  ON public.dcds_ai_student_memory
  FOR ALL TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND (SELECT public.dcds_is_verified_ai_user())
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (SELECT public.dcds_is_verified_ai_user())
  );

REVOKE ALL ON public.dcds_ai_conversations FROM anon;
REVOKE ALL ON public.dcds_ai_messages FROM anon;
REVOKE ALL ON public.dcds_ai_student_memory FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dcds_ai_conversations TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.dcds_ai_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dcds_ai_student_memory TO authenticated;

COMMENT ON TABLE public.dcds_ai_conversations IS
  'Private DCDS AI conversations owned by a verified Supabase account; row-level security enforces ownership.';
COMMENT ON TABLE public.dcds_ai_messages IS
  'Private messages belonging to a DCDS AI conversation; accessible only to its verified owner.';
COMMENT ON TABLE public.dcds_ai_student_memory IS
  'Optional, student-controlled learning context used to personalize future DCDS AI chats.';
