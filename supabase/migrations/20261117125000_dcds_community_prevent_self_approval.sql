create or replace function private.dcds_community_prevent_self_access_approval()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'approved'
     and old.status is distinct from new.status
     and new.user_id = (select auth.uid()) then
    raise exception 'A different authorised DCDS administrator must approve your own community membership.';
  end if;
  return new;
end;
$$;
create trigger dcds_community_prevent_self_access_approval
before update of status on public.dcds_community_access_requests
for each row execute function private.dcds_community_prevent_self_access_approval();
