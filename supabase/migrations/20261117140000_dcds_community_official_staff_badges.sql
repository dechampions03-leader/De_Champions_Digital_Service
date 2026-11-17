create or replace function public.dcds_community_official_staff_ids(p_user_ids uuid[])
returns table(user_id uuid)
language sql
stable
security definer
set search_path = ''
as $function$
  select a.user_id
  from public.dcds_admins a
  where a.user_id = any(coalesce(p_user_ids,'{}'::uuid[]));
$function$;

revoke all on function public.dcds_community_official_staff_ids(uuid[]) from public,anon;
grant execute on function public.dcds_community_official_staff_ids(uuid[]) to authenticated;

comment on function public.dcds_community_official_staff_ids(uuid[]) is 'Returns only official DCDS administrator user IDs, enabling verified staff badges without exposing admin-table access.';
