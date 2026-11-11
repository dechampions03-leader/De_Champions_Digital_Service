-- DCDS dual-channel signup verification support.
-- Email signup continues to use Supabase's standard email confirmation flow.
-- The SMS channel remains disabled until a production SMS provider is configured.

create table if not exists public.dcds_auth_settings (
  setting_key text primary key,
  setting_value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.dcds_auth_settings(setting_key, setting_value)
values ('phone_otp_enabled', 'false'::jsonb)
on conflict (setting_key) do nothing;

alter table public.dcds_auth_settings enable row level security;
revoke all on table public.dcds_auth_settings from public, anon, authenticated;
grant all on table public.dcds_auth_settings to service_role;

create table if not exists public.dcds_signup_attempts (
  id bigint generated always as identity primary key,
  email_fingerprint text not null,
  phone_fingerprint text not null,
  ip_fingerprint text,
  created_at timestamptz not null default now(),
  constraint dcds_signup_attempt_email_hash check (email_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint dcds_signup_attempt_phone_hash check (phone_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint dcds_signup_attempt_ip_hash check (ip_fingerprint is null or ip_fingerprint ~ '^[a-f0-9]{64}$')
);

create index if not exists dcds_signup_attempt_email_recent_idx
  on public.dcds_signup_attempts(email_fingerprint, created_at desc);
create index if not exists dcds_signup_attempt_phone_recent_idx
  on public.dcds_signup_attempts(phone_fingerprint, created_at desc);
create index if not exists dcds_signup_attempt_ip_recent_idx
  on public.dcds_signup_attempts(ip_fingerprint, created_at desc);

alter table public.dcds_signup_attempts enable row level security;
revoke all on table public.dcds_signup_attempts from public, anon, authenticated;
grant all on table public.dcds_signup_attempts to service_role;

create or replace function public.dcds_internal_take_signup_attempt(
  p_email_fingerprint text,
  p_phone_fingerprint text,
  p_ip_fingerprint text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_recent_attempts integer;
begin
  if p_email_fingerprint is null or p_email_fingerprint !~ '^[a-f0-9]{64}$'
     or p_phone_fingerprint is null or p_phone_fingerprint !~ '^[a-f0-9]{64}$'
     or (p_ip_fingerprint is not null and p_ip_fingerprint !~ '^[a-f0-9]{64}$') then
    return false;
  end if;

  delete from public.dcds_signup_attempts
  where created_at < now() - interval '24 hours';

  select count(*)::integer into v_recent_attempts
  from public.dcds_signup_attempts
  where created_at >= now() - interval '15 minutes'
    and (
      email_fingerprint = p_email_fingerprint
      or phone_fingerprint = p_phone_fingerprint
      or (p_ip_fingerprint is not null and ip_fingerprint = p_ip_fingerprint)
    );

  if v_recent_attempts >= 5 then
    return false;
  end if;

  insert into public.dcds_signup_attempts(
    email_fingerprint, phone_fingerprint, ip_fingerprint
  ) values (
    p_email_fingerprint, p_phone_fingerprint, p_ip_fingerprint
  );

  return true;
end;
$function$;

revoke all on function public.dcds_internal_take_signup_attempt(text, text, text) from public, anon, authenticated;
grant execute on function public.dcds_internal_take_signup_attempt(text, text, text) to service_role;
comment on function public.dcds_internal_take_signup_attempt(text, text, text) is
  'Service-role-only rate limiter for DCDS mobile OTP signup. Stores SHA-256 fingerprints, not raw contact details or IP addresses.';
