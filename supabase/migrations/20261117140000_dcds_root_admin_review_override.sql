-- Preserve the self-review safeguard for all moderators/admins while allowing
-- the explicitly designated DCDS super_admin (system owner) to review their
-- own adult age declaration and related community access request.
create or replace function private.dcds_community_age_review_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_is_root boolean := exists (
    select 1
    from public.admin_users au
    where au.user_id = (select auth.uid())
      and au.role = 'super_admin'
  );
begin
  if new.status = 'verified' and old.status is distinct from new.status then
    if new.user_id = (select auth.uid()) and not v_is_root then
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

create or replace function private.dcds_community_prevent_self_access_approval()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_is_root boolean := exists (
    select 1
    from public.admin_users au
    where au.user_id = (select auth.uid())
      and au.role = 'super_admin'
  );
begin
  if new.status = 'approved'
     and old.status is distinct from new.status
     and new.user_id = (select auth.uid())
     and not v_is_root then
    raise exception 'A different authorised DCDS administrator must approve your own community membership.';
  end if;
  return new;
end;
$$;
