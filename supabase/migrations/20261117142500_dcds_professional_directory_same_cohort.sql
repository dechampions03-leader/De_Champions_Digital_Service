-- Return only approved profiles in the caller's active DCDS age cohort.
-- This function intentionally does not use the administrator bypass in the
-- direct table RLS policy: even root/admin views remain age-cohort restricted.
create or replace function public.dcds_community_directory_profiles(p_limit integer default 60)
returns table (
  user_id uuid,
  display_name text,
  headline text,
  bio text,
  skill_tags text[],
  interest_tags text[],
  avatar_path text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_limit integer := greatest(1, least(coalesce(p_limit, 60), 100));
begin
  if v_user_id is null then
    raise exception 'Sign in to view the DCDS Professional Directory.' using errcode = '42501';
  end if;

  if not coalesce((select private.dcds_community_has_current_rules()), false) then
    raise exception 'Accept the current DCDS Community Rules before viewing the directory.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.dcds_community_access viewer
    where viewer.user_id = v_user_id
      and viewer.status = 'active'
  ) then
    raise exception 'Active DCDS community membership is required.' using errcode = '42501';
  end if;

  return query
  select p.user_id, p.display_name, p.headline, p.bio,
         p.skill_tags, p.interest_tags, p.avatar_path
  from public.dcds_community_profiles p
  where p.visibility = 'cohort'
    and exists (
      select 1
      from public.dcds_community_access owner_access
      where owner_access.user_id = p.user_id
        and owner_access.status = 'active'
    )
    and private.dcds_community_same_cohort(p.user_id::text)
  order by lower(p.display_name), p.user_id
  limit v_limit;
end;
$$;

revoke all on function public.dcds_community_directory_profiles(integer) from public, anon;
grant execute on function public.dcds_community_directory_profiles(integer) to authenticated;

comment on function public.dcds_community_directory_profiles(integer) is
  'Returns only active, DCDS-approved professional profiles in the signed-in member''s own age cohort; deliberately ignores administrator-wide profile visibility.';