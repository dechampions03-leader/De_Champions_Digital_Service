-- Ensure a student cannot review their own community age request.
create or replace function private.dcds_community_age_review_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'verified' and old.status is distinct from new.status then
    if new.user_id = (select auth.uid()) then
      raise exception 'A different authorised DCDS administrator must verify your community age request.';
    end if;

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

-- Admin-originated status/visibility changes are audited; guardian consent is
-- retained in its own consent record and must not be blocked by the admin audit RLS.
alter table public.dcds_community_moderation_actions
  drop constraint if exists dcds_community_moderation_actions_object_type_check,
  add constraint dcds_community_moderation_actions_object_type_check
    check (object_type in ('message','post','report','credential','membership','access','live_session','age_review','profile'));

create or replace function private.dcds_community_audit_status_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  old_json jsonb := to_jsonb(old);
  new_json jsonb := to_jsonb(new);
  table_name text := tg_table_name;
  v_action text;
  v_object_type text;
  v_object_id uuid;
  v_target_user_id uuid;
  v_old_status text;
  v_new_status text;
begin
  if not (select public.is_dcds_admin()) then
    return new;
  end if;

  v_old_status := coalesce(old_json ->> 'status',old_json ->> 'verification_status',old_json ->> 'visibility');
  v_new_status := coalesce(new_json ->> 'status',new_json ->> 'verification_status',new_json ->> 'visibility');

  if v_old_status is not distinct from v_new_status then
    return new;
  end if;

  v_object_id := nullif(new_json ->> 'id','')::uuid;
  v_target_user_id := coalesce(
    nullif(new_json ->> 'student_user_id','')::uuid,
    nullif(new_json ->> 'author_id','')::uuid,
    nullif(new_json ->> 'user_id','')::uuid,
    nullif(new_json ->> 'reporter_user_id','')::uuid
  );

  if table_name = 'dcds_community_messages' then
    v_object_type := 'message';
    v_action := case v_new_status when 'visible' then 'publish' when 'hidden' then 'hide' when 'removed' then 'remove' else 'note' end;
  elsif table_name = 'dcds_community_posts' then
    v_object_type := 'post';
    v_action := case v_new_status when 'approved' then 'publish' when 'hidden' then 'hide' when 'rejected' then 'reject' else 'note' end;
  elsif table_name in ('dcds_community_access_requests','dcds_community_access') then
    v_object_type := 'access';
    v_action := case v_new_status when 'approved' then 'restore' when 'active' then 'restore' when 'suspended' then 'suspend' when 'rejected' then 'reject' else 'note' end;
  elsif table_name = 'dcds_community_credentials' then
    v_object_type := 'credential';
    v_action := case v_new_status when 'verified' then 'verify' when 'rejected' then 'reject' else 'note' end;
  elsif table_name = 'dcds_community_reports' then
    v_object_type := 'report';
    v_action := case v_new_status when 'resolved' then 'resolve_report' when 'dismissed' then 'dismiss_report' else 'note' end;
  elsif table_name = 'dcds_community_memberships' then
    v_object_type := 'membership';
    v_action := case v_new_status when 'suspended' then 'suspend' when 'active' then 'restore' else 'note' end;
  elsif table_name = 'dcds_community_live_sessions' then
    v_object_type := 'live_session';
    v_action := case v_new_status when 'cancelled' then 'remove' when 'completed' then 'note' else 'note' end;
  elsif table_name = 'dcds_community_age_requests' then
    v_object_type := 'age_review';
    v_action := case v_new_status when 'verified' then 'verify' when 'rejected' then 'reject' else 'note' end;
  elsif table_name = 'dcds_community_guardian_consents' then
    v_object_type := 'age_review';
    v_action := case v_new_status when 'verified' then 'verify' when 'rejected' then 'reject' else 'note' end;
  elsif table_name = 'dcds_community_profiles' then
    v_object_type := 'profile';
    v_action := case v_new_status when 'cohort' then 'verify' when 'private' then 'hide' else 'note' end;
  else
    return new;
  end if;

  insert into public.dcds_community_moderation_actions(
    moderator_user_id,target_user_id,object_type,object_id,action,note
  )
  values (
    (select auth.uid()),
    v_target_user_id,
    v_object_type,
    v_object_id,
    v_action,
    'Status changed from ' || coalesce(v_old_status,'unknown') || ' to ' || coalesce(v_new_status,'unknown')
  );

  return new;
end;
$$;

create trigger dcds_community_audit_profile_visibility
after update of visibility on public.dcds_community_profiles
for each row execute function private.dcds_community_audit_status_change();
