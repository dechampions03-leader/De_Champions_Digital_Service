-- DCDS Career & Mentorship Centre
-- Private student career profiles, verified mentor directory, mentorship workflow,
-- curated opportunities, applications and consent-based graduate outcomes.

create table public.dcds_career_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  headline text not null default '' check (length(trim(headline)) <= 140),
  career_goal text not null default '' check (length(trim(career_goal)) <= 500),
  bio text not null default '' check (length(trim(bio)) <= 2000),
  skill_tags text[] not null default '{}',
  interest_tags text[] not null default '{}',
  location text not null default '' check (length(trim(location)) <= 120),
  portfolio_url text,
  resume_url text,
  linkedin_url text,
  website_url text,
  open_to_opportunities boolean not null default false,
  updated_at timestamptz not null default now(),
  check (cardinality(skill_tags) <= 30),
  check (cardinality(interest_tags) <= 30),
  check (portfolio_url is null or portfolio_url ~* '^https?://'),
  check (resume_url is null or resume_url ~* '^https?://'),
  check (linkedin_url is null or linkedin_url ~* '^https?://'),
  check (website_url is null or website_url ~* '^https?://')
);
create index dcds_career_profiles_open_idx
  on public.dcds_career_profiles(open_to_opportunities,updated_at desc);

create table public.dcds_mentors (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(trim(display_name)) between 2 and 120),
  professional_title text not null check (length(trim(professional_title)) between 2 and 140),
  biography text not null check (length(trim(biography)) between 20 and 2500),
  expertise text[] not null default '{}',
  industry text not null default '' check (length(trim(industry)) <= 120),
  years_experience integer not null default 0 check (years_experience between 0 and 60),
  timezone text not null default 'Africa/Lagos',
  availability text not null default '' check (length(trim(availability)) <= 500),
  public_profile_url text check (public_profile_url is null or public_profile_url ~* '^https?://'),
  status text not null default 'draft' check (status in ('draft','active','suspended')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(expertise) <= 25)
);
create index dcds_mentors_directory_idx on public.dcds_mentors(status,industry,display_name);

create table public.dcds_mentorship_requests (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references public.dcds_mentors(id) on delete restrict,
  student_user_id uuid not null references auth.users(id) on delete cascade,
  goal text not null check (length(trim(goal)) between 10 and 1000),
  message text not null default '' check (length(trim(message)) <= 2000),
  preferred_schedule text not null default '' check (length(trim(preferred_schedule)) <= 500),
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','scheduled','completed','cancelled')),
  scheduled_at timestamptz,
  meeting_url text check (meeting_url is null or meeting_url ~* '^https?://'),
  admin_feedback text,
  student_feedback text check (student_feedback is null or length(student_feedback) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index dcds_mentorship_requests_student_idx
  on public.dcds_mentorship_requests(student_user_id,created_at desc);
create index dcds_mentorship_requests_mentor_idx
  on public.dcds_mentorship_requests(mentor_id,status,created_at desc);

create table public.dcds_career_opportunities (
  id uuid primary key default gen_random_uuid(),
  opportunity_type text not null
    check (opportunity_type in ('internship','job','freelance','scholarship','apprenticeship')),
  title text not null check (length(trim(title)) between 3 and 160),
  organisation text not null check (length(trim(organisation)) between 2 and 160),
  description text not null check (length(trim(description)) between 20 and 5000),
  requirements text not null default '' check (length(trim(requirements)) <= 3000),
  eligibility text not null default '' check (length(trim(eligibility)) <= 2000),
  location text not null default '' check (length(trim(location)) <= 160),
  is_remote boolean not null default false,
  application_url text check (application_url is null or application_url ~* '^https?://'),
  application_deadline date,
  status text not null default 'draft' check (status in ('draft','published','closed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index dcds_career_opportunities_board_idx
  on public.dcds_career_opportunities(status,application_deadline,created_at desc);
create index dcds_career_opportunities_type_idx
  on public.dcds_career_opportunities(opportunity_type,status);

create table public.dcds_career_applications (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.dcds_career_opportunities(id) on delete cascade,
  student_user_id uuid not null references auth.users(id) on delete cascade,
  resume_url text check (resume_url is null or resume_url ~* '^https?://'),
  portfolio_url text check (portfolio_url is null or portfolio_url ~* '^https?://'),
  cover_note text not null default '' check (length(trim(cover_note)) <= 3000),
  status text not null default 'submitted'
    check (status in ('submitted','reviewing','shortlisted','interview','offered','rejected','withdrawn')),
  admin_feedback text check (admin_feedback is null or length(admin_feedback) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id,student_user_id)
);
create index dcds_career_applications_student_idx
  on public.dcds_career_applications(student_user_id,created_at desc);
create index dcds_career_applications_opportunity_idx
  on public.dcds_career_applications(opportunity_id,status,created_at desc);

create table public.dcds_graduate_outcomes (
  id uuid primary key default gen_random_uuid(),
  student_user_id uuid not null unique references auth.users(id) on delete cascade,
  outcome_type text not null
    check (outcome_type in ('learning','building_portfolio','seeking_opportunities','internship','employed','freelance','entrepreneur','further_study')),
  job_title text not null default '' check (length(trim(job_title)) <= 160),
  organisation text not null default '' check (length(trim(organisation)) <= 160),
  industry text not null default '' check (length(trim(industry)) <= 120),
  location text not null default '' check (length(trim(location)) <= 160),
  employment_type text not null default ''
    check (employment_type in ('','full_time','part_time','contract','remote','self_employed','not_applicable')),
  started_on date,
  private_story text not null default '' check (length(trim(private_story)) <= 2500),
  consent_to_aggregate boolean not null default false,
  updated_at timestamptz not null default now()
);
create index dcds_graduate_outcomes_aggregate_idx
  on public.dcds_graduate_outcomes(consent_to_aggregate,outcome_type,updated_at desc);

-- Explicit Data API grants; RLS policies below decide which rows each student/admin can access.
revoke all on public.dcds_career_profiles from anon,authenticated;
revoke all on public.dcds_mentors from anon,authenticated;
revoke all on public.dcds_mentorship_requests from anon,authenticated;
revoke all on public.dcds_career_opportunities from anon,authenticated;
revoke all on public.dcds_career_applications from anon,authenticated;
revoke all on public.dcds_graduate_outcomes from anon,authenticated;

grant select,insert,update on public.dcds_career_profiles to authenticated;
grant select on public.dcds_mentors to authenticated;
grant insert,update,delete on public.dcds_mentors to authenticated;
grant select,insert,update on public.dcds_mentorship_requests to authenticated;
grant select on public.dcds_career_opportunities to authenticated;
grant insert,update,delete on public.dcds_career_opportunities to authenticated;
grant select,insert,update on public.dcds_career_applications to authenticated;
grant select,insert,update on public.dcds_graduate_outcomes to authenticated;

alter table public.dcds_career_profiles enable row level security;
alter table public.dcds_mentors enable row level security;
alter table public.dcds_mentorship_requests enable row level security;
alter table public.dcds_career_opportunities enable row level security;
alter table public.dcds_career_applications enable row level security;
alter table public.dcds_graduate_outcomes enable row level security;

create policy "Students view own career profile and admins view all"
on public.dcds_career_profiles for select to authenticated
using (student_user_id = (select auth.uid()) or (select public.is_dcds_admin()));
-- The profile key is user_id, not student_user_id; keep ownership checks on the key.
drop policy "Students view own career profile and admins view all" on public.dcds_career_profiles;
create policy "Students view own career profile and admins view all"
on public.dcds_career_profiles for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_dcds_admin()));
create policy "Verified students create own career profile"
on public.dcds_career_profiles for insert to authenticated
with check (user_id = (select auth.uid()) and (select private.dcds_is_verified_ai_user()));
create policy "Students update own career profile"
on public.dcds_career_profiles for update to authenticated
using (user_id = (select auth.uid()) or (select public.is_dcds_admin()))
with check (user_id = (select auth.uid()) or (select public.is_dcds_admin()));

create policy "Verified students view active mentors"
on public.dcds_mentors for select to authenticated
using (status = 'active' and (select private.dcds_is_verified_ai_user()));
create policy "DCDS admins manage mentor directory"
on public.dcds_mentors for all to authenticated
using ((select public.is_dcds_admin()))
with check ((select public.is_dcds_admin()));

create policy "Students view own mentorship requests"
on public.dcds_mentorship_requests for select to authenticated
using (student_user_id = (select auth.uid()) or (select public.is_dcds_admin()));
create policy "Verified students request mentorship"
on public.dcds_mentorship_requests for insert to authenticated
with check (
  student_user_id = (select auth.uid())
  and status = 'pending'
  and (select private.dcds_is_verified_ai_user())
  and exists (select 1 from public.dcds_mentors m where m.id = mentor_id and m.status = 'active')
);
create policy "Students cancel own mentorship requests"
on public.dcds_mentorship_requests for update to authenticated
using (student_user_id = (select auth.uid()) and status in ('pending','accepted','scheduled'))
with check (student_user_id = (select auth.uid()) and status = 'cancelled');
create policy "DCDS admins manage mentorship requests"
on public.dcds_mentorship_requests for all to authenticated
using ((select public.is_dcds_admin()))
with check ((select public.is_dcds_admin()));

create policy "Verified students view published career opportunities"
on public.dcds_career_opportunities for select to authenticated
using (status = 'published' and (select private.dcds_is_verified_ai_user()));
create policy "DCDS admins manage career opportunities"
on public.dcds_career_opportunities for all to authenticated
using ((select public.is_dcds_admin()))
with check ((select public.is_dcds_admin()));

create policy "Students view own career applications"
on public.dcds_career_applications for select to authenticated
using (student_user_id = (select auth.uid()) or (select public.is_dcds_admin()));
create policy "Verified students apply to published opportunities"
on public.dcds_career_applications for insert to authenticated
with check (
  student_user_id = (select auth.uid())
  and status = 'submitted'
  and (select private.dcds_is_verified_ai_user())
  and exists (
    select 1 from public.dcds_career_opportunities o
    where o.id = opportunity_id
      and o.status = 'published'
      and (o.application_deadline is null or o.application_deadline >= current_date)
  )
);
create policy "Students withdraw own career applications"
on public.dcds_career_applications for update to authenticated
using (student_user_id = (select auth.uid()) and status in ('submitted','reviewing'))
with check (student_user_id = (select auth.uid()) and status = 'withdrawn');
create policy "DCDS admins manage career applications"
on public.dcds_career_applications for all to authenticated
using ((select public.is_dcds_admin()))
with check ((select public.is_dcds_admin()));

create policy "Students view own graduate outcomes"
on public.dcds_graduate_outcomes for select to authenticated
using (student_user_id = (select auth.uid()) or (select public.is_dcds_admin()));
create policy "Verified students record own graduate outcome"
on public.dcds_graduate_outcomes for insert to authenticated
with check (student_user_id = (select auth.uid()) and (select private.dcds_is_verified_ai_user()));
create policy "Students update own graduate outcome"
on public.dcds_graduate_outcomes for update to authenticated
using (student_user_id = (select auth.uid()) or (select public.is_dcds_admin()))
with check (student_user_id = (select auth.uid()) or (select public.is_dcds_admin()));

comment on table public.dcds_career_profiles is 'Private student career profiles; no public email or phone fields are stored.';
comment on table public.dcds_mentors is 'Administrator-curated mentor directory; only active mentor profiles are visible to verified learners.';
comment on table public.dcds_mentorship_requests is 'Private student requests and administrator-coordinated mentor sessions.';
comment on table public.dcds_career_opportunities is 'Administrator-curated internships, jobs, freelance roles, scholarships and apprenticeships.';
comment on table public.dcds_career_applications is 'Private student applications and administrator feedback.';
comment on table public.dcds_graduate_outcomes is 'Private graduate outcomes; aggregate reporting requires explicit student consent.';
