drop policy if exists "Authors update own pending discussion topics" on public.dcds_discussion_topics;
create policy "Authors update own pending discussion topics"
on public.dcds_discussion_topics for update to authenticated
using (
  user_id = (select auth.uid())
  and status in ('pending','hidden')
  and exists (
    select 1 from public.enrollments e
    where e.course_id = dcds_discussion_topics.course_id
      and e.user_id = (select auth.uid())
  )
)
with check (
  user_id = (select auth.uid())
  and status in ('pending','hidden')
  and exists (
    select 1 from public.enrollments e
    where e.course_id = dcds_discussion_topics.course_id
      and e.user_id = (select auth.uid())
  )
);

drop policy if exists "Authors update own pending discussion replies" on public.dcds_discussion_replies;
create policy "Authors update own pending discussion replies"
on public.dcds_discussion_replies for update to authenticated
using (
  user_id = (select auth.uid())
  and status in ('pending','hidden')
)
with check (
  user_id = (select auth.uid())
  and status in ('pending','hidden')
  and exists (
    select 1
    from public.dcds_discussion_topics t
    join public.enrollments e on e.course_id = t.course_id
    where t.id = dcds_discussion_replies.topic_id
      and t.status = 'published'
      and e.user_id = (select auth.uid())
  )
);

drop policy if exists "Students update own portfolio projects for review" on public.dcds_student_projects;
create policy "Students update own portfolio projects for review"
on public.dcds_student_projects for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and status = 'pending'
  and (
    course_id is null
    or exists (
      select 1 from public.enrollments e
      where e.course_id = dcds_student_projects.course_id
        and e.user_id = (select auth.uid())
    )
  )
);

drop policy if exists "Students cancel own workshop registrations" on public.dcds_workshop_registrations;
create policy "Students cancel own workshop registrations"
on public.dcds_workshop_registrations for update to authenticated
using (user_id = (select auth.uid()) and status = 'registered')
with check (
  user_id = (select auth.uid())
  and status = 'cancelled'
  and exists (
    select 1 from public.dcds_workshops w
    where w.id = dcds_workshop_registrations.workshop_id
      and w.status in ('published','cancelled','completed')
  )
);

create or replace function private.dcds_validate_rubric_score()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  criterion_max numeric(8,2);
  criterion_assignment uuid;
  submission_assignment uuid;
begin
  select c.max_points,c.assignment_id
    into criterion_max,criterion_assignment
  from public.dcds_assignment_rubric_criteria c
  where c.id = new.criterion_id;

  select s.assignment_id into submission_assignment
  from public.assignment_submissions s
  where s.id = new.submission_id;

  if criterion_max is null or submission_assignment is null then
    raise exception 'Rubric criterion or assignment submission not found';
  end if;
  if criterion_assignment <> submission_assignment then
    raise exception 'Rubric criterion must belong to the submitted assignment';
  end if;
  if new.score > criterion_max then
    raise exception 'Rubric score (%) cannot exceed criterion maximum (%)',
      new.score, criterion_max;
  end if;
  return new;
end;
$$;
