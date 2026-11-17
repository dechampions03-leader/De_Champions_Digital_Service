-- Final launch gate hardening: bind access/memberships to independently
-- reviewed age cohorts, require student acceptance of community rules, and
-- ensure guardian revocation can cascade suspension through a protected trigger.

create or replace function private.dcds_community_access_cohort_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_band text;
  v_age_status text;
  v_guardian_status text;
begin
  if new.status <> 'active' then
    return new;
  end if;

  select age_band,status,guardian_consent_status
    into v_band,v_age_status,v_guardian_status
  from public.dcds_community_age_requests
  where user_id = new.user_id;

  if not found or v_age_status <> 'verified' then
    raise exception 'Active community access requires an independently verified community age review.';
  end if;

  if new.cohort = 'teen_13_17'
     and not (v_band = '13_17' and v_guardian_status = 'verified') then
    raise exception 'Teen membership requires a verified 13–17 age review and guardian consent.';
  end if;

  if new.cohort = 'adult_18_plus'
     and not (v_band = '18_plus' and v_guardian_status = 'not_required') then
    raise exception 'Adult membership requires a verified 18+ age review.';
  end if;

  if not exists (select 1 from public.dcds_admins a where a.user_id = new.approved_by) then
    raise exception 'Community membership must be provisioned by an authorised DCDS administrator.';
  end if;

  return new;
end;
$$;
create trigger dcds_community_access_cohort_guard
before insert or update of cohort,status,approved_by on public.dcds_community_access
for each row execute function private.dcds_community_access_cohort_guard();

create or replace function private.dcds_community_membership_cohort_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_room_cohort text;
  v_user_cohort text;
  v_user_status text;
begin
  select cohort into v_room_cohort
  from public.dcds_community_rooms
  where id = new.room_id and is_active;

  if not found then
    raise exception 'Community room is not active.';
  end if;

  if new.role = 'moderator' then
    if not exists (select 1 from public.dcds_admins a where a.user_id = new.user_id) then
      raise exception 'Only an authorised DCDS administrator may be a community moderator.';
    end if;
    return new;
  end if;

  select cohort,status into v_user_cohort,v_user_status
  from public.dcds_community_access
  where user_id = new.user_id;

  if not found or v_user_status <> 'active' or v_user_cohort <> v_room_cohort then
    raise exception 'Student membership must match the approved active age cohort.';
  end if;

  return new;
end;
$$;
create trigger dcds_community_membership_cohort_guard
before insert or update of room_id,user_id,role,status on public.dcds_community_memberships
for each row execute function private.dcds_community_membership_cohort_guard();

-- The guardian-owned consent row is the only user-facing route into this
-- security-definer cascade. It changes no age band or review evidence.
create or replace function private.dcds_suspend_community_if_age_review_revoked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'verified' and new.status = 'rejected' then
    update public.dcds_community_access_requests
    set status = 'suspended',
        reviewed_at = now(),
        review_note = 'Community age review or guardian consent revoked; access suspended.'
    where user_id = new.user_id and status = 'approved';
  end if;
  return new;
end;
$$;
revoke all on function private.dcds_suspend_community_if_age_review_revoked() from public,anon,authenticated;

-- A student must accept this version before seeing rooms or using social features.
create table public.dcds_community_rule_acceptances (
  user_id uuid not null references auth.users(id) on delete cascade,
  rules_version text not null check (rules_version = '2026-11-17-v1'),
  accepted_at timestamptz not null default now(),
  primary key(user_id,rules_version)
);
create index dcds_community_rule_acceptances_version_idx
  on public.dcds_community_rule_acceptances(rules_version,accepted_at desc);

create or replace function private.dcds_community_has_current_rules()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.dcds_community_rule_acceptances a
    where a.user_id = (select auth.uid())
      and a.rules_version = '2026-11-17-v1'
  );
$$;
revoke all on function private.dcds_community_has_current_rules() from public,anon;
grant execute on function private.dcds_community_has_current_rules() to authenticated;

revoke all on public.dcds_community_rule_acceptances from anon,authenticated;
grant select,insert on public.dcds_community_rule_acceptances to authenticated;
alter table public.dcds_community_rule_acceptances enable row level security;
create policy "Students read own community rules acceptance and admins review"
on public.dcds_community_rule_acceptances for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_dcds_admin()));
create policy "Students accept current community rules once"
on public.dcds_community_rule_acceptances for insert to authenticated
with check (
  user_id = (select auth.uid())
  and rules_version = '2026-11-17-v1'
  and exists (select 1 from public.dcds_community_access a
    where a.user_id = (select auth.uid()) and a.status = 'active')
);

drop policy "Approved cohort members view their community rooms"
on public.dcds_community_rooms;
create policy "Approved cohort members who accepted rules view their rooms"
on public.dcds_community_rooms for select to authenticated
using (
  (select public.is_dcds_admin())
  or (
    (select private.dcds_community_has_current_rules())
    and exists (
      select 1 from public.dcds_community_access a
      where a.user_id = (select auth.uid())
        and a.cohort = dcds_community_rooms.cohort
        and a.status = 'active'
    )
  )
);

drop policy "Community members view same-cohort student profiles"
on public.dcds_community_profiles;
create policy "Community members who accepted rules view same-cohort profiles"
on public.dcds_community_profiles for select to authenticated
using (
  user_id = (select auth.uid())
  or (select public.is_dcds_admin())
  or (
    (select private.dcds_community_has_current_rules())
    and visibility = 'cohort'
    and (select private.dcds_community_same_cohort(user_id::text))
  )
);

drop policy "Community members view approved posts and own submissions"
on public.dcds_community_posts;
create policy "Community members who accepted rules view approved posts and own submissions"
on public.dcds_community_posts for select to authenticated
using (
  (select public.is_dcds_admin())
  or author_id = (select auth.uid())
  or (
    (select private.dcds_community_has_current_rules())
    and status = 'approved'
    and exists (
      select 1 from public.dcds_community_memberships m
      where m.room_id = dcds_community_posts.room_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    )
    and not exists (
      select 1 from public.dcds_community_blocks b
      where (b.blocker_user_id = (select auth.uid()) and b.blocked_user_id = dcds_community_posts.author_id)
         or (b.blocker_user_id = dcds_community_posts.author_id and b.blocked_user_id = (select auth.uid()))
    )
  )
);
drop policy "Community members submit pending posts"
on public.dcds_community_posts;
create policy "Community members who accepted rules submit pending posts"
on public.dcds_community_posts for insert to authenticated
with check (
  author_id = (select auth.uid())
  and (select private.dcds_community_has_current_rules())
  and status = 'pending'
  and exists (
    select 1 from public.dcds_community_memberships m
    where m.room_id = dcds_community_posts.room_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
  and (attachment_path is null or attachment_path like (select auth.uid())::text || '/%')
);

drop policy "Room members and DCDS admins view community messages"
on public.dcds_community_messages;
create policy "Room members who accepted rules and DCDS admins view messages"
on public.dcds_community_messages for select to authenticated
using (
  (select public.is_dcds_admin())
  or author_id = (select auth.uid())
  or (
    (select private.dcds_community_has_current_rules())
    and status = 'visible'
    and exists (
      select 1 from public.dcds_community_memberships m
      where m.room_id = dcds_community_messages.room_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    )
    and not exists (
      select 1 from public.dcds_community_blocks b
      where (b.blocker_user_id = (select auth.uid()) and b.blocked_user_id = dcds_community_messages.author_id)
         or (b.blocker_user_id = dcds_community_messages.author_id and b.blocked_user_id = (select auth.uid()))
    )
  )
);
drop policy "Room members and DCDS admins send moderated messages"
on public.dcds_community_messages;
create policy "Room members who accepted rules and DCDS admins send moderated messages"
on public.dcds_community_messages for insert to authenticated
with check (
  author_id = (select auth.uid())
  and (
    (select public.is_dcds_admin())
    or (
      (select private.dcds_is_verified_ai_user())
      and (select private.dcds_community_has_current_rules())
    )
  )
  and (
    (select public.is_dcds_admin())
    or exists (
      select 1 from public.dcds_community_memberships m
      where m.room_id = dcds_community_messages.room_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    )
  )
);

drop policy "Registered participants and DCDS admins view live meeting links"
on public.dcds_community_live_session_links;
create policy "Registered participants who accepted rules and DCDS admins view meeting links"
on public.dcds_community_live_session_links for select to authenticated
using (
  (select public.is_dcds_admin())
  or (
    (select private.dcds_community_has_current_rules())
    and exists (
      select 1 from public.dcds_community_live_registrations r
      join public.dcds_community_live_sessions s on s.id = r.session_id
      where r.session_id = dcds_community_live_session_links.session_id
        and r.user_id = (select auth.uid())
        and r.status = 'registered'
        and s.status = 'scheduled'
    )
  )
);

drop policy "Room members and DCDS admins view community live sessions"
on public.dcds_community_live_sessions;
create policy "Room members who accepted rules and DCDS admins view community live sessions"
on public.dcds_community_live_sessions for select to authenticated
using (
  (select public.is_dcds_admin())
  or (
    (select private.dcds_community_has_current_rules())
    and exists (
      select 1 from public.dcds_community_memberships m
      where m.room_id = dcds_community_live_sessions.room_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    )
  )
);

drop policy "Eligible students register for their cohort live sessions"
on public.dcds_community_live_registrations;
create policy "Eligible students who accepted rules register for cohort sessions"
on public.dcds_community_live_registrations for insert to authenticated
with check (
  user_id = (select auth.uid())
  and status = 'registered'
  and (select private.dcds_community_has_current_rules())
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

-- Enforce rule acceptance for same-cohort avatar and approved project media too.
drop policy "Community members view own or same-cohort avatars"
on storage.objects;
create policy "Community members who accepted rules view own or same-cohort avatars"
on storage.objects for select to authenticated
using (
  bucket_id = 'dcds-community-avatars'
  and (
    split_part(name,'/',1) = (select auth.uid())::text
    or (select public.is_dcds_admin())
    or (
      (select private.dcds_community_has_current_rules())
      and (select private.dcds_community_same_cohort(split_part(name,'/',1)))
      and exists (
        select 1 from public.dcds_community_profiles p
        where p.user_id::text = split_part(storage.objects.name,'/',1)
          and p.visibility = 'cohort'
          and p.avatar_path = storage.objects.name
      )
    )
  )
);

drop policy "Owners and room members view approved community post media"
on storage.objects;
create policy "Owners and rule-accepted room members view approved post media"
on storage.objects for select to authenticated
using (
  bucket_id = 'dcds-community-posts'
  and (
    split_part(name,'/',1) = (select auth.uid())::text
    or (select public.is_dcds_admin())
    or (
      (select private.dcds_community_has_current_rules())
      and exists (
        select 1 from public.dcds_community_posts p
        join public.dcds_community_memberships m on m.room_id = p.room_id
        where p.attachment_path = storage.objects.name
          and p.status = 'approved'
          and m.user_id = (select auth.uid())
          and m.status = 'active'
      )
    )
  )
);

comment on table public.dcds_community_rule_acceptances is 'Versioned record that a student accepted DCDS community safety rules before accessing social areas.';
