-- DCDS regional course pricing: additive, NGN-safe rollout.
-- Apply only after review. Existing courses/orders/payments are not rewritten.

create table if not exists public.course_regional_prices (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete restrict,
  currency text not null check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  amount numeric(14,2) not null check (amount > 0),
  is_active boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (course_id, currency)
);

create index if not exists course_regional_prices_active_idx
  on public.course_regional_prices(currency, course_id) where is_active;

alter table public.course_regional_prices enable row level security;

drop policy if exists "Public can read active regional course prices" on public.course_regional_prices;
create policy "Public can read active regional course prices"
  on public.course_regional_prices for select to anon, authenticated
  using (is_active = true);

drop policy if exists "DCDS admins manage regional course prices" on public.course_regional_prices;
create policy "DCDS admins manage regional course prices"
  on public.course_regional_prices for all to authenticated
  using ((select public.is_dcds_admin()))
  with check ((select public.is_dcds_admin()));

revoke all on public.course_regional_prices from public, anon, authenticated;
grant select on public.course_regional_prices to anon, authenticated;
grant insert, update, delete on public.course_regional_prices to authenticated;
grant all on public.course_regional_prices to service_role;

create or replace function public.dcds_create_checkout_order(
  p_user_id uuid,
  p_course_id uuid,
  p_tx_ref text,
  p_currency text default 'NGN'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user auth.users%rowtype;
  v_course public.courses%rowtype;
  v_existing_enrolment uuid;
  v_pending_order uuid;
  v_order public.orders%rowtype;
  v_currency text := upper(coalesce(nullif(trim(p_currency), ''), 'NGN'));
  v_amount numeric(14,2);
begin
  if p_user_id is null or p_course_id is null or p_tx_ref is null
     or length(trim(p_tx_ref)) < 12 or length(p_tx_ref) > 120
     or v_currency !~ '^[A-Z]{3}$' then
    raise exception 'Invalid checkout request.' using errcode = '22023';
  end if;

  select * into v_user from auth.users where id = p_user_id for share;
  if not found or v_user.email is null then
    raise exception 'Your account has no email address.' using errcode = 'P0001';
  end if;
  if v_user.email_confirmed_at is null then
    raise exception 'Please verify your email address before making a payment.' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':' || p_course_id::text, 0)
  );

  select id into v_existing_enrolment from public.enrollments
  where user_id = p_user_id and course_id = p_course_id limit 1;
  if v_existing_enrolment is not null then
    raise exception 'You are already enrolled in this course.' using errcode = 'P0001';
  end if;

  select id into v_pending_order from public.orders
  where user_id = p_user_id and course_id = p_course_id and status = 'pending'
  order by created_at desc limit 1;
  if v_pending_order is not null then
    raise exception 'A checkout is already pending for this course. Contact support to verify its status before trying again.' using errcode = 'P0001';
  end if;

  select * into v_course from public.courses where id = p_course_id;
  if not found then raise exception 'Course not found.' using errcode = 'P0001'; end if;

  if v_currency = coalesce(v_course.currency, 'NGN') then
    v_amount := v_course.price;
  else
    select rp.amount into v_amount
    from public.course_regional_prices rp
    where rp.course_id = p_course_id
      and rp.currency = v_currency
      and rp.is_active = true;
    if v_amount is null then
      raise exception 'This currency is not yet enabled for this course. Please select NGN or contact DCDS support.' using errcode = 'P0001';
    end if;
  end if;

  if v_amount is null or v_amount <= 0 then
    raise exception 'Course price is invalid.' using errcode = '22023';
  end if;

  insert into public.orders (user_id, course_id, amount, currency, status, tx_ref)
  values (p_user_id, p_course_id, v_amount, v_currency, 'pending', p_tx_ref)
  returning * into v_order;

  return pg_catalog.jsonb_build_object(
    'id', v_order.id, 'tx_ref', v_order.tx_ref, 'amount', v_order.amount,
    'currency', v_order.currency, 'course_title', v_course.title
  );
end;
$$;

revoke all on function public.dcds_create_checkout_order(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.dcds_create_checkout_order(uuid, uuid, text, text) to service_role;
