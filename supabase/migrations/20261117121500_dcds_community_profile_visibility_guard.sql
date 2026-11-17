-- Allow students to maintain an already-approved cohort profile, but prevent
-- self-promotion from private/pending_review to cohort visibility.

create or replace function private.dcds_community_profile_visibility_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select public.is_dcds_admin()) then
    return new;
  end if;

  if new.user_id is distinct from (select auth.uid()) then
    raise exception 'Students may only edit their own community profile.';
  end if;

  if new.visibility = 'cohort' and old.visibility <> 'cohort' then
    raise exception 'A DCDS administrator must approve cohort profile visibility.';
  end if;

  if new.avatar_path is not null and new.avatar_path not like (select auth.uid())::text || '/%' then
    raise exception 'Profile image paths must belong to the signed-in student.';
  end if;

  return new;
end;
$$;

create trigger dcds_community_profile_visibility_guard
before update on public.dcds_community_profiles
for each row execute function private.dcds_community_profile_visibility_guard();

drop policy "Students update own community profile"
on public.dcds_community_profiles;
create policy "Students update own community profile"
on public.dcds_community_profiles for update to authenticated
using (user_id = (select auth.uid()) or (select public.is_dcds_admin()))
with check (
  (user_id = (select auth.uid())
    and exists (select 1 from public.dcds_community_access a
      where a.user_id = (select auth.uid()) and a.status = 'active')
    and (avatar_path is null or avatar_path like (select auth.uid())::text || '/%'))
  or (select public.is_dcds_admin())
);
