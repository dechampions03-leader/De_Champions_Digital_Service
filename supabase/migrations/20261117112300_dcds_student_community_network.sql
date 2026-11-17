-- DCDS Student Community & Professional Network
-- Age-separated group chat, student community profiles, private credentials,
-- moderated project sharing, reporting/blocking and administrator-hosted live sessions.
-- Under-13 accounts are deliberately excluded from social-community access.
-- Teen messages are held for moderator approval before they become visible.

create table public.dcds_community_access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  requested_cohort text not null check (requested_cohort in ('teen_13_17','adult_18_plus')),
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','suspended')),
  created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (review_note is null or char_length(review_note) <= 500),
  updated_at timestamptz not null default now()
);
create index dcds_community_access_requests_status_idx
  on public.dcds_community_access_requests(status,created_at desc);

create table public.dcds_community_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cohort text not null check (cohort in ('teen_13_17','adult_18_plus')),
  status text not null default 'active' check (status in ('active','suspended')),
  approved_by uuid not null references auth.users(id) on delete restrict,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index dcds_community_access_cohort_idx
  on public.dcds_community_access(cohort,status);

create table public.dcds_community_rooms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  cohort text not null check (cohort in ('teen_13_17','adult_18_plus')),
  room_type text not null check (room_type in ('general','project_showcase','study_help')),
  title text not null check (char_length(trim(title)) between 2 and 80),
  description text not null default '' check (char_length(description) <= 500),
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);
create index dcds_community_rooms_cohort_idx
  on public.dcds_community_rooms(cohort,is_active,sort_order);

insert into public.dcds_community_rooms(slug,cohort,room_type,title,description,sort_order) values
 ('teen-general','teen_13_17','general','Teen Community Lounge','A supervised space for age-appropriate conversation and encouragement',10),
 ('teen-projects','teen_13_17','project_showcase','Teen Project Showcase','Share creative work after DCDS moderator review',20),
 ('teen-study-help','teen_13_17','study_help','Teen Study Help','Ask learning questions and support classmates',30),
 ('adult-general','adult_18_plus','general','Adult Community Lounge','A professional community for adult DCDS learners',10),
 ('adult-projects','adult_18_plus','project_showcase','Adult Project Showcase','Share creative work after DCDS moderator review',20),
 ('adult-study-help','adult_18_plus','study_help','Adult Study Help','Ask learning questions and support classmates',30)
on conflict(slug) do nothing;

create table public.dcds_community_memberships (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.dcds_community_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'student' check (role in ('student','moderator')),
  status text not null default 'active' check (status in ('active','suspended','left')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(room_id,user_id)
);
create index dcds_community_memberships_user_idx
  on public.dcds_community_memberships(user_id,status,room_id);

-- A private helper exposes only a same-cohort boolean, never the other student's age band.
create or replace function private.dcds_community_same_cohort(p_other_user_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.dcds_community_access owner_access
    join public.dcds_community_access viewer_access
      on viewer_access.cohort = owner_access.cohort
     and viewer_access.status = 'active'
    where owner_access.user_id::text = p_other_user_id
      and owner_access.status = 'active'
      and viewer_access.user_id = (select auth.uid())
  );
$$;
revoke all on function private.dcds_community_same_cohort(text) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.dcds_community_same_cohort(text) to authenticated;

-- Admin approval provisions only the exact cohort that was independently age-reviewed.
create or replace function private.dcds_sync_community_access_request()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  verified_band text;
  verified_status text;
  guardian_status text;
begin
  if new.status = 'approved' and old.status is distinct from new.status then
    select age_band,access_status,guardian_consent_status
      into verified_band,verified_status,guardian_status
    from public.dcds_ai_access_eligibility
    where user_id = new.user_id;

    if not found or verified_status <> 'approved' then
      raise exception 'Community access requires an approved DCDS age-review record.';
    end if;

    if new.requested_cohort = 'adult_18_plus'
       and not (verified_band = '18_plus' and guardian_status = 'not_required') then
      raise exception 'Adult community access requires an approved 18+ age record.';
    end if;

    if new.requested_cohort = 'teen_13_17'
       and not (verified_band = '13_17' and guardian_status = 'verified') then
      raise exception 'Teen community access requires independently verified guardian consent.';
    end if;

    if verified_band = 'under_13' then
      raise exception 'Under-13 accounts are not eligible for social-community access.';
    end if;

    insert into public.dcds_community_access(user_id,cohort,status,approved_by,approved_at)
    values (new.user_id,new.requested_cohort,'active',new.reviewed_by,coalesce(new.reviewed_at,now()))
    on conflict(user_id) do update set
      cohort = excluded.cohort,
      status = 'active',
      approved_by = excluded.approved_by,
      approved_at = excluded.approved_at,
      updated_at = now();

    insert into public.dcds_community_memberships(room_id,user_id,role,status)
    select r.id,new.user_id,'student','active'
    from public.dcds_community_rooms r
    where r.cohort = new.requested_cohort and r.is_active
    on conflict(room_id,user_id) do update set
      status = 'active',
      role = 'student',
      updated_at = now();

  elsif new.status in ('rejected','suspended') and old.status is distinct from new.status then
    update public.dcds_community_access
    set status = 'suspended',updated_at = now()
    where user_id = new.user_id;

    update public.dcds_community_memberships
    set status = 'suspended',updated_at = now()
    where user_id = new.user_id;
  end if;

  return new;
end;
$$;

create trigger dcds_community_sync_access_request
after update of status on public.dcds_community_access_requests
for each row execute function private.dcds_sync_community_access_request();

create or replace function private.dcds_community_sync_suspension()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'suspended' and old.status is distinct from new.status then
    update public.dcds_community_memberships
    set status = 'suspended',updated_at = now()
    where user_id = new.user_id;
  elsif new.status = 'active' and old.status is distinct from new.status then
    update public.dcds_community_memberships
    set status = 'active',updated_at = now()
    where user_id = new.user_id and role = 'student';
  end if;
  return new;
end;
$$;
create trigger dcds_community_sync_suspension
after update of status on public.dcds_community_access
for each row execute function private.dcds_community_sync_suspension();

create table public.dcds_community_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 2 and 60),
  headline text not null default '' check (char_length(trim(headline)) <= 140),
  bio text not null default '' check (char_length(trim(bio)) <= 1200),
  skill_tags text[] not null default '{}',
  interest_tags text[] not null default '{}',
  avatar_path text,
  visibility text not null default 'private' check (visibility in ('cohort','private','pending_review')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(skill_tags) <= 20),
  check (cardinality(interest_tags) <= 20),
  check (avatar_path is null or avatar_path like (user_id::text || '/%'))
);
create index dcds_community_profiles_visibility_idx
  on public.dcds_community_profiles(visibility,updated_at desc);

create table public.dcds_community_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  credential_type text not null check (credential_type in ('course_certificate','academic_qualification','professional_certificate','award','other')),
  title text not null check (char_length(trim(title)) between 2 and 160),
  issuer text not null default '' check (char_length(trim(issuer)) <= 160),
  issued_year integer check (issued_year is null or issued_year between 1950 and 2100),
  storage_path text not null check (storage_path like (user_id::text || '/%')),
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected')),
  review_note text check (review_note is null or char_length(review_note) <= 500),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index dcds_community_credentials_user_idx
  on public.dcds_community_credentials(user_id,created_at desc);

create table public.dcds_community_posts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.dcds_community_rooms(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 3 and 140),
  body text not null default '' check (char_length(body) <= 2500),
  attachment_path text check (attachment_path is null or attachment_path like (author_id::text || '/%')),
  status text not null default 'pending' check (status in ('pending','approved','hidden','rejected')),
  moderator_note text check (moderator_note is null or char_length(moderator_note) <= 500),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dcds_community_posts_no_external_links
    check (body !~* '(https?://|www\.|t\.me/|wa\.me/|bit\.ly/|tinyurl\.com)')
);
create index dcds_community_posts_room_idx
  on public.dcds_community_posts(room_id,status,created_at desc);

create table public.dcds_community_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.dcds_community_rooms(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  status text not null default 'visible' check (status in ('pending','visible','hidden','removed')),
  created_at timestamptz not null default now(),
  constraint dcds_community_no_external_links
    check (body !~* '(https?://|www\.|t\.me/|wa\.me/|bit\.ly/|tinyurl\.com)')
);
create index dcds_community_messages_room_idx
  on public.dcds_community_messages(room_id,created_at desc);
create index dcds_community_messages_author_idx
  on public.dcds_community_messages(author_id,created_at desc);

create or replace function private.dcds_community_message_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  room_cohort text;
  recent_count integer;
begin
  select cohort into room_cohort
  from public.dcds_community_rooms
  where id = new.room_id and is_active;

  if not found then
    raise exception 'This community room is unavailable.';
  end if;

  if (select public.is_dcds_admin()) then
    new.status := 'visible';
  elsif room_cohort = 'teen_13_17' then
    new.status := 'pending';
  else
    new.status := 'visible';
  end if;

  select count(*)::integer into recent_count
  from public.dcds_community_messages
  where author_id = (select auth.uid())
    and created_at > now() - interval '60 seconds';

  if recent_count >= 8 then
    raise exception 'Community message limit reached. Please wait before posting again.';
  end if;

  if exists (
    select 1 from public.dcds_community_messages m
    where m.author_id = (select auth.uid())
      and m.body = new.body
      and m.created_at > now() - interval '10 minutes'
  ) then
    raise exception 'You have already sent this message. Please do not repeat it.';
  end if;

  return new;
end;
$$;
create trigger dcds_community_message_safety_guard
before insert on public.dcds_community_messages
for each row execute function private.dcds_community_message_guard();

create table public.dcds_community_blocks (
  blocker_user_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(blocker_user_id,blocked_user_id),
  check (blocker_user_id <> blocked_user_id)
);

create table public.dcds_community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid not null references auth.users(id) on delete cascade,
  room_id uuid not null references public.dcds_community_rooms(id) on delete cascade,
  object_type text not null check (object_type in ('message','post')),
  object_id uuid not null,
  reason text not null check (reason in ('spam','scam_or_money_request','harassment','impersonation','unsafe_content','other')),
  details text not null default '' check (char_length(details) <= 1500),
  status text not null default 'open' check (status in ('open','in_review','resolved','dismissed')),
  assigned_to uuid references auth.users(id) on delete set null,
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 1000),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  check (reporter_user_id <> reported_user_id)
);
create index dcds_community_reports_status_idx
  on public.dcds_community_reports(status,created_at desc);

create table public.dcds_community_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  moderator_user_id uuid not null references auth.users(id) on delete restrict,
  target_user_id uuid references auth.users(id) on delete set null,
  object_type text not null check (object_type in ('message','post','report','credential','membership','access','live_session')),
  object_id uuid,
  action text not null check (action in ('publish','hide','remove','reject','verify','suspend','restore','resolve_report','dismiss_report','note')),
  note text not null default '' check (char_length(note) <= 1500),
  created_at timestamptz not null default now()
);
create index dcds_community_moderation_actions_created_idx
  on public.dcds_community_moderation_actions(created_at desc);

create table public.dcds_community_live_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.dcds_community_rooms(id) on delete restrict,
  title text not null check (char_length(trim(title)) between 3 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Africa/Lagos',
  host_user_id uuid not null references auth.users(id) on delete restrict,
  cohost_user_id uuid references auth.users(id) on delete restrict,
  status text not null default 'scheduled' check (status in ('scheduled','cancelled','completed')),
  recording_enabled boolean not null default false check (recording_enabled = false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (cohost_user_id is null or cohost_user_id <> host_user_id)
);
create index dcds_community_live_sessions_room_idx
  on public.dcds_community_live_sessions(room_id,status,starts_at);

create table public.dcds_community_live_session_links (
  session_id uuid primary key references public.dcds_community_live_sessions(id) on delete cascade,
  meeting_url text not null check (meeting_url ~* '^https://'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.dcds_community_live_registrations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.dcds_community_live_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'registered' check (status in ('registered','cancelled')),
  registered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id,user_id)
);
create index dcds_community_live_registrations_user_idx
  on public.dcds_community_live_registrations(user_id,status,session_id);

create or replace function private.dcds_community_live_session_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  session_cohort text;
begin
  if not exists (select 1 from public.dcds_admins a where a.user_id = new.host_user_id) then
    raise exception 'The live-session host must be an authorised DCDS administrator.';
  end if;

  if new.cohost_user_id is not null
     and not exists (select 1 from public.dcds_admins a where a.user_id = new.cohost_user_id) then
    raise exception 'The co-host must be an authorised DCDS administrator.';
  end if;

  select cohort into session_cohort
  from public.dcds_community_rooms
  where id = new.room_id;

  if session_cohort = 'teen_13_17'
     and (new.cohost_user_id is null or not exists (
       select 1 from public.dcds_admins a where a.user_id = new.cohost_user_id
     )) then
    raise exception 'Teen live sessions require two authorised DCDS administrators: a host and a separate co-host.';
  end if;

  return new;
end;
$$;
create trigger dcds_community_live_session_guard
before insert or update on public.dcds_community_live_sessions
for each row execute function private.dcds_community_live_session_guard();

-- Private storage: profile images and post images are cohort-scoped; credentials are owner/admin only.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values
 ('dcds-community-avatars','dcds-community-avatars',false,3145728,array['image/jpeg','image/png','image/webp']),
 ('dcds-community-posts','dcds-community-posts',false,5242880,array['image/jpeg','image/png','image/webp']),
 ('dcds-community-credentials','dcds-community-credentials',false,8388608,array['application/pdf','image/jpeg','image/png'])
on conflict(id) do nothing;

-- Table grants are explicit. No anonymous role can access these resources.
revoke all on public.dcds_community_access_requests from anon,authenticated;
revoke all on public.dcds_community_access from anon,authenticated;
revoke all on public.dcds_community_rooms from anon,authenticated;
revoke all on public.dcds_community_memberships from anon,authenticated;
revoke all on public.dcds_community_profiles from anon,authenticated;
revoke all on public.dcds_community_credentials from anon,authenticated;
revoke all on public.dcds_community_posts from anon,authenticated;
revoke all on public.dcds_community_messages from anon,authenticated;
revoke all on public.dcds_community_blocks from anon,authenticated;
revoke all on public.dcds_community_reports from anon,authenticated;
revoke all on public.dcds_community_moderation_actions from anon,authenticated;
revoke all on public.dcds_community_live_sessions from anon,authenticated;
revoke all on public.dcds_community_live_session_links from anon,authenticated;
revoke all on public.dcds_community_live_registrations from anon,authenticated;

grant select,insert,update on public.dcds_community_access_requests to authenticated;
grant select,insert,update on public.dcds_community_access to authenticated;
grant select on public.dcds_community_rooms to authenticated;
grant select,insert,update on public.dcds_community_memberships to authenticated;
grant select,insert,update on public.dcds_community_profiles to authenticated;
grant select,insert,update,delete on public.dcds_community_credentials to authenticated;
grant select,insert,update on public.dcds_community_posts to authenticated;
grant select,insert,update on public.dcds_community_messages to authenticated;
grant select,insert,delete on public.dcds_community_blocks to authenticated;
grant select,insert,update on public.dcds_community_reports to authenticated;
grant select,insert on public.dcds_community_moderation_actions to authenticated;
grant select,insert,update on public.dcds_community_live_sessions to authenticated;
grant select,insert,update on public.dcds_community_live_session_links to authenticated;
grant select,insert,update on public.dcds_community_live_registrations to authenticated;

alter table public.dcds_community_access_requests enable row level security;
alter table public.dcds_community_access enable row level security;
alter table public.dcds_community_rooms enable row level security;
alter table public.dcds_community_memberships enable row level security;
alter table public.dcds_community_profiles enable row level security;
alter table public.dcds_community_credentials enable row level security;
alter table public.dcds_community_posts enable row level security;
alter table public.dcds_community_messages enable row level security;
alter table public.dcds_community_blocks enable row level security;
alter table public.dcds_community_reports enable row level security;
alter table public.dcds_community_moderation_actions enable row level security;
alter table public.dcds_community_live_sessions enable row level security;
alter table public.dcds_community_live_session_links enable row level security;
alter table public.dcds_community_live_registrations enable row level security;

create policy "Students read own community access request and admins review all"
on public.dcds_community_access_requests for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_dcds_admin()));

create policy "Verified age-reviewed students request community access"
on public.dcds_community_access_requests for insert to authenticated
with check (
  user_id = (select auth.uid())
  and status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
  and review_note is null
  and (select private.dcds_is_verified_ai_user())
  and exists (
    select 1 from public.dcds_ai_access_eligibility e
    where e.user_id = (select auth.uid())
      and e.access_status = 'approved'
      and (
        (e.age_band = '18_plus'
          and e.guardian_consent_status = 'not_required'
          and requested_cohort = 'adult_18_plus')
        or
        (e.age_band = '13_17'
          and e.guardian_consent_status = 'verified'
          and requested_cohort = 'teen_13_17')
      )
  )
);

create policy "DCDS admins manage community access requests"
on public.dcds_community_access_requests for update to authenticated
using ((select public.is_dcds_admin()))
with check ((select public.is_dcds_admin()));

create policy "Students view own community access and admins manage all"
on public.dcds_community_access for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_dcds_admin()));
create policy "DCDS admins manage community access"
on public.dcds_community_access for all to authenticated
using ((select public.is_dcds_admin()))
with check ((select public.is_dcds_admin()));

create policy "Approved cohort members view their community rooms"
on public.dcds_community_rooms for select to authenticated
using (
  (select public.is_dcds_admin())
  or exists (
    select 1 from public.dcds_community_access a
    where a.user_id = (select auth.uid())
      and a.cohort = dcds_community_rooms.cohort
      and a.status = 'active'
  )
);
create policy "DCDS admins manage community rooms"
on public.dcds_community_rooms for all to authenticated
using ((select public.is_dcds_admin()))
with check ((select public.is_dcds_admin()));

create policy "Students view own community memberships"
on public.dcds_community_memberships for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_dcds_admin()));
create policy "DCDS admins manage community memberships"
on public.dcds_community_memberships for all to authenticated
using ((select public.is_dcds_admin()))
with check ((select public.is_dcds_admin()));

create policy "Community members view same-cohort student profiles"
on public.dcds_community_profiles for select to authenticated
using (
  user_id = (select auth.uid())
  or (select public.is_dcds_admin())
  or (
    visibility = 'cohort'
    and (select private.dcds_community_same_cohort(user_id::text))
  )
);
create policy "Students create own community profile"
on public.dcds_community_profiles for insert to authenticated
with check (
  user_id = (select auth.uid())
  and visibility in ('private','pending_review')
  and exists (select 1 from public.dcds_community_access a
    where a.user_id = (select auth.uid()) and a.status = 'active')
  and (avatar_path is null or avatar_path like (select auth.uid())::text || '/%')
);
create policy "Students update own community profile"
on public.dcds_community_profiles for update to authenticated
using (user_id = (select auth.uid()) or (select public.is_dcds_admin()))
with check (
  (user_id = (select auth.uid())
    and visibility in ('private','pending_review')
    and exists (select 1 from public.dcds_community_access a
      where a.user_id = (select auth.uid()) and a.status = 'active')
    and (avatar_path is null or avatar_path like (select auth.uid())::text || '/%'))
  or (select public.is_dcds_admin())
);

create policy "Students view own credentials and admins review"
on public.dcds_community_credentials for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_dcds_admin()));
create policy "Approved students upload own private credentials"
on public.dcds_community_credentials for insert to authenticated
with check (
  user_id = (select auth.uid())
  and verification_status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
  and storage_path like (select auth.uid())::text || '/%'
  and exists (select 1 from public.dcds_community_access a
    where a.user_id = (select auth.uid()) and a.status = 'active')
);
create policy "DCDS admins review credentials"
on public.dcds_community_credentials for update to authenticated
using ((select public.is_dcds_admin()))
with check ((select public.is_dcds_admin()));
create policy "Students delete own pending credentials"
on public.dcds_community_credentials for delete to authenticated
using (user_id = (select auth.uid()) and verification_status = 'pending');

create policy "Community members view approved posts and own submissions"
on public.dcds_community_posts for select to authenticated
using (
  (select public.is_dcds_admin())
  or author_id = (select auth.uid())
  or (
    status = 'approved'
    and exists (
      select 1 from public.dcds_community_memberships m
      where m.room_id = dcds_community_posts.room_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    )
    and not exists (
      select 1 from public.dcds_community_blocks b
      where b.blocker_user_id = (select auth.uid())
        and b.blocked_user_id = dcds_community_posts.author_id
    )
  )
);
create policy "Community members submit pending posts"
on public.dcds_community_posts for insert to authenticated
with check (
  author_id = (select auth.uid())
  and status = 'pending'
  and exists (
    select 1 from public.dcds_community_memberships m
    where m.room_id = dcds_community_posts.room_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
  and (attachment_path is null or attachment_path like (select auth.uid())::text || '/%')
);
create policy "DCDS admins moderate community posts"
on public.dcds_community_posts for update to authenticated
using ((select public.is_dcds_admin()))
with check ((select public.is_dcds_admin()));
create policy "Students remove own pending posts"
on public.dcds_community_posts for delete to authenticated
using (author_id = (select auth.uid()) and status = 'pending');

create policy "Room members and DCDS admins view community messages"
on public.dcds_community_messages for select to authenticated
using (
  (select public.is_dcds_admin())
  or (
    status = 'visible'
    and exists (
      select 1 from public.dcds_community_memberships m
      where m.room_id = dcds_community_messages.room_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    )
    and not exists (
      select 1 from public.dcds_community_blocks b
      where b.blocker_user_id = (select auth.uid())
        and b.blocked_user_id = dcds_community_messages.author_id
    )
  )
  or (
    author_id = (select auth.uid())
    and status = 'pending'
  )
);
create policy "Room members and DCDS admins send moderated messages"
on public.dcds_community_messages for insert to authenticated
with check (
  author_id = (select auth.uid())
  and ((select public.is_dcds_admin()) or (select private.dcds_is_verified_ai_user()))
  and ((select public.is_dcds_admin()) or exists (
    select 1 from public.dcds_community_memberships m
    where m.room_id = dcds_community_messages.room_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  ))
);
create policy "DCDS admins moderate community messages"
on public.dcds_community_messages for update to authenticated
using ((select public.is_dcds_admin()))
with check ((select public.is_dcds_admin()));

create policy "Students manage own community blocks"
on public.dcds_community_blocks for select to authenticated
using (blocker_user_id = (select auth.uid()));
create policy "Students block another member of a shared room"
on public.dcds_community_blocks for insert to authenticated
with check (
  blocker_user_id = (select auth.uid())
  and exists (
    select 1 from public.dcds_community_memberships a
    join public.dcds_community_memberships b on b.room_id = a.room_id
    where a.user_id = (select auth.uid()) and a.status = 'active'
      and b.user_id = blocked_user_id and b.status = 'active'
  )
);
create policy "Students unblock users"
on public.dcds_community_blocks for delete to authenticated
using (blocker_user_id = (select auth.uid()));

create policy "Reporters and DCDS admins view community reports"
on public.dcds_community_reports for select to authenticated
using (reporter_user_id = (select auth.uid()) or (select public.is_dcds_admin()));
create policy "Room members report visible community content"
on public.dcds_community_reports for insert to authenticated
with check (
  reporter_user_id = (select auth.uid())
  and status = 'open'
  and assigned_to is null
  and reviewed_at is null
  and exists (
    select 1 from public.dcds_community_memberships m
    where m.room_id = dcds_community_reports.room_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
  and (
    (object_type = 'message' and exists (
      select 1 from public.dcds_community_messages x
      where x.id = dcds_community_reports.object_id and x.room_id = dcds_community_reports.room_id
        and x.author_id = dcds_community_reports.reported_user_id and x.status = 'visible'
    ))
    or
    (object_type = 'post' and exists (
      select 1 from public.dcds_community_posts x
      where x.id = dcds_community_reports.object_id and x.room_id = dcds_community_reports.room_id
        and x.author_id = dcds_community_reports.reported_user_id and x.status = 'approved'
    ))
  )
);
create policy "DCDS admins resolve community reports"
on public.dcds_community_reports for update to authenticated
using ((select public.is_dcds_admin()))
with check ((select public.is_dcds_admin()));

create policy "Only DCDS admins view community moderation audit"
on public.dcds_community_moderation_actions for select to authenticated
using ((select public.is_dcds_admin()));
create policy "Only DCDS admins write community moderation audit"
on public.dcds_community_moderation_actions for insert to authenticated
with check (
  moderator_user_id = (select auth.uid())
  and (select public.is_dcds_admin())
);

create policy "Room members and DCDS admins view community live sessions"
on public.dcds_community_live_sessions for select to authenticated
using (
  (select public.is_dcds_admin())
  or exists (
    select 1 from public.dcds_community_memberships m
    where m.room_id = dcds_community_live_sessions.room_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
);
create policy "DCDS admins schedule community live sessions"
on public.dcds_community_live_sessions for insert to authenticated
with check (
  (select public.is_dcds_admin())
  and host_user_id = (select auth.uid())
);
create policy "DCDS admins update community live sessions"
on public.dcds_community_live_sessions for update to authenticated
using ((select public.is_dcds_admin()))
with check ((select public.is_dcds_admin()));

create policy "Registered participants and DCDS admins view live meeting links"
on public.dcds_community_live_session_links for select to authenticated
using (
  (select public.is_dcds_admin())
  or exists (
    select 1 from public.dcds_community_live_registrations r
    join public.dcds_community_live_sessions s on s.id = r.session_id
    where r.session_id = dcds_community_live_session_links.session_id
      and r.user_id = (select auth.uid())
      and r.status = 'registered'
      and s.status = 'scheduled'
  )
);
create policy "DCDS admins manage live meeting links"
on public.dcds_community_live_session_links for all to authenticated
using ((select public.is_dcds_admin()))
with check ((select public.is_dcds_admin()));

create policy "Students and DCDS admins view live registrations"
on public.dcds_community_live_registrations for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_dcds_admin()));
create policy "Eligible students register for their cohort live sessions"
on public.dcds_community_live_registrations for insert to authenticated
with check (
  user_id = (select auth.uid())
  and status = 'registered'
  and exists (
    select 1 from public.dcds_community_live_sessions s
    join public.dcds_community_memberships m on m.room_id = s.room_id
    where s.id = dcds_community_live_registrations.session_id
      and s.status = 'scheduled'
      and s.starts_at > now()
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
);
create policy "Students cancel own live registration"
on public.dcds_community_live_registrations for update to authenticated
using (user_id = (select auth.uid()) and status = 'registered')
with check (user_id = (select auth.uid()) and status = 'cancelled');
create policy "DCDS admins manage live registrations"
on public.dcds_community_live_registrations for all to authenticated
using ((select public.is_dcds_admin()))
with check ((select public.is_dcds_admin()));

-- Private object access, separate for avatars, work samples, and credentials.
create policy "Community members view own or same-cohort avatars"
on storage.objects for select to authenticated
using (
  bucket_id = 'dcds-community-avatars'
  and (
    split_part(name,'/',1) = (select auth.uid())::text
    or (select public.is_dcds_admin())
    or (
      (select private.dcds_community_same_cohort(split_part(name,'/',1)))
      and exists (
        select 1 from public.dcds_community_profiles p
        where p.user_id::text = split_part(storage.objects.name,'/',1)
          and p.visibility = 'cohort'
          and p.avatar_path = storage.objects.name
      )
    )
  )
);
create policy "Students upload own community avatar"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'dcds-community-avatars'
  and split_part(name,'/',1) = (select auth.uid())::text
  and exists (select 1 from public.dcds_community_access a
    where a.user_id = (select auth.uid()) and a.status = 'active')
);
create policy "Students update own community avatar"
on storage.objects for update to authenticated
using (bucket_id = 'dcds-community-avatars' and split_part(name,'/',1) = (select auth.uid())::text)
with check (bucket_id = 'dcds-community-avatars' and split_part(name,'/',1) = (select auth.uid())::text);
create policy "Students delete own community avatar or admins delete"
on storage.objects for delete to authenticated
using (bucket_id = 'dcds-community-avatars' and (split_part(name,'/',1) = (select auth.uid())::text or (select public.is_dcds_admin())));

create policy "Owners and DCDS admins access private credentials"
on storage.objects for select to authenticated
using (
  bucket_id = 'dcds-community-credentials'
  and (split_part(name,'/',1) = (select auth.uid())::text or (select public.is_dcds_admin()))
);
create policy "Approved students upload own private credentials"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'dcds-community-credentials'
  and split_part(name,'/',1) = (select auth.uid())::text
  and exists (select 1 from public.dcds_community_access a
    where a.user_id = (select auth.uid()) and a.status = 'active')
);
create policy "Owners and DCDS admins delete private credentials"
on storage.objects for delete to authenticated
using (
  bucket_id = 'dcds-community-credentials'
  and (split_part(name,'/',1) = (select auth.uid())::text or (select public.is_dcds_admin()))
);

create policy "Owners and room members view approved community post media"
on storage.objects for select to authenticated
using (
  bucket_id = 'dcds-community-posts'
  and (
    split_part(name,'/',1) = (select auth.uid())::text
    or (select public.is_dcds_admin())
    or exists (
      select 1 from public.dcds_community_posts p
      join public.dcds_community_memberships m on m.room_id = p.room_id
      where p.attachment_path = storage.objects.name
        and p.status = 'approved'
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    )
  )
);
create policy "Community members upload own post media"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'dcds-community-posts'
  and split_part(name,'/',1) = (select auth.uid())::text
  and exists (select 1 from public.dcds_community_access a
    where a.user_id = (select auth.uid()) and a.status = 'active')
);
create policy "Owners and DCDS admins delete post media"
on storage.objects for delete to authenticated
using (
  bucket_id = 'dcds-community-posts'
  and (split_part(name,'/',1) = (select auth.uid())::text or (select public.is_dcds_admin()))
);

alter publication supabase_realtime add table public.dcds_community_messages;

comment on table public.dcds_community_access_requests is 'Community access requests require a separate admin decision after approved age review and guardian verification where applicable.';
comment on table public.dcds_community_access is 'Private age-cohort assignment; never exposed in student profiles.';
comment on table public.dcds_community_profiles is 'Community-only public profile fields; deliberately excludes date of birth, gender, phone and email.';
comment on table public.dcds_community_credentials is 'Private student credential metadata and protected file references; visible only to owner and authorised administrators.';
comment on table public.dcds_community_messages is 'Age-cohort room-only chat; external links blocked; teen posts held pending moderator approval.';
comment on table public.dcds_community_reports is 'Private abuse, scam, harassment and impersonation reports.';
comment on table public.dcds_community_live_session_links is 'Meeting destinations visible only to registered room members and DCDS administrators.';
