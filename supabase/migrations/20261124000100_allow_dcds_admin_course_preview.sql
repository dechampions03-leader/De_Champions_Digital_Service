-- Allow authenticated DCDS administrators to preview course lesson content
-- without creating a paid student enrolment. The policy uses the existing
-- auth.uid()-based SECURITY DEFINER helper and does not change student access.
drop policy if exists "DCDS admins can view course lessons" on public.course_lessons;

create policy "DCDS admins can view course lessons"
on public.course_lessons
for select
to authenticated
using (public.is_dcds_admin());

-- Rollback:
-- drop policy if exists "DCDS admins can view course lessons" on public.course_lessons;
