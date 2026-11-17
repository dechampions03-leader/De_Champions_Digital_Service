-- DCDS Professional Learning Suite
-- Adds career paths, course discussions, student portfolios, workshops,
-- assessment rubrics, and administrative controls. Reuses course_materials.

create table if not exists public.dcds_learning_paths (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null check (length(trim(title)) between 3 and 120),
  summary text not null check (length(trim(summary)) between 10 and 500),
  career_outcome text not null check (length(trim(career_outcome)) between 10 and 500),
  course_slugs text[] not null default '{}',
  milestones jsonb not null default '[]'::jsonb,
  is_published boolean not null default false,
  sort_order integer not null default 100,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(milestones) = 'array')
);

create table if not exists public.dcds_learning_path_enrollments (
  id uuid primary key default gen_random_uuid(),
  path_id uuid not null references public.dcds_learning_paths(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active','completed')),
  enrolled_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (path_id,user_id)
);
create index if not exists dcds_path_enrollments_user_idx
  on public.dcds_learning_path_enrollments(user_id,enrolled_at desc);

create table if not exists public.dcds_discussion_topics (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) between 6 and 160),
  body text not null check (length(trim(body)) between 10 and 8000),
  status text not null default 'pending' check (status in ('pending','published','hidden','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dcds_discussion_topics_course_recent_idx
  on public.dcds_discussion_topics(course_id,status,created_at desc);
create index if not exists dcds_discussion_topics_user_idx
  on public.dcds_discussion_topics(user_id,created_at desc);

create table if not exists public.dcds_discussion_replies (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.dcds_discussion_topics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(trim(body)) between 2 and 5000),
  status text not null default 'pending' check (status in ('pending','published','hidden','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dcds_discussion_replies_topic_idx
  on public.dcds_discussion_replies(topic_id,status,created_at asc);
create index if not exists dcds_discussion_replies_user_idx
  on public.dcds_discussion_replies(user_id,created_at desc);

create table if not exists public.dcds_student_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  title text not null check (length(trim(title)) between 3 and 140),
  description text not null check (length(trim(description)) between 10 and 2500),
  project_url text not null check (project_url ~* '^https?://'),
  preview_image_url text check (preview_image_url is null or preview_image_url ~* '^https?://'),
  visibility text not null default 'private' check (visibility in ('private','public')),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  admin_feedback text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dcds_student_projects_owner_idx
  on public.dcds_student_projects(user_id,created_at desc);
create index if not exists dcds_student_projects_public_idx
  on public.dcds_student_projects(status,visibility,created_at desc);

create table if not exists public.dcds_workshops (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.courses(id) on delete set null,
  title text not null check (length(trim(title)) between 3 and 140),
  description text not null check (length(trim(description)) between 10 and 2500),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Africa/Lagos',
  meeting_url text not null check (meeting_url ~* '^https?://'),
  status text not null default 'draft' check (status in ('draft','published','cancelled','completed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists dcds_workshops_schedule_idx
  on public.dcds_workshops(status,starts_at);

create table if not exists public.dcds_workshop_registrations (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.dcds_workshops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'registered' check (status in ('registered','cancelled','attended')),
  registered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workshop_id,user_id)
);
create index if not exists dcds_workshop_registrations_user_idx
  on public.dcds_workshop_registrations(user_id,registered_at desc);

create table if not exists public.dcds_assignment_rubric_criteria (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  title text not null check (length(trim(title)) between 2 and 120),
  description text,
  max_points numeric(8,2) not null check (max_points > 0),
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  unique (assignment_id,title)
);
create index if not exists dcds_rubric_criteria_assignment_idx
  on public.dcds_assignment_rubric_criteria(assignment_id,sort_order,id);

create table if not exists public.dcds_assignment_rubric_scores (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.assignment_submissions(id) on delete cascade,
  criterion_id uuid not null references public.dcds_assignment_rubric_criteria(id) on delete cascade,
  score numeric(8,2) not null check (score >= 0),
  feedback text,
  graded_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (submission_id,criterion_id)
);
create index if not exists dcds_rubric_scores_submission_idx
  on public.dcds_assignment_rubric_scores(submission_id);

-- Guard rubric totals against exceeding the assignment's existing maximum score.
create or replace function private.dcds_validate_rubric_criterion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  assignment_max numeric(8,2);
  existing_total numeric(10,2);
begin
  select a.max_score into assignment_max
  from public.assignments a
  where a.id = new.assignment_id;

  if assignment_max is null then
    raise exception 'Assignment not found for rubric criterion';
  end if;

  select coalesce(sum(c.max_points),0) into existing_total
  from public.dcds_assignment_rubric_criteria c
  where c.assignment_id = new.assignment_id
    and (tg_op = 'INSERT' or c.id <> new.id);

  if existing_total + new.max_points > assignment_max then
    raise exception 'Rubric criteria total (%) cannot exceed assignment maximum (%)',
      existing_total + new.max_points, assignment_max;
  end if;
  return new;
end;
$$;
drop trigger if exists dcds_validate_rubric_criterion on public.dcds_assignment_rubric_criteria;
create trigger dcds_validate_rubric_criterion
before insert or update of assignment_id,max_points
on public.dcds_assignment_rubric_criteria
for each row execute function private.dcds_validate_rubric_criterion();

create or replace function private.dcds_validate_rubric_score()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  criterion_max numeric(8,2);
begin
  select c.max_points into criterion_max
  from public.dcds_assignment_rubric_criteria c
  where c.id = new.criterion_id;

  if criterion_max is null then
    raise exception 'Rubric criterion not found';
  end if;
  if new.score > criterion_max then
    raise exception 'Rubric score (%) cannot exceed criterion maximum (%)',
      new.score, criterion_max;
  end if;
  return new;
end;
$$;
drop trigger if exists dcds_validate_rubric_score on public.dcds_assignment_rubric_scores;
create trigger dcds_validate_rubric_score
before insert or update of criterion_id,score
on public.dcds_assignment_rubric_scores
for each row execute function private.dcds_validate_rubric_score();

-- Enable RLS for every new exposed public table.
alter table public.dcds_learning_paths enable row level security;
alter table public.dcds_learning_path_enrollments enable row level security;
alter table public.dcds_discussion_topics enable row level security;
alter table public.dcds_discussion_replies enable row level security;
alter table public.dcds_student_projects enable row level security;
alter table public.dcds_workshops enable row level security;
alter table public.dcds_workshop_registrations enable row level security;
alter table public.dcds_assignment_rubric_criteria enable row level security;
alter table public.dcds_assignment_rubric_scores enable row level security;

revoke all on public.dcds_learning_paths from anon,authenticated;
revoke all on public.dcds_learning_path_enrollments from anon,authenticated;
revoke all on public.dcds_discussion_topics from anon,authenticated;
revoke all on public.dcds_discussion_replies from anon,authenticated;
revoke all on public.dcds_student_projects from anon,authenticated;
revoke all on public.dcds_workshops from anon,authenticated;
revoke all on public.dcds_workshop_registrations from anon,authenticated;
revoke all on public.dcds_assignment_rubric_criteria from anon,authenticated;
revoke all on public.dcds_assignment_rubric_scores from anon,authenticated;

grant select on public.dcds_learning_paths to anon,authenticated;
grant select,insert,update on public.dcds_learning_path_enrollments to authenticated;
grant select,insert,update,delete on public.dcds_discussion_topics to authenticated;
grant select,insert,update,delete on public.dcds_discussion_replies to authenticated;
grant select,insert,update,delete on public.dcds_student_projects to authenticated;
grant select on public.dcds_student_projects to anon;
grant select on public.dcds_workshops to anon,authenticated;
grant select,insert,update on public.dcds_workshop_registrations to authenticated;
grant select on public.dcds_assignment_rubric_criteria to authenticated;
grant select,insert,update,delete on public.dcds_assignment_rubric_criteria to authenticated;
grant select on public.dcds_assignment_rubric_scores to authenticated;
grant select,insert,update,delete on public.dcds_assignment_rubric_scores to authenticated;

-- Learning paths: public can view published paths; only admins can publish/manage.
create policy "Public can view published DCDS learning paths"
on public.dcds_learning_paths for select to anon
using (is_published = true);
create policy "Signed-in users can view published DCDS learning paths"
on public.dcds_learning_paths for select to authenticated
using (is_published = true or (select public.is_dcds_admin()));
create policy "DCDS admins manage learning paths"
on public.dcds_learning_paths for all to authenticated
using ((select public.is_dcds_admin()))
with check ((select public.is_dcds_admin()));

create policy "Students view own learning path enrolments"
on public.dcds_learning_path_enrollments for select to authenticated
using ((select auth.uid()) = user_id or (select public.is_dcds_admin()));
create policy "Verified students enrol in published learning paths"
on public.dcds_learning_path_enrollments for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and (select private.dcds_is_verified_ai_user())
  and exists (
    select 1 from public.dcds_learning_paths p
    where p.id = path_id and p.is_published = true
  )
);
create policy "Students update own learning path enrolments"
on public.dcds_learning_path_enrollments for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id and status in ('active','completed'));
create policy "DCDS admins manage learning path enrolments"
on public.dcds_learning_path_enrollments for all to authenticated
using ((select public.is_dcds_admin()))
with check ((select public.is_dcds_admin()));

-- Course discussions: enrolled, verified students can ask and reply; posts are moderated.
create policy "Enrolled students and admins view discussion topics"
on public.dcds_discussion_topics for select to authenticated
using (
  (select public.is_dcds_admin())
  or user_id = (select auth.uid())
  or (
    status = 'published'
    and exists (
      select 1 from public.enrollments e
      where e.course_id = dcds_discussion_topics.course_id
        and e.user_id = (select auth.uid())
    )
  )
);
create policy "Verified enrolled students create discussion topics"
on public.dcds_discussion_topics for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select private.dcds_is_verified_ai_user())
  and exists (
    select 1 from public.enrollments e
    where e.course_id = dcds_discussion_topics.course_id
      and e.user_id = (select auth.uid())
  )
);
create policy "Authors update own pending discussion topics"
on public.dcds_discussion_topics for update to authenticated
using (user_id = (select auth.uid()) and status in ('pending','hidden'))
with check (user_id = (select auth.uid()) and status in ('pending','hidden'));
create policy "Authors delete own discussion topics"
on public.dcds_discussion_topics for delete to authenticated
using (user_id = (select auth.uid()) and status <> 'published');
create policy "DCDS admins moderate discussion topics"
on public.dcds_discussion_topics for all to authenticated
using ((select public.is_dcds_admin()))
with check ((select public.is_dcds_admin()));

create policy "Enrolled students and admins view discussion replies"
on public.dcds_discussion_replies for select to authenticated
using (
  (select public.is_dcds_admin())
  or user_id = (select auth.uid())
  or (
    status = 'published'
    and exists (
      select 1
      from public.dcds_discussion_topics t
      join public.enrollments e on e.course_id = t.course_id
      where t.id = dcds_discussion_replies.topic_id
        and t.status = 'published'
        and e.user_id = (select auth.uid())
    )
  )
);
create policy "Verified enrolled students reply to published topics"
on public.dcds_discussion_replies for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select private.dcds_is_verified_ai_user())
  and exists (
    select 1
    from public.dcds_discussion_topics t
    join public.enrollments e on e.course_id = t.course_id
    where t.id = dcds_discussion_replies.topic_id
      and t.status = 'published'
      and e.user_id = (select auth.uid())
  )
);
create policy "Authors update own pending discussion replies"
on public.dcds_discussion_replies for update to authenticated
using (user_id = (select auth.uid()) and status in ('pending','hidden'))
with check (user_id = (select auth.uid()) and status in ('pending','hidden'));
create policy "Authors delete own discussion replies"
on public.dcds_discussion_replies for delete to authenticated
using (user_id = (select auth.uid()) and status <> 'published');
create policy "DCDS admins moderate discussion replies"
on public.dcds_discussion_replies for all to authenticated
using ((select public.is_dcds_admin()))
with check ((select public.is_dcds_admin()));

-- Student portfolios: private by default; public entries require admin approval.
create policy "Public can view approved public student projects"
on public.dcds_student_projects for select to anon
using (visibility = 'public' and status = 'approved');
create policy "Students view own and approved public projects"
on public.dcds_student_projects for select to authenticated
using (
  (select public.is_dcds_admin())
  or user_id = (select auth.uid())
  or (visibility = 'public' and status = 'approved')
);
create policy "Verified students create own portfolio projects"
on public.dcds_student_projects for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select private.dcds_is_verified_ai_user())
  and status = 'pending'
);
create policy "Students update own portfolio projects for review"
on public.dcds_student_projects for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()) and status = 'pending');
create policy "Students delete own portfolio projects"
on public.dcds_student_projects for delete to authenticated
using (user_id = (select auth.uid()));
create policy "DCDS admins moderate portfolio projects"
on public.dcds_student_projects for all to authenticated
using ((select public.is_dcds_admin()))
with check ((select public.is_dcds_admin()));

-- Live workshops: published schedule is readable, enrolment is private to the learner.
create policy "Public can view published DCDS workshops"
on public.dcds_workshops for select to anon
using (status in ('published','completed'));
create policy "Signed-in users and admins view published workshops"
on public.dcds_workshops for select to authenticated
using (status in ('published','completed') or (select public.is_dcds_admin()));
create policy "DCDS admins manage workshops"
on public.dcds_workshops for all to authenticated
using ((select public.is_dcds_admin()))
with check ((select public.is_dcds_admin()));

create policy "Students view own workshop registrations"
on public.dcds_workshop_registrations for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_dcds_admin()));
create policy "Verified students register for upcoming workshops"
on public.dcds_workshop_registrations for insert to authenticated
with check (
  user_id = (select auth.uid())
  and status = 'registered'
  and (select private.dcds_is_verified_ai_user())
  and exists (
    select 1 from public.dcds_workshops w
    where w.id = workshop_id and w.status = 'published' and w.starts_at > now()
  )
);
create policy "Students cancel own workshop registrations"
on public.dcds_workshop_registrations for update to authenticated
using (user_id = (select auth.uid()) and status = 'registered')
with check (user_id = (select auth.uid()) and status = 'cancelled');
create policy "DCDS admins manage workshop registrations"
on public.dcds_workshop_registrations for all to authenticated
using ((select public.is_dcds_admin()))
with check ((select public.is_dcds_admin()));

-- The existing course_materials table is reused for course PDFs, templates and links.
grant insert,update,delete on public.course_materials to authenticated;
create policy "DCDS admins manage course learning materials"
on public.course_materials for all to authenticated
using ((select public.is_dcds_admin()))
with check ((select public.is_dcds_admin()));

-- Rubrics extend existing assignments and submissions rather than duplicating grades.
create policy "Enrolled students and admins view assignment rubric criteria"
on public.dcds_assignment_rubric_criteria for select to authenticated
using (
  (select public.is_dcds_admin())
  or exists (
    select 1 from public.assignments a
    join public.enrollments e on e.course_id = a.course_id
    where a.id = dcds_assignment_rubric_criteria.assignment_id
      and a.status = 'published'
      and e.user_id = (select auth.uid())
  )
);
create policy "DCDS admins manage assignment rubric criteria"
on public.dcds_assignment_rubric_criteria for all to authenticated
using ((select public.is_dcds_admin()))
with check ((select public.is_dcds_admin()));

create policy "Students view rubric scores on own submissions"
on public.dcds_assignment_rubric_scores for select to authenticated
using (
  (select public.is_dcds_admin())
  or exists (
    select 1 from public.assignment_submissions s
    where s.id = dcds_assignment_rubric_scores.submission_id
      and s.user_id = (select auth.uid())
  )
);
create policy "DCDS admins manage rubric scores"
on public.dcds_assignment_rubric_scores for all to authenticated
using ((select public.is_dcds_admin()))
with check ((select public.is_dcds_admin()));

-- Seed four practical career pathways. The catalogue slugs are resolved at read time.
insert into public.dcds_learning_paths
  (slug,title,summary,career_outcome,course_slugs,milestones,is_published,sort_order)
values
  ('creative-designer','Creative Designer','Build practical visual-design skills and learn to create polished digital assets for brands, social media and clients.','A starter portfolio of brand and social-media designs, with a clear route toward junior graphic-design work.','{graphic-design,ai-image-creativity}','[{"title":"Learn design fundamentals","detail":"Study layout, typography, colour and visual hierarchy."},{"title":"Create original design work","detail":"Complete practical brand and social-media design projects."},{"title":"Publish a portfolio","detail":"Select and present your strongest finished work."}]'::jsonb,true,10),
  ('video-content-creator','Video Content Creator','Learn to plan, edit and produce engaging video and animation content for digital platforms.','A collection of edited videos and animation samples suitable for a beginner creator portfolio.','{video-editing,ai-video-creativity,whiteboard-animation,3d-cartoon-animation}','[{"title":"Plan a story","detail":"Write a short concept and organise the footage or assets."},{"title":"Edit and animate","detail":"Practise timing, sound, titles and visual storytelling."},{"title":"Publish finished samples","detail":"Prepare several polished videos for a portfolio."}]'::jsonb,true,20),
  ('web-app-builder','Web & App Builder','Move from the basics of website design into building and presenting useful digital experiences.','A starter website or app project that demonstrates structure, user experience and core functionality.','{website-designing,app-building}','[{"title":"Plan a useful product","detail":"Define the audience, purpose and key screens."},{"title":"Design the experience","detail":"Build clear layouts and navigation."},{"title":"Complete a working project","detail":"Test and present a first website or app."}]'::jsonb,true,30),
  ('digital-business-growth','Digital Business & Growth','Combine AI productivity, affiliate marketing and social-media skills to support digital business activity.','A basic digital growth plan, content calendar and sample campaign assets.','{ai-tools-prompts,affiliate-marketing,social-media-management}','[{"title":"Build your AI workflow","detail":"Use prompts to research, plan and create responsibly."},{"title":"Understand digital marketing","detail":"Study audience, offers and affiliate disclosure."},{"title":"Prepare a growth campaign","detail":"Create a content calendar and measure useful outcomes."}]'::jsonb,true,40)
on conflict (slug) do nothing;
