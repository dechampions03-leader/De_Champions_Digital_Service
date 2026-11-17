-- DCDS Community hardening: correct link filters, make account deletion safe,
-- and write an immutable moderation audit record for privileged state changes.

alter table public.dcds_community_messages
  drop constraint if exists dcds_community_no_external_links,
  add constraint dcds_community_no_external_links
    check (body !~* '(https?://|www\.|t\.me/|wa\.me/|bit\.ly/|tinyurl\.com)');

alter table public.dcds_community_posts
  drop constraint if exists dcds_community_posts_no_external_links,
  add constraint dcds_community_posts_no_external_links
    check (body !~* '(https?://|www\.|t\.me/|wa\.me/|bit\.ly/|tinyurl\.com)');

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
    return new;
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

-- Removing a student account should cascade their content. Removing a reviewer
-- should not strand community access or moderation history.
alter table public.dcds_community_access
  alter column approved_by drop not null,
  drop constraint dcds_community_access_approved_by_fkey,
  add constraint dcds_community_access_approved_by_fkey
    foreign key (approved_by) references auth.users(id) on delete set null;

alter table public.dcds_community_moderation_actions
  alter column moderator_user_id drop not null,
  drop constraint dcds_community_moderation_actions_moderator_user_id_fkey,
  add constraint dcds_community_moderation_actions_moderator_user_id_fkey
    foreign key (moderator_user_id) references auth.users(id) on delete set null;

alter table public.dcds_community_live_sessions
  drop constraint dcds_community_live_sessions_host_user_id_fkey,
  add constraint dcds_community_live_sessions_host_user_id_fkey
    foreign key (host_user_id) references auth.users(id) on delete cascade,
  drop constraint dcds_community_live_sessions_cohost_user_id_fkey,
  add constraint dcds_community_live_sessions_cohost_user_id_fkey
    foreign key (cohost_user_id) references auth.users(id) on delete cascade;

alter table public.dcds_community_live_session_links
  alter column created_by drop not null,
  drop constraint dcds_community_live_session_links_created_by_fkey,
  add constraint dcds_community_live_session_links_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

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
  v_old_status := old_json ->> 'status';
  v_new_status := new_json ->> 'status';

  if v_old_status is not distinct from v_new_status or (select auth.uid()) is null then
    return new;
  end if;

  v_object_id := coalesce(
    nullif(new_json ->> 'id','')::uuid,
    nullif(new_json ->> 'user_id','')::uuid
  );
  v_target_user_id := coalesce(
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

create trigger dcds_community_audit_message_status
after update of status on public.dcds_community_messages
for each row execute function private.dcds_community_audit_status_change();
create trigger dcds_community_audit_post_status
after update of status on public.dcds_community_posts
for each row execute function private.dcds_community_audit_status_change();
create trigger dcds_community_audit_access_request_status
after update of status on public.dcds_community_access_requests
for each row execute function private.dcds_community_audit_status_change();
create trigger dcds_community_audit_access_status
after update of status on public.dcds_community_access
for each row execute function private.dcds_community_audit_status_change();
create trigger dcds_community_audit_credential_status
after update of verification_status on public.dcds_community_credentials
for each row execute function private.dcds_community_audit_status_change();
create trigger dcds_community_audit_report_status
after update of status on public.dcds_community_reports
for each row execute function private.dcds_community_audit_status_change();
create trigger dcds_community_audit_membership_status
after update of status on public.dcds_community_memberships
for each row execute function private.dcds_community_audit_status_change();
create trigger dcds_community_audit_live_session_status
after update of status on public.dcds_community_live_sessions
for each row execute function private.dcds_community_audit_status_change();
