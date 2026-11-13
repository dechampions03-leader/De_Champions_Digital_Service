drop policy if exists "Users submit their own DCDS AI eligibility request" on public.dcds_ai_access_eligibility;
create policy "Users submit their own DCDS AI eligibility request"
on public.dcds_ai_access_eligibility for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and guardian_user_id is null
  and guardian_consent_reference is null
  and guardian_consent_at is null
  and (
    (
      age_band = '18_plus'
      and guardian_consent_status = 'not_required'
      and (
        (access_status = 'pending' and reviewed_by is null and reviewed_at is null)
        or
        (
          access_status = 'approved'
          and exists (
            select 1 from public.dcds_ai_access_settings as settings
             where settings.id = 1
               and settings.adult_access_enabled is true
               and settings.updated_by = reviewed_by
               and reviewed_at is not null
          )
        )
      )
    )
    or
    (
      age_band = '13_17'
      and access_status = 'pending'
      and guardian_consent_status = 'pending'
      and reviewed_by is null
      and reviewed_at is null
    )
    or
    (
      age_band = 'under_13'
      and access_status = 'blocked'
      and guardian_consent_status = 'pending'
      and reviewed_by is null
      and reviewed_at is null
    )
  )
);

create or replace function private.dcds_prevent_ai_self_approval()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_is_admin boolean := coalesce((select public.is_dcds_admin()), false);
  v_policy_auto_approval boolean := false;
begin
  if new.age_band = '18_plus' and new.access_status = 'approved' then
    select exists (
      select 1 from public.dcds_ai_access_settings as settings
       where settings.id = 1
         and settings.adult_access_enabled is true
         and settings.updated_by = new.reviewed_by
         and new.reviewed_at is not null
    ) into v_policy_auto_approval;
  end if;

  if new.access_status = 'approved'
     and v_actor_id is not null
     and new.user_id = v_actor_id
     and not (v_is_admin and new.age_band = '18_plus')
     and not v_policy_auto_approval then
    raise exception 'Only your own verified 18+ DCDS administrator account or the global verified-adult policy may approve this request. Teen access requires independent guardian review.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;
