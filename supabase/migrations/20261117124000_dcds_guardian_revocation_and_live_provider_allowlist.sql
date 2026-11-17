-- Guardian consent can be explicitly revoked later. Revocation rejects the
-- dependent teen community age request and cascades a community access suspension.

drop policy "Verified adult guardian confirms or rejects own consent request"
on public.dcds_community_guardian_consents;
create policy "Verified adult guardian confirms or revokes own consent"
on public.dcds_community_guardian_consents for update to authenticated
using (
  guardian_user_id = (select auth.uid())
  and status in ('pending','verified')
  and (select private.dcds_community_is_verified_adult((select auth.uid())))
)
with check (
  guardian_user_id = (select auth.uid())
  and status in ('verified','rejected')
  and confirmed_at is not null
  and (select private.dcds_community_is_verified_adult((select auth.uid())))
);

create or replace function private.dcds_community_apply_guardian_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.guardian_user_id is distinct from (select auth.uid())
     or not (
       (old.status = 'pending' and new.status in ('verified','rejected'))
       or (old.status = 'verified' and new.status = 'rejected')
     )
     or new.confirmed_at is null
     or not (select private.dcds_community_is_verified_adult((select auth.uid()))) then
    raise exception 'Only the linked verified adult guardian can confirm or revoke this consent.';
  end if;

  update public.dcds_community_age_requests
  set guardian_consent_status = new.status,
      status = case when new.status = 'rejected' then 'rejected' else status end,
      updated_at = now()
  where id = new.age_request_id
    and user_id = new.student_user_id
    and guardian_user_id = new.guardian_user_id
    and age_band = '13_17'
    and (
      (old.status = 'pending' and status = 'pending')
      or (old.status = 'verified' and status = 'verified')
    );

  if not found then
    raise exception 'The teen age request is no longer in a state that can accept this guardian decision.';
  end if;

  return new;
end;
$$;

alter table public.dcds_community_live_session_links
  drop constraint if exists dcds_community_live_session_provider_check,
  add constraint dcds_community_live_session_provider_check
    check (
      meeting_url ~* '^https://(meet\.google\.com|([a-z0-9-]+\.)*zoom\.us|teams\.microsoft\.com|([a-z0-9-]+\.)*webex\.com|meet\.jit\.si)(/|$)'
    );
