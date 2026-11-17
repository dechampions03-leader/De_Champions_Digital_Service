-- DCDS community-specific age assurance and guardian consent.
-- This is deliberately separate from DCDS AI eligibility: AI access rules do not
-- determine social-community access. Under-13 users cannot submit a community age request.

create table public.dcds_community_age_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  age_band text not null check (age_band in ('13_17','18_plus')),
  guardian_user_id uuid,
  guardian_consent_status text not null default 'not_required'
    check (guardian_consent_status in ('not_required','pending','verified','rejected')),
  status text not null default 'pending'
    check (status in ('pending','verified','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dcds_community_age_guardian_consistency check (
    (age_band = '18_plus' and guardian_user_id is null and guardian_consent_status = 'not_required')
    or
    (age_band = '13_17' and guardian_user_id is not null and guardian_user_id <> user_id
      and guardian_consent_status in ('pending','verified','rejected'))
  )
);
create index dcds_community_age_requests_status_idx
  on public.dcds_community_age_requests(status,age_band,created_at desc);

create table public.dcds_community_guardian_consents (
  id uuid primary key default gen_random_uuid(),
  age_request_id uuid not null unique references public.dcds_community_age_requests(id) on delete cascade,
  student_user_id uuid not null references auth.users(id) on delete cascade,
  guardian_user_id uuid not null,
  status text not null default 'pending' check (status in ('pending','verified','rejected')),
  guardian_note text not null default '' check (char_length(guardian_note) <= 500),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  check (student_user_id <> guardian_user_id),
  check ((status = 'pending' and confirmed_at is null) or (status in ('verified','rejected') and confirmed_at is not null))
);
create index dcds_community_guardian_consents_guardian_idx
  on public.dcds_community_guardian_consents(guardian_user_id,status,created_at desc);

create table public.dcds_community_age_verification_reviews (
  id uuid primary key default gen_random_uuid(),
  age_request_id uuid not null unique references public.dcds_community_age_requests(id) on delete cascade,
  reviewer_user_id uuid,
  evidence_reference text not null check (char_length(trim(evidence_reference)) between 6 and 120),
  review_note text not null default '' check (char_length(review_note) <= 1000),
  reviewed_at timestamptz not null default now()
);
create index dcds_community_age_verification_reviews_reviewed_idx
  on public.dcds_community_age_verification_reviews(reviewed_at desc);

-- This helper returns only a boolean. It never returns age or identity data.
create or replace function private.dcds_community_is_verified_adult(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.dcds_community_age_requests r
    join auth.users u on u.id = r.user_id
    where r.user_id = p_user_id
      and r.age_band = '18_plus'
      and r.status = 'verified'
      and coalesce(u.is_anonymous,false) is false
      and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
  );
$$;
revoke all on function private.dcds_community_is_verified_adult(uuid) from public,anon;
grant execute on function private.dcds_community_is_verified_adult(uuid) to authenticated;

create policy "Students read own community age request and admins review"
on public.dcds_community_age_requests for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_dcds_admin()));

create policy "Verified accounts submit age-band-only community age requests"
on public.dcds_community_age_requests for insert to authenticated
with check (
  user_id = (select auth.uid())
  and status = 'pending'
  and (
    (age_band = '18_plus'
      and guardian_user_id is null
      and guardian_consent_status = 'not_required')
    or
    (age_band = '13_17'
      and guardian_user_id is not null
      and guardian_user_id <> (select auth.uid())
      and guardian_consent_status = 'pending'
      and (select private.dcds_community_is_verified_adult(guardian_user_id)))
  )
  and (select private.dcds_is_verified_ai_user())
);

create policy "DCDS admins review community age requests"
on public.dcds_community_age_requests for update to authenticated
using ((select public.is_dcds_admin()))
with check ((select public.is_dcds_admin()));

create policy "Student guardian and admins read consent requests"
on public.dcds_community_guardian_consents for select to authenticated
using (
  student_user_id = (select auth.uid())
  or guardian_user_id = (select auth.uid())
  or (select public.is_dcds_admin())
);

create policy "Students request consent from an already verified adult DCDS account"
on public.dcds_community_guardian_consents for insert to authenticated
with check (
  student_user_id = (select auth.uid())
  and status = 'pending'
  and confirmed_at is null
  and exists (
    select 1 from public.dcds_community_age_requests a
    where a.id = age_request_id
      and a.user_id = (select auth.uid())
      and a.age_band = '13_17'
      and a.status = 'pending'
      and a.guardian_user_id = dcds_community_guardian_consents.guardian_user_id
      and a.guardian_consent_status = 'pending'
  )
  and (select private.dcds_community_is_verified_adult(guardian_user_id))
);

create policy "Verified adult guardian confirms or rejects own consent request"
on public.dcds_community_guardian_consents for update to authenticated
using (
  guardian_user_id = (select auth.uid())
  and status = 'pending'
  and (select private.dcds_community_is_verified_adult((select auth.uid())))
)
with check (
  guardian_user_id = (select auth.uid())
  and status in ('verified','rejected')
  and confirmed_at is not null
  and (select private.dcds_community_is_verified_adult((select auth.uid())))
);

-- A guardian's confirmation is recorded against the teen request. SECURITY DEFINER is
-- limited to this one validated transition because the guardian cannot directly edit
-- another student's age request row.
create or replace function private.dcds_community_apply_guardian_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.guardian_user_id is distinct from (select auth.uid())
     or new.status not in ('verified','rejected')
     or new.confirmed_at is null
     or not (select private.dcds_community_is_verified_adult((select auth.uid()))) then
    raise exception 'Only the linked verified adult guardian can confirm this consent.';
  end if;

  update public.dcds_community_age_requests
  set guardian_consent_status = new.status,updated_at = now()
  where id = new.age_request_id
    and user_id = new.student_user_id
    and guardian_user_id = new.guardian_user_id
    and age_band = '13_17'
    and status = 'pending';

  if not found then
    raise exception 'The teen age request is no longer awaiting guardian consent.';
  end if;

  return new;
end;
$$;
revoke all on function private.dcds_community_apply_guardian_consent() from public,anon,authenticated;
create trigger dcds_community_apply_guardian_consent
after update of status on public.dcds_community_guardian_consents
for each row execute function private.dcds_community_apply_guardian_consent();

create table policy_community_age_review_dml_guard (
  id integer primary key check (id=1)
);
drop table policy_community_age_review_dml_guard;

create policy "DCDS admins manage private community age review evidence"
on public.dcds_community_age_verification_reviews for select to authenticated
using ((select public.is_dcds_admin()));
create policy "DCDS admins create private community age review evidence"
on public.dcds_community_age_verification_reviews for insert to authenticated
with check (
  reviewer_user_id = (select auth.uid())
  and (select public.is_dcds_admin())
);

create or replace function private.dcds_community_age_review_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'verified' and old.status is distinct from new.status then
    if new.age_band = '13_17' and new.guardian_consent_status <> 'verified' then
      raise exception 'Teen community age requests require verified guardian consent.';
    end if;
    if new.age_band = '18_plus' and new.guardian_consent_status <> 'not_required' then
      raise exception 'Adult community age requests must not carry guardian requirements.';
    end if;
    if not exists (
      select 1 from public.dcds_community_age_verification_reviews v
      where v.age_request_id = new.id
        and v.reviewer_user_id = (select auth.uid())
    ) then
      raise exception 'A private DCDS age-assurance review record is required before approval.';
    end if;
  end if;
  return new;
end;
$$;
create trigger dcds_community_age_review_guard
before update of status on public.dcds_community_age_requests
for each row execute function private.dcds_community_age_review_guard();

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
    select age_band,status,guardian_consent_status
      into verified_band,verified_status,guardian_status
    from public.dcds_community_age_requests
    where user_id = new.user_id;

    if not found or verified_status <> 'verified' then
      raise exception 'Community access requires an approved community age review.';
    end if;

    if new.requested_cohort = 'adult_18_plus'
       and not (verified_band = '18_plus' and guardian_status = 'not_required') then
      raise exception 'Adult community access requires a verified 18+ community age record.';
    end if;

    if new.requested_cohort = 'teen_13_17'
       and not (verified_band = '13_17' and guardian_status = 'verified') then
      raise exception 'Teen community access requires independently verified guardian consent.';
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

drop policy "Verified age-reviewed students request community access"
on public.dcds_community_access_requests;
create policy "Verified community-age-approved students request community access"
on public.dcds_community_access_requests for insert to authenticated
with check (
  user_id = (select auth.uid())
  and status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
  and review_note is null
  and (select private.dcds_is_verified_ai_user())
  and exists (
    select 1 from public.dcds_community_age_requests e
    where e.user_id = (select auth.uid())
      and e.status = 'verified'
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

create or replace function private.dcds_suspend_community_if_age_review_revoked()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'verified' and new.status in ('rejected') then
    update public.dcds_community_access_requests
    set status = 'suspended',reviewed_at = now(),review_note = 'Community age review revoked; access suspended.'
    where user_id = new.user_id and status = 'approved';
  end if;
  return new;
end;
$$;
create trigger dcds_community_age_review_revoked
after update of status on public.dcds_community_age_requests
for each row execute function private.dcds_suspend_community_if_age_review_revoked();

revoke all on public.dcds_community_age_requests from anon,authenticated;
revoke all on public.dcds_community_guardian_consents from anon,authenticated;
revoke all on public.dcds_community_age_verification_reviews from anon,authenticated;
grant select,insert,update on public.dcds_community_age_requests to authenticated;
grant select,insert,update on public.dcds_community_guardian_consents to authenticated;
grant select,insert on public.dcds_community_age_verification_reviews to authenticated;

alter table public.dcds_community_age_requests enable row level security;
alter table public.dcds_community_guardian_consents enable row level security;
alter table public.dcds_community_age_verification_reviews enable row level security;

comment on table public.dcds_community_age_requests is 'Separate community age-band review. Stores no full date of birth or identity-document image; under-13 is not an eligible value.';
comment on table public.dcds_community_guardian_consents is 'Explicit authenticated guardian consent for a 13–17 community request.';
comment on table public.dcds_community_age_verification_reviews is 'Private administrator-only age-assurance references and review notes.';
