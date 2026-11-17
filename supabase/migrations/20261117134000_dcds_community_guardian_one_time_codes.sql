-- Replace a technical guardian UUID entry with a one-time, expiring guardian code.
-- Codes are generated only for a community-age-verified adult, stored as hashes,
-- consumed once by a teen request, and never returned by a table query.

create table public.dcds_community_guardian_invite_codes (
  id uuid primary key default gen_random_uuid(),
  guardian_user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);
create index dcds_community_guardian_invite_guardian_idx
  on public.dcds_community_guardian_invite_codes(guardian_user_id,expires_at desc);

revoke all on public.dcds_community_guardian_invite_codes from anon,authenticated;
alter table public.dcds_community_guardian_invite_codes enable row level security;

create or replace function public.dcds_community_create_guardian_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_code text := replace(gen_random_uuid()::text,'-','');
begin
  if v_user is null or not (select private.dcds_community_is_verified_adult(v_user)) then
    raise exception 'A verified 18+ DCDS community account is required to create a guardian code.';
  end if;

  update public.dcds_community_guardian_invite_codes
  set expires_at=now()
  where guardian_user_id=v_user and used_at is null and expires_at>now();

  insert into public.dcds_community_guardian_invite_codes(guardian_user_id,code_hash,expires_at)
  values (v_user,md5(v_code),now()+interval '7 days');

  return v_code;
end;
$$;
revoke all on function public.dcds_community_create_guardian_code() from public,anon;
grant execute on function public.dcds_community_create_guardian_code() to authenticated;

alter table public.dcds_community_age_requests
  add column guardian_invite_code text;

create or replace function private.dcds_community_resolve_guardian_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guardian uuid;
  v_code text;
begin
  if new.age_band <> '13_17' then
    new.guardian_invite_code := null;
    return new;
  end if;

  v_code := trim(coalesce(new.guardian_invite_code,''));
  if char_length(v_code) < 24 or char_length(v_code) > 64 then
    raise exception 'Enter a valid one-time code from your verified adult guardian.';
  end if;

  select guardian_user_id into v_guardian
  from public.dcds_community_guardian_invite_codes
  where code_hash=md5(v_code)
    and used_at is null
    and expires_at>now()
  for update;

  if not found or v_guardian is null or v_guardian=(select auth.uid()) then
    raise exception 'Guardian code is invalid, expired or already used.';
  end if;

  if not (select private.dcds_community_is_verified_adult(v_guardian)) then
    raise exception 'The guardian account no longer has verified adult status.';
  end if;

  update public.dcds_community_guardian_invite_codes
  set used_by=(select auth.uid()),used_at=now()
  where code_hash=md5(v_code) and used_at is null and expires_at>now();

  if not found then
    raise exception 'Guardian code has already been used.';
  end if;

  new.guardian_user_id := v_guardian;
  new.guardian_consent_status := 'pending';
  new.guardian_invite_code := null;
  return new;
end;
$$;
revoke all on function private.dcds_community_resolve_guardian_invite() from public,anon,authenticated;

create trigger dcds_community_resolve_guardian_invite
before insert on public.dcds_community_age_requests
for each row execute function private.dcds_community_resolve_guardian_invite();

comment on table public.dcds_community_guardian_invite_codes is 'One-time seven-day guardian codes; plaintext is returned once by a verified adult RPC and only a hash is stored.';
comment on column public.dcds_community_age_requests.guardian_invite_code is 'Transient one-time code input; a BEFORE INSERT trigger resolves it into guardian_user_id and clears it before storage.';
