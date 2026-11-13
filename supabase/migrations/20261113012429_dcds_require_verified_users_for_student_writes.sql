-- Anonymous Supabase sessions use the authenticated database role.
-- Keep visitor AI access separate from student-only user-generated records.
-- This migration is Development-only until explicitly qualified for Production.

DROP POLICY IF EXISTS "Students can submit pending DCDS reviews" ON public.dcds_reviews;
CREATE POLICY "Students can submit pending DCDS reviews"
ON public.dcds_reviews
FOR INSERT
TO authenticated
WITH CHECK (
  NOT COALESCE(((SELECT auth.jwt())->>'is_anonymous')::boolean, false)
  AND user_id = (SELECT auth.uid())
  AND is_approved = false
  AND rating >= 1
  AND rating <= 5
  AND length(trim(display_name)) > 0
  AND length(trim(course_title)) > 0
  AND length(trim(review_text)) > 0
);

DROP POLICY IF EXISTS "Students can create their own support tickets" ON public.student_support_tickets;
CREATE POLICY "Students can create their own support tickets"
ON public.student_support_tickets
FOR INSERT
TO authenticated
WITH CHECK (
  NOT COALESCE(((SELECT auth.jwt())->>'is_anonymous')::boolean, false)
  AND user_id = (SELECT auth.uid())
);
