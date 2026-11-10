-- DCDS shared AI: per-user short-window request guard.
-- The private table is only writable by this SECURITY DEFINER function.
create table if not exists public.dcds_ai_usage_windows (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint dcds_ai_usage_count_nonnegative check (request_count >= 0)
);

alter table public.dcds_ai_usage_windows enable row level security;
revoke all on table public.dcds_ai_usage_windows from public, anon, authenticated;
grant all on table public.dcds_ai_usage_windows to service_role;

create or replace function public.dcds_consume_ai_request()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'Authenticated user required';
  end if;

  insert into public.dcds_ai_usage_windows (user_id, window_started_at, request_count, updated_at)
  values (v_user_id, now(), 1, now())
  on conflict (user_id) do update
  set
    window_started_at = case
      when public.dcds_ai_usage_windows.window_started_at <= now() - interval '60 seconds'
      then now()
      else public.dcds_ai_usage_windows.window_started_at
    end,
    request_count = case
      when public.dcds_ai_usage_windows.window_started_at <= now() - interval '60 seconds'
      then 1
      else public.dcds_ai_usage_windows.request_count + 1
    end,
    updated_at = now()
  returning request_count into v_count;

  return v_count <= 10;
end;
$$;

revoke all on function public.dcds_consume_ai_request() from public, anon;
grant execute on function public.dcds_consume_ai_request() to authenticated;
