-- Require a mobile contact for every new DCDS email/password account.
-- Existing Auth users are not modified and can continue to sign in without interruption.
-- The current signup page sends the normalized number in dcds_phone_e164 metadata.
-- The existing auth.users AFTER INSERT referral trigger validates and records it in this private table.

create table if not exists public.dcds_student_contact_numbers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mobile_e164 text not null unique,
  created_at timestamptz not null default now(),
  constraint dcds_student_contact_numbers_e164_format
    check (mobile_e164 ~ '^\+[1-9][0-9]{7,14}$')
);

alter table public.dcds_student_contact_numbers enable row level security;
revoke all on table public.dcds_student_contact_numbers from public, anon, authenticated;
grant all on table public.dcds_student_contact_numbers to service_role;

create or replace function public.capture_dcds_referral_on_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  submitted_code text;
  submitted_phone text;
begin
  if new.email is null or pg_catalog.btrim(new.email) = '' then
    raise exception using
      errcode = '23514',
      message = 'A valid email address is required to create a DCDS account.';
  end if;

  if new.id is null then
    raise exception using
      errcode = '23514',
      message = 'A valid user identity is required to create a DCDS account.';
  end if;

  submitted_phone := pg_catalog.btrim(coalesce(new.raw_user_meta_data ->> 'dcds_phone_e164', ''));
  if submitted_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception using
      errcode = '23514',
      message = 'A valid international mobile number in E.164 format is required to create a DCDS account.';
  end if;

  -- The unique constraint prevents the same mobile number being registered twice,
  -- including simultaneous signup attempts. Any conflict rolls back Auth user creation.
  insert into public.dcds_student_contact_numbers (user_id, mobile_e164)
  values (new.id, submitted_phone);

  -- Preserve the existing worldwide referral-attribution behavior.
  submitted_code := pg_catalog.upper(pg_catalog.btrim(coalesce(new.raw_user_meta_data ->> 'dcds_referral_code', '')));
  if submitted_code = '' then
    return new;
  end if;

  insert into public.dcds_referrals (
    referrer_user_id,
    referred_user_id,
    referral_code,
    status
  )
  select
    a.user_id,
    new.id,
    a.referral_code,
    'attributed'
  from public.dcds_ambassadors a
  where a.referral_code = submitted_code
    and a.status = 'active'
    and a.user_id <> new.id
  on conflict (referred_user_id) do nothing;

  return new;
end;
$function$;

comment on table public.dcds_student_contact_numbers is
  'Private registry of required international mobile contact numbers captured at new DCDS signup. Not an SMS-verification ledger.';
comment on function public.capture_dcds_referral_on_signup() is
  'Requires and privately records each new DCDS signup mobile number, then preserves existing referral attribution behavior.';
