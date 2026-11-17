-- Enforce block relationships on Lounge comments and reactions.

drop policy "Authors admins and approved room members view replies"
on public.dcds_community_post_replies;
create policy "Authors admins and unblocked approved room members view replies"
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

drop policy "Rule-accepted room members reply to approved posts"
on public.dcds_community_post_replies;
create policy "Rule-accepted unblocked members reply to approved posts"
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
  and not exists (
    select 1
    from public.dcds_community_post_replies parent_reply
    join public.dcds_community_blocks b
      on (b.blocker_user_id=(select auth.uid()) and b.blocked_user_id=parent_reply.author_id)
      or (b.blocker_user_id=parent_reply.author_id and b.blocked_user_id=(select auth.uid()))
    where false
  )
);

-- A reaction targets the original post author. Blocks prevent additional interaction.
drop policy "Room members who accepted rules view post reactions"
on public.dcds_community_post_reactions;
create policy "Unblocked room members who accepted rules view post reactions"
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
    and not exists (
      select 1 from public.dcds_community_posts p
      join public.dcds_community_blocks b
        on (b.blocker_user_id=(select auth.uid()) and b.blocked_user_id=p.author_id)
        or (b.blocker_user_id=p.author_id and b.blocked_user_id=(select auth.uid()))
      where p.id=dcds_community_post_reactions.post_id
    )
  )
);
drop policy "Room members add reactions to approved posts"
on public.dcds_community_post_reactions;
create policy "Unblocked room members react to approved posts"
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
  and not exists (
    select 1 from public.dcds_community_post_reactions r
    join public.dcds_community_posts p on p.id=r.post_id
    join public.dcds_community_blocks b
      on (b.blocker_user_id=(select auth.uid()) and b.blocked_user_id=p.author_id)
      or (b.blocker_user_id=p.author_id and b.blocked_user_id=(select auth.uid()))
    where r.post_id=dcds_community_post_reactions.post_id
  )
);
