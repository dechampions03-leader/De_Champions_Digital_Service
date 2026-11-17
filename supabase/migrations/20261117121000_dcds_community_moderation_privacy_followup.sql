-- Close one-way block visibility, let authors see moderation states,
-- and add immutable audit events for independent community age/guardian review.

drop policy "Room members and DCDS admins view community messages"
on public.dcds_community_messages;
create policy "Room members and DCDS admins view community messages"
on public.dcds_community_messages for select to authenticated
using (
  (select public.is_dcds_admin())
  or (
    author_id = (select auth.uid())
  )
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
      where (b.blocker_user_id = (select auth.uid()) and b.blocked_user_id = dcds_community_messages.author_id)
         or (b.blocker_user_id = dcds_community_messages.author_id and b.blocked_user_id = (select auth.uid()))
    )
  )
);

drop policy "Community members view approved posts and own submissions"
on public.dcds_community_posts;
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
      where (b.blocker_user_id = (select auth.uid()) and b.blocked_user_id = dcds_community_posts.author_id)
         or (b.blocker_user_id = dcds_community_posts.author_id and b.blocked_user_id = (select auth.uid()))
    )
  )
);

alter table public.dcds_community_moderation_actions
  drop constraint if exists dcds_community_moderation_actions_object_type_check,
  add constraint dcds_community_moderation_actions_object_type_check
    check (object_type in ('message','post','report','credential','membership','access','live_session','age_review'));

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
  v_old_status := coalesce(old_json ->> 'status',old_json ->> 'verification_status');
  v_new_status := coalesce(new_json ->> 'status',new_json ->> 'verification_status');

  if v_old_status is not distinct from v_new_status or (select auth.uid()) is null then
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

create trigger dcds_community_audit_age_request_status
after update of status on public.dcds_community_age_requests
for each row execute function private.dcds_community_audit_status_change();
create trigger dcds_community_audit_guardian_consent_status
after update of status on public.dcds_community_guardian_consents
for each row execute function private.dcds_community_audit_status_change();
