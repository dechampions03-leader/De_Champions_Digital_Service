-- DCDS shared AI: server-enforced per-user request windows.
-- The table is private and the quota function is the only authenticated entry point.
create table if not exists public.dcds_ai_usage_windows (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default pg_catalog.now(),
  request_count integer not null default 0,
  updated_at timestamptz not null default pg_catalog.now(),
  constraint dcds_ai_usage_count_nonnegative check (request_count >= 0)
);

alter table public.dcds_ai_usage_windows enable row level security;
revoke all on table public.dcds_ai_usage_windows from public, anon, authenticated;
grant all on table public.dcds_ai_usage_windows to service_role;

-- Remove the first-draft no-argument function before installing the bounded
-- parameterised version; otherwise a zero-argument call could be ambiguous.
drop function if exists public.dcds_consume_ai_request();

create or replace function public.dcds_consume_ai_request(p_limit integer default 10)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 30);
  v_count integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if v_user_id is null then
    raise exception 'Authenticated user required';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 30 then
    raise exception 'AI request limit must be between 1 and 30';
  end if;

  insert into public.dcds_ai_usage_windows (user_id, window_started_at, request_count, updated_at)
  values (v_user_id, v_now, 1, v_now)
  on conflict (user_id) do update
  set
    window_started_at = case
      when public.dcds_ai_usage_windows.window_started_at <= v_now - interval '60 seconds'
      then v_now
      else public.dcds_ai_usage_windows.window_started_at
    end,
    request_count = case
      when public.dcds_ai_usage_windows.window_started_at <= v_now - interval '60 seconds'
      then 1
      else least(public.dcds_ai_usage_windows.request_count + 1, v_limit + 1)
    end,
    updated_at = v_now
  returning request_count into v_count;

  return v_count <= v_limit;
end;
$$;

revoke all on function public.dcds_consume_ai_request(integer) from public, anon;
grant execute on function public.dcds_consume_ai_request(integer) to authenticated;
