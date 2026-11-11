-- Require a mobile contact for every new DCDS email/password account.
-- Existing users are not modified and can continue to sign in without interruption.
-- Mobile values are stored in E.164 format in auth.users.raw_user_meta_data until
-- a future SMS-verification rollout links the number to auth.users.phone.

create unique index if not exists auth_users_dcds_signup_phone_e164_uidx
  on auth.users ((raw_user_meta_data ->> 'dcds_phone_e164'))
  where nullif(btrim(raw_user_meta_data ->> 'dcds_phone_e164'), '') is not null;

create or replace function public.dcds_require_signup_contact_details()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_phone text;
begin
  if new.email is null or pg_catalog.btrim(new.email) = '' then
    raise exception using
      errcode = '23514',
      message = 'A valid email address is required to create a DCDS account.';
  end if;

  v_phone := nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'dcds_phone_e164'), '');
  if v_phone is null or v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception using
      errcode = '23514',
      message = 'A valid international mobile number in E.164 format is required to create a DCDS account.';
  end if;

  return new;
end;
$function$;

revoke all on function public.dcds_require_signup_contact_details() from public, anon, authenticated;

drop trigger if exists dcds_require_signup_contact_details on auth.users;
create trigger dcds_require_signup_contact_details
  before insert on auth.users
  for each row
  execute function public.dcds_require_signup_contact_details();

comment on function public.dcds_require_signup_contact_details() is
  'Enforces email and E.164 mobile contact details for newly created DCDS accounts. Existing accounts are unchanged.';
