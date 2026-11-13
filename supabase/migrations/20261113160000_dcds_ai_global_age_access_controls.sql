create table if not exists public.dcds_ai_access_settings (
  id smallint primary key default 1 check (id = 1),
  adult_access_enabled boolean not null default false,
  teen_access_enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.dcds_ai_access_settings (id, adult_access_enabled, teen_access_enabled)
values (1, false, false)
on conflict (id) do nothing;

alter table public.dcds_ai_access_settings enable row level security;
revoke all on public.dcds_ai_access_settings from public, anon;
grant select, update on public.dcds_ai_access_settings to authenticated;

drop policy if exists "Authenticated users read DCDS AI access settings" on public.dcds_ai_access_settings;
create policy "Authenticated users read DCDS AI access settings"
on public.dcds_ai_access_settings for select
to authenticated
using (true);

drop policy if exists "DCDS administrators update AI access settings" on public.dcds_ai_access_settings;
create policy "DCDS administrators update AI access settings"
on public.dcds_ai_access_settings for update
to authenticated
using ((select public.is_dcds_admin()))
with check ((select public.is_dcds_admin()));

create or replace function private.dcds_stamp_ai_access_settings()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if not coalesce((select public.is_dcds_admin()), false) then
    raise exception 'Only authorised DCDS administrators can change AI age-access settings.'
      using errcode = '42501';
  end if;
  new.updated_by := (select auth.uid());
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists dcds_stamp_ai_access_settings on public.dcds_ai_access_settings;
create trigger dcds_stamp_ai_access_settings
before update on public.dcds_ai_access_settings
for each row execute function private.dcds_stamp_ai_access_settings();

create or replace function private.dcds_apply_ai_access_policy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.adult_access_enabled is true
     and old.adult_access_enabled is distinct from new.adult_access_enabled then
    update public.dcds_ai_access_eligibility as eligibility
       set access_status = 'approved',
           guardian_consent_status = 'not_required',
           guardian_user_id = null,
           guardian_consent_reference = null,
           guardian_consent_at = null,
           reviewed_by = new.updated_by,
           reviewed_at = now(),
           review_note = 'Approved by the global DCDS 18+ access policy after verified account contact and adult age-band declaration.'
      from auth.users as account
     where account.id = eligibility.user_id
       and account.is_anonymous is not true
       and (account.email_confirmed_at is not null or account.phone_confirmed_at is not null)
       and eligibility.age_band = '18_plus'
       and eligibility.access_status = 'pending'
       and eligibility.guardian_consent_status = 'not_required';
  end if;
  return new;
end;
$function$;

revoke all on function private.dcds_apply_ai_access_policy() from public, anon, authenticated;

drop trigger if exists dcds_apply_ai_access_policy on public.dcds_ai_access_settings;
create trigger dcds_apply_ai_access_policy
after update on public.dcds_ai_access_settings
for each row execute function private.dcds_apply_ai_access_policy();

create or replace function private.dcds_prepare_ai_eligibility_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_adult_access_enabled boolean := false;
  v_policy_admin_id uuid := null;
  v_verified_contact boolean := false;
begin
  if tg_op = 'INSERT' then
    select settings.adult_access_enabled, settings.updated_by
      into v_adult_access_enabled, v_policy_admin_id
      from public.dcds_ai_access_settings as settings
     where settings.id = 1;

    select exists (
      select 1 from auth.users as account
       where account.id = new.user_id
         and account.is_anonymous is not true
         and (account.email_confirmed_at is not null or account.phone_confirmed_at is not null)
    ) into v_verified_contact;

    if new.age_band = 'under_13' then
      new.access_status := 'blocked';
      new.guardian_consent_status := 'pending';
    elsif new.age_band = '18_plus' then
      new.guardian_consent_status := 'not_required';
      if v_adult_access_enabled and v_verified_contact and v_policy_admin_id is not null then
        new.access_status := 'approved';
        new.reviewed_by := v_policy_admin_id;
        new.reviewed_at := now();
        new.review_note := 'Automatically approved by the global DCDS 18+ access policy after verified account contact and adult age-band declaration.';
      else
        new.access_status := 'pending';
      end if;
    else
      new.access_status := 'pending';
      new.guardian_consent_status := 'pending';
    end if;

    new.guardian_user_id := null;
    new.guardian_consent_reference := null;
    new.guardian_consent_at := null;
    if new.access_status <> 'approved' then
      new.reviewed_by := null;
      new.reviewed_at := null;
      new.review_note := null;
    end if;
    new.created_at := now();
    new.updated_at := now();
  else
    new.updated_at := now();
  end if;
  return new;
end;
$function$;

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
        (
          access_status = 'pending'
          and reviewed_by is null
          and reviewed_at is null
        )
        or
        (
          access_status = 'approved'
          and exists (
            select 1
              from public.dcds_ai_access_settings as settings
              join auth.users as account on account.id = user_id
             where settings.id = 1
               and settings.adult_access_enabled is true
               and settings.updated_by = reviewed_by
               and reviewed_at is not null
               and account.is_anonymous is not true
               and (account.email_confirmed_at is not null or account.phone_confirmed_at is not null)
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
begin
  if new.access_status = 'approved'
     and v_actor_id is not null
     and new.user_id = v_actor_id
     and not (v_is_admin and new.age_band = '18_plus') then
    raise exception 'Only your own verified 18+ DCDS administrator account may be self-approved. Teen access requires independent guardian review.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;
