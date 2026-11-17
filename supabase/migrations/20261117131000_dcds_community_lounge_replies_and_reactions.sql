-- DCDS Student Community Lounge: questions, projects, achievements,
-- threaded replies/comments and safe reactions.

alter table public.dcds_community_posts
  add column if not exists post_type text not null default 'project'
  check (post_type in ('question','project','achievement'));

create table public.dcds_community_post_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.dcds_community_posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1200),
  status text not null default 'pending' check (status in ('pending','visible','hidden','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dcds_community_post_replies_no_external_links
    check (body !~* '(https?://|www\.|t\.me/|wa\.me/|bit\.ly/|tinyurl\.com)')
);
create index dcds_community_post_replies_post_idx
  on public.dcds_community_post_replies(post_id,status,created_at asc);
create index dcds_community_post_replies_author_idx
  on public.dcds_community_post_replies(author_id,created_at desc);

create table public.dcds_community_post_reactions (
  post_id uuid not null references public.dcds_community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction_type text not null check (reaction_type in ('helpful','celebrate','support')),
  created_at timestamptz not null default now(),
  primary key(post_id,user_id,reaction_type)
);
create index dcds_community_post_reactions_post_idx
  on public.dcds_community_post_reactions(post_id,reaction_type);

create or replace function private.dcds_community_post_reply_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cohort text;
  v_recent integer;
begin
  select r.cohort into v_cohort
  from public.dcds_community_posts p
  join public.dcds_community_rooms r on r.id=p.room_id
  where p.id=new.post_id and p.status='approved' and r.is_active;

  if not found then
    raise exception 'Replies are available only on approved community posts.';
  end if;

  if (select public.is_dcds_admin()) then
    new.status := 'visible';
    return new;
  end if;

  select count(*)::integer into v_recent
  from public.dcds_community_post_replies
  where author_id=(select auth.uid())
    and created_at > now()-interval '60 seconds';
  if v_recent >= 8 then
    raise exception 'Reply limit reached. Please wait before commenting again.';
  end if;

  if v_cohort='teen_13_17' then
    new.status := 'pending';
  else
    new.status := 'visible';
  end if;

  return new;
end;
$$;
create trigger dcds_community_post_reply_guard
before insert on public.dcds_community_post_replies
for each row execute function private.dcds_community_post_reply_guard();

revoke all on public.dcds_community_post_replies from anon,authenticated;
revoke all on public.dcds_community_post_reactions from anon,authenticated;
grant select,insert,update on public.dcds_community_post_replies to authenticated;
grant select,insert,delete on public.dcds_community_post_reactions to authenticated;

alter table public.dcds_community_post_replies enable row level security;
alter table public.dcds_community_post_reactions enable row level security;

create policy "Authors admins and approved room members view replies"
on public.dcds_community_post_replies for select to authenticated
using (
  (select public.is_dcds_admin())
  or author_id=(select auth.uid())
  or (
    status='visible'
    and (select private.dcds_community_has_current_rules())
    and exists (
      select 1 from public.dcds_community_posts p
      join public.dcds_community_memberships m on m.room_id=p.room_id
      where p.id=dcds_community_post_replies.post_id
        and p.status='approved'
        and m.user_id=(select auth.uid())
        and m.status='active'
    )
    and not exists (
      select 1 from public.dcds_community_blocks b
      where (b.blocker_user_id=(select auth.uid()) and b.blocked_user_id=dcds_community_post_replies.author_id)
         or (b.blocker_user_id=dcds_community_post_replies.author_id and b.blocked_user_id=(select auth.uid()))
    )
  )
);
create policy "Rule-accepted room members reply to approved posts"
on public.dcds_community_post_replies for insert to authenticated
with check (
  author_id=(select auth.uid())
  and (select private.dcds_community_has_current_rules())
  and exists (
    select 1 from public.dcds_community_posts p
    join public.dcds_community_memberships m on m.room_id=p.room_id
    where p.id=dcds_community_post_replies.post_id
      and p.status='approved'
      and m.user_id=(select auth.uid())
      and m.status='active'
  )
);
create policy "DCDS admins moderate replies"
on public.dcds_community_post_replies for update to authenticated
using ((select public.is_dcds_admin()))
with check ((select public.is_dcds_admin()));

create policy "Room members who accepted rules view post reactions"
on public.dcds_community_post_reactions for select to authenticated
using (
  (select public.is_dcds_admin())
  or (
    (select private.dcds_community_has_current_rules())
    and exists (
      select 1 from public.dcds_community_posts p
      join public.dcds_community_memberships m on m.room_id=p.room_id
      where p.id=dcds_community_post_reactions.post_id
        and p.status='approved'
        and m.user_id=(select auth.uid())
        and m.status='active'
    )
  )
);
create policy "Room members add reactions to approved posts"
on public.dcds_community_post_reactions for insert to authenticated
with check (
  user_id=(select auth.uid())
  and (select private.dcds_community_has_current_rules())
  and exists (
    select 1 from public.dcds_community_posts p
    join public.dcds_community_memberships m on m.room_id=p.room_id
    where p.id=dcds_community_post_reactions.post_id
      and p.status='approved'
      and m.user_id=(select auth.uid())
      and m.status='active'
  )
);
create policy "Students remove their own post reactions"
on public.dcds_community_post_reactions for delete to authenticated
using (user_id=(select auth.uid()));

alter table public.dcds_community_reports
  drop constraint if exists dcds_community_reports_object_type_check,
  add constraint dcds_community_reports_object_type_check
    check (object_type in ('message','post','reply'));

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
  if v_old_status is not distinct from v_new_status then return new; end if;

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
  elsif table_name = 'dcds_community_post_replies' then
    v_object_type := 'reply';
    v_action := case v_new_status when 'visible' then 'publish' when 'hidden' then 'hide' when 'removed' then 'remove' else 'note' end;
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
  values ((select auth.uid()),v_target_user_id,v_object_type,v_object_id,v_action,
    'Status changed from ' || coalesce(v_old_status,'unknown') || ' to ' || coalesce(v_new_status,'unknown'));
  return new;
end;
$$;

alter table public.dcds_community_moderation_actions
  drop constraint if exists dcds_community_moderation_actions_object_type_check,
  add constraint dcds_community_moderation_actions_object_type_check
    check (object_type in ('message','post','reply','report','credential','membership','access','live_session','age_review','profile'));

create trigger dcds_community_audit_reply_status
after update of status on public.dcds_community_post_replies
for each row execute function private.dcds_community_audit_status_change();

drop policy "Room members report visible community content"
on public.dcds_community_reports;
create policy "Room members report visible community content"
on public.dcds_community_reports for insert to authenticated
with check (
  reporter_user_id=(select auth.uid())
  and status='open'
  and assigned_to is null
  and reviewed_at is null
  and (select private.dcds_community_has_current_rules())
  and exists (
    select 1 from public.dcds_community_memberships m
    where m.room_id=dcds_community_reports.room_id
      and m.user_id=(select auth.uid())
      and m.status='active'
  )
  and (
    (object_type='message' and exists (
      select 1 from public.dcds_community_messages x
      where x.id=dcds_community_reports.object_id
        and x.room_id=dcds_community_reports.room_id
        and x.author_id=dcds_community_reports.reported_user_id
        and x.status='visible'
    ))
    or
    (object_type='post' and exists (
      select 1 from public.dcds_community_posts x
      where x.id=dcds_community_reports.object_id
        and x.room_id=dcds_community_reports.room_id
        and x.author_id=dcds_community_reports.reported_user_id
        and x.status='approved'
    ))
    or
    (object_type='reply' and exists (
      select 1 from public.dcds_community_post_replies x
      join public.dcds_community_posts p on p.id=x.post_id
      where x.id=dcds_community_reports.object_id
        and p.room_id=dcds_community_reports.room_id
        and x.author_id=dcds_community_reports.reported_user_id
        and x.status='visible'
    ))
  )
);

comment on table public.dcds_community_post_replies is 'Threaded discussion replies and project comments. Teen replies remain pending until moderation.';
comment on table public.dcds_community_post_reactions is 'Simple positive reactions on approved posts, restricted to the same age cohort.';
