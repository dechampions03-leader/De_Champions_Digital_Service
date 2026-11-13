-- DCDS Super Intelligence: student-controlled automatic learning preferences.
-- Safe default: OFF for every existing and new student.
ALTER TABLE public.dcds_ai_student_memory
  ADD COLUMN IF NOT EXISTS auto_learning_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.dcds_ai_student_memory.auto_learning_enabled IS
  'Student-controlled opt-in for saving only explicit, low-risk learning preferences from that student own messages. Default OFF; owner-only RLS applies.';
