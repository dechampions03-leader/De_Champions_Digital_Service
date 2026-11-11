-- DCDS admin payment operations: reviewed evidence, safe manual transfer orders, and auditable approvals.
-- Existing Flutterwave orders are never manually marked paid: verify them with Flutterwave transaction IDs.
-- Manual bank-transfer orders are created separately so an older Flutterwave link cannot be paid twice.

create table if not exists public.dcds_payment_receipt_reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  receipt_path text not null,
  bank_reference text not null,
  payment_channel text not null default 'bank_transfer',
  payer_name text,
  claimed_amount numeric(14,2) not null check (claimed_amount > 0),
  claimed_currency text not null check (claimed_currency = upper(claimed_currency) and claimed_currency ~ '^[A-Z]{3}$'),
  review_status text not null default 'submitted' check (review_status in ('submitted','approved','rejected')),
  admin_note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dcds_payment_receipt_path_order_prefix check (receipt_path like order_id::text || '/%')
);

create unique index if not exists dcds_payment_receipt_bank_reference_active_uq
  on public.dcds_payment_receipt_reviews (lower(btrim(bank_reference)))
  where review_status in ('submitted','approved');

create index if not exists dcds_payment_receipt_review_status_idx
  on public.dcds_payment_receipt_reviews (review_status, created_at desc);

create table if not exists public.dcds_payment_review_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  review_id uuid references public.dcds_payment_receipt_reviews(id) on delete set null,
  actor_user_id uuid not null references auth.users(id),
  event_type text not null check (event_type in (
    'manual_order_created','receipt_submitted','receipt_rejected',
    'manual_payment_approved','flutterwave_payment_verified'
  )),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists dcds_payment_review_events_order_idx
  on public.dcds_payment_review_events (order_id, created_at desc);

alter table public.dcds_payment_receipt_reviews enable row level security;
alter table public.dcds_payment_review_events enable row level security;

revoke all on public.dcds_payment_receipt_reviews from public, anon, authenticated;
revoke all on public.dcds_payment_review_events from public, anon, authenticated;
grant all on public.dcds_payment_receipt_reviews to service_role;
grant all on public.dcds_payment_review_events to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dcds-payment-receipts',
  'dcds-payment-receipts',
  false,
  8388608,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do nothing;

drop policy if exists "DCDS admins upload payment receipts" on storage.objects;
create policy "DCDS admins upload payment receipts"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'dcds-payment-receipts' and (select public.is_dcds_admin()));

drop policy if exists "DCDS admins view payment receipts" on storage.objects;
create policy "DCDS admins view payment receipts"
  on storage.objects for select to authenticated
  using (bucket_id = 'dcds-payment-receipts' and (select public.is_dcds_admin()));

drop policy if exists "DCDS admins replace payment receipts" on storage.objects;
create policy "DCDS admins replace payment receipts"
  on storage.objects for update to authenticated
  using (bucket_id = 'dcds-payment-receipts' and (select public.is_dcds_admin()))
  with check (bucket_id = 'dcds-payment-receipts' and (select public.is_dcds_admin()));

drop policy if exists "DCDS admins delete payment receipts" on storage.objects;
create policy "DCDS admins delete payment receipts"
  on storage.objects for delete to authenticated
  using (bucket_id = 'dcds-payment-receipts' and (select public.is_dcds_admin()));

create or replace function public.admin_list_payment_orders(
  p_status text default 'pending',
  p_search text default null,
  p_currency text default null,
  p_limit integer default 100
)
returns table (
  order_id uuid,
  user_id uuid,
  student_email text,
  student_name text,
  course_id uuid,
  course_title text,
  amount numeric,
  currency text,
  order_status text,
  tx_ref text,
  order_created_at timestamptz,
  order_source text,
  review_id uuid,
  review_status text,
  receipt_path text,
  bank_reference text,
  payment_channel text,
  payer_name text,
  claimed_amount numeric,
  claimed_currency text,
  admin_note text,
  reviewed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_dcds_admin(), false) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  return query
  select
    o.id,
    o.user_id,
    coalesce(u.email::text, ''),
    coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
             nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
             'DCDS Student'),
    o.course_id,
    c.title,
    o.amount,
    o.currency,
    o.status,
    coalesce(o.tx_ref, ''),
    o.created_at,
    case when o.tx_ref like 'DCDS-MANUAL-%' then 'manual_bank_transfer' else 'flutterwave_checkout' end,
    r.id,
    r.review_status,
    r.receipt_path,
    r.bank_reference,
    r.payment_channel,
    r.payer_name,
    r.claimed_amount,
    r.claimed_currency,
    r.admin_note,
    r.reviewed_at
  from public.orders o
  join auth.users u on u.id = o.user_id
  join public.courses c on c.id = o.course_id
  left join public.dcds_payment_receipt_reviews r on r.order_id = o.id
  where
    (
      coalesce(p_status, 'pending') = 'all'
      or (p_status = 'receipt_submitted' and r.review_status = 'submitted')
      or (p_status = 'pending' and o.status = 'pending')
      or (p_status = 'successful' and o.status = 'successful')
      or (p_status = 'failed' and o.status in ('failed','cancelled'))
    )
    and (p_currency is null or upper(o.currency) = upper(p_currency))
    and (
      p_search is null or btrim(p_search) = ''
      or lower(
        coalesce(u.email,'') || ' ' ||
        coalesce(u.raw_user_meta_data ->> 'full_name','') || ' ' ||
        coalesce(c.title,'') || ' ' ||
        coalesce(o.tx_ref,'') || ' ' ||
        coalesce(r.bank_reference,'')
      ) like '%' || lower(btrim(p_search)) || '%'
    )
  order by o.created_at desc
  limit greatest(1, least(coalesce(p_limit,100),200));
end;
$$;

create or replace function public.admin_payment_dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_dcds_admin(), false) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  return pg_catalog.jsonb_build_object(
    'pending_orders', (select count(*) from public.orders o where o.status = 'pending'),
    'submitted_receipts', (select count(*) from public.dcds_payment_receipt_reviews r where r.review_status = 'submitted'),
    'successful_today', (select count(*) from public.orders o where o.status = 'successful' and o.updated_at >= pg_catalog.date_trunc('day', now())),
    'failed_orders', (select count(*) from public.orders o where o.status in ('failed','cancelled')),
    'manual_pending', (select count(*) from public.orders o where o.status = 'pending' and o.tx_ref like 'DCDS-MANUAL-%')
  );
end;
$$;

create or replace function public.admin_create_manual_bank_order(
  p_student_email text,
  p_course_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  v_user auth.users%rowtype;
  v_course public.courses%rowtype;
  v_order public.orders%rowtype;
  v_ref text;
begin
  if not coalesce(public.is_dcds_admin(), false) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_student_email is null or pg_catalog.length(pg_catalog.btrim(p_student_email)) < 5 or p_course_id is null then
    raise exception 'Student email and course are required.' using errcode = '22023';
  end if;

  select * into v_user from auth.users
  where pg_catalog.lower(email) = pg_catalog.lower(pg_catalog.btrim(p_student_email))
  limit 1;
  if not found or v_user.email_confirmed_at is null then
    raise exception 'A student with a confirmed email address could not be found.' using errcode = 'P0001';
  end if;
  select * into v_course from public.courses where id = p_course_id;
  if not found then raise exception 'Course not found.' using errcode = 'P0001'; end if;
  if pg_catalog.upper(coalesce(v_course.currency,'NGN')) <> 'NGN' then
    raise exception 'Direct manual bank-transfer orders are currently limited to NGN. Use Flutterwave for international currencies.' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user.id::text || ':' || p_course_id::text, 0)
  );
  if exists (select 1 from public.enrollments e where e.user_id=v_user.id and e.course_id=p_course_id) then
    raise exception 'This student is already enrolled in the selected course.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.orders o where o.user_id=v_user.id and o.course_id=p_course_id and o.status='pending') then
    raise exception 'This student already has a pending checkout for this course. Reconcile it before creating a manual bank-transfer order.' using errcode = 'P0001';
  end if;

  v_ref := 'DCDS-MANUAL-' || pg_catalog.replace(gen_random_uuid()::text,'-','');
  insert into public.orders(user_id,course_id,amount,currency,status,tx_ref)
  values(v_user.id,p_course_id,v_course.price,'NGN','pending',v_ref)
  returning * into v_order;

  insert into public.dcds_payment_review_events(order_id,actor_user_id,event_type,details)
  values(v_order.id,v_admin,'manual_order_created',
    pg_catalog.jsonb_build_object('student_email',v_user.email,'course_title',v_course.title,'amount',v_order.amount,'currency',v_order.currency));

  return pg_catalog.jsonb_build_object(
    'order_id',v_order.id,'student_email',v_user.email,'course_title',v_course.title,
    'amount',v_order.amount,'currency',v_order.currency,'tx_ref',v_order.tx_ref
  );
end;
$$;

create or replace function public.admin_record_payment_receipt(
  p_order_id uuid,
  p_receipt_path text,
  p_bank_reference text,
  p_payment_channel text,
  p_payer_name text,
  p_claimed_amount numeric,
  p_claimed_currency text,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  v_order public.orders%rowtype;
  v_review public.dcds_payment_receipt_reviews%rowtype;
begin
  if not coalesce(public.is_dcds_admin(), false) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_order_id is null
     or p_receipt_path is null
     or p_bank_reference is null or pg_catalog.length(pg_catalog.btrim(p_bank_reference)) < 3
     or p_payment_channel is null or pg_catalog.length(pg_catalog.btrim(p_payment_channel)) > 64
     or p_claimed_amount is null or p_claimed_amount <= 0
     or p_claimed_currency is null or p_claimed_currency !~ '^[A-Za-z]{3}$' then
    raise exception 'Complete the receipt, reference, payment channel, amount and currency fields.' using errcode = '22023';
  end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found.' using errcode = 'P0001'; end if;
  if v_order.status <> 'pending' then raise exception 'Only pending orders can receive payment evidence.' using errcode = 'P0001'; end if;
  if p_receipt_path not like p_order_id::text || '/%' then
    raise exception 'Receipt file path does not match this order.' using errcode = '22023';
  end if;

  insert into public.dcds_payment_receipt_reviews(
    order_id,created_by,receipt_path,bank_reference,payment_channel,payer_name,claimed_amount,claimed_currency,review_status,admin_note,updated_at
  )
  values(
    p_order_id,v_admin,p_receipt_path,pg_catalog.btrim(p_bank_reference),
    pg_catalog.btrim(p_payment_channel),nullif(pg_catalog.btrim(p_payer_name),''),
    p_claimed_amount,pg_catalog.upper(p_claimed_currency),'submitted',
    nullif(pg_catalog.btrim(p_admin_note),''),now()
  )
  on conflict (order_id) do update set
    created_by=excluded.created_by,
    receipt_path=excluded.receipt_path,
    bank_reference=excluded.bank_reference,
    payment_channel=excluded.payment_channel,
    payer_name=excluded.payer_name,
    claimed_amount=excluded.claimed_amount,
    claimed_currency=excluded.claimed_currency,
    review_status='submitted',
    admin_note=excluded.admin_note,
    reviewed_by=null,
    reviewed_at=null,
    updated_at=now()
  returning * into v_review;

  insert into public.dcds_payment_review_events(order_id,review_id,actor_user_id,event_type,details)
  values(p_order_id,v_review.id,v_admin,'receipt_submitted',
    pg_catalog.jsonb_build_object('bank_reference',v_review.bank_reference,'payment_channel',v_review.payment_channel,'claimed_amount',v_review.claimed_amount,'claimed_currency',v_review.claimed_currency));

  return pg_catalog.jsonb_build_object('review_id',v_review.id,'review_status',v_review.review_status);
end;
$$;

create or replace function public.admin_approve_manual_bank_payment(
  p_review_id uuid,
  p_admin_note text default null,
  p_confirm_bank_credit boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  v_review public.dcds_payment_receipt_reviews%rowtype;
  v_order public.orders%rowtype;
  v_transaction_id text;
begin
  if not coalesce(public.is_dcds_admin(), false) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_confirm_bank_credit is distinct from true then
    raise exception 'Confirm that cleared funds are visible in the DCDS bank account before approval.' using errcode = '42501';
  end if;
  select * into v_review from public.dcds_payment_receipt_reviews where id=p_review_id for update;
  if not found then raise exception 'Receipt review not found.' using errcode = 'P0001'; end if;
  if v_review.review_status <> 'submitted' then raise exception 'This receipt is no longer awaiting approval.' using errcode = 'P0001'; end if;
  select * into v_order from public.orders where id=v_review.order_id for update;
  if not found or v_order.status <> 'pending' then raise exception 'The associated order is no longer pending.' using errcode = 'P0001'; end if;
  if v_order.tx_ref not like 'DCDS-MANUAL-%' then
    raise exception 'This order was created for Flutterwave checkout. Verify it using its Flutterwave transaction ID instead of manual bank approval.' using errcode = 'P0001';
  end if;
  if v_review.claimed_amount <> v_order.amount or v_review.claimed_currency <> v_order.currency then
    raise exception 'The receipt amount or currency does not match the order. Resolve the difference before approval.' using errcode = 'P0001';
  end if;
  if exists(select 1 from public.payments p where p.order_id=v_order.id or p.tx_ref=v_order.tx_ref) then
    raise exception 'A payment record already exists for this order.' using errcode = '23505';
  end if;
  if exists(
    select 1 from public.dcds_payment_receipt_reviews r
    where r.id<>v_review.id and r.review_status='approved'
      and pg_catalog.lower(pg_catalog.btrim(r.bank_reference))=pg_catalog.lower(pg_catalog.btrim(v_review.bank_reference))
  ) then
    raise exception 'This bank reference has already been used for another approved payment.' using errcode = '23505';
  end if;

  v_transaction_id := 'DCDS-MANUAL-' || gen_random_uuid()::text;
  insert into public.payments(order_id,user_id,provider,transaction_id,tx_ref,amount,currency,status,raw_response)
  values(
    v_order.id,v_order.user_id,'manual_bank_transfer',v_transaction_id,v_order.tx_ref,
    v_order.amount,v_order.currency,'successful',
    pg_catalog.jsonb_build_object(
      'payment_channel',v_review.payment_channel,
      'bank_reference',v_review.bank_reference,
      'payer_name',v_review.payer_name,
      'receipt_bucket','dcds-payment-receipts',
      'receipt_path',v_review.receipt_path,
      'verified_by_admin',v_admin,
      'admin_note',coalesce(p_admin_note,v_review.admin_note)
    )
  );

  update public.orders set status='successful',updated_at=now()
  where id=v_order.id and status='pending';

  insert into public.enrollments(user_id,course_id,order_id,enrollment_source)
  values(v_order.user_id,v_order.course_id,v_order.id,'purchase')
  on conflict (user_id,course_id) do nothing;

  update public.dcds_payment_receipt_reviews
  set review_status='approved',reviewed_by=v_admin,reviewed_at=now(),
      admin_note=coalesce(nullif(pg_catalog.btrim(p_admin_note),''),admin_note),updated_at=now()
  where id=v_review.id;

  insert into public.dcds_payment_review_events(order_id,review_id,actor_user_id,event_type,details)
  values(v_order.id,v_review.id,v_admin,'manual_payment_approved',
    pg_catalog.jsonb_build_object('bank_reference',v_review.bank_reference,'payment_id',v_transaction_id,'amount',v_order.amount,'currency',v_order.currency));

  return pg_catalog.jsonb_build_object('success',true,'order_id',v_order.id,'transaction_id',v_transaction_id,'status','successful');
end;
$$;

create or replace function public.admin_reject_payment_receipt(
  p_review_id uuid,
  p_admin_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  v_review public.dcds_payment_receipt_reviews%rowtype;
  v_order public.orders%rowtype;
begin
  if not coalesce(public.is_dcds_admin(), false) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_admin_note is null or pg_catalog.length(pg_catalog.btrim(p_admin_note)) < 3 then
    raise exception 'Add a short reason when rejecting a receipt.' using errcode = '22023';
  end if;
  select * into v_review from public.dcds_payment_receipt_reviews where id=p_review_id for update;
  if not found or v_review.review_status <> 'submitted' then
    raise exception 'This receipt is not awaiting review.' using errcode = 'P0001';
  end if;
  select * into v_order from public.orders where id=v_review.order_id for update;
  if not found or v_order.status <> 'pending' then raise exception 'The associated order is no longer pending.' using errcode = 'P0001'; end if;

  update public.dcds_payment_receipt_reviews
  set review_status='rejected',reviewed_by=v_admin,reviewed_at=now(),
      admin_note=pg_catalog.btrim(p_admin_note),updated_at=now()
  where id=v_review.id;

  if v_order.tx_ref like 'DCDS-MANUAL-%' then
    update public.orders set status='failed',updated_at=now() where id=v_order.id and status='pending';
  end if;

  insert into public.dcds_payment_review_events(order_id,review_id,actor_user_id,event_type,details)
  values(v_order.id,v_review.id,v_admin,'receipt_rejected',pg_catalog.jsonb_build_object('reason',pg_catalog.btrim(p_admin_note)));

  return pg_catalog.jsonb_build_object('success',true,'review_status','rejected','order_status',
    case when v_order.tx_ref like 'DCDS-MANUAL-%' then 'failed' else 'pending' end);
end;
$$;

create or replace function public.admin_finalize_flutterwave_payment(
  p_order_id uuid,
  p_admin_user_id uuid,
  p_transaction_id text,
  p_tx_ref text,
  p_amount numeric,
  p_currency text,
  p_raw_response jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_existing_by_id public.payments%rowtype;
  v_existing_by_ref public.payments%rowtype;
  v_review public.dcds_payment_receipt_reviews%rowtype;
begin
  if not exists(select 1 from public.dcds_admins a where a.user_id=p_admin_user_id) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_order_id is null or p_admin_user_id is null or p_transaction_id is null
     or p_tx_ref is null or p_amount is null or p_currency is null or p_raw_response is null then
    raise exception 'Verified transaction details are incomplete.' using errcode = '22023';
  end if;

  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found.' using errcode = 'P0001'; end if;
  if v_order.tx_ref like 'DCDS-MANUAL-%' then raise exception 'Manual bank-transfer orders cannot be completed with a Flutterwave transaction.' using errcode = 'P0001'; end if;
  if v_order.tx_ref <> p_tx_ref or v_order.amount <> p_amount or pg_catalog.upper(v_order.currency) <> pg_catalog.upper(p_currency) then
    raise exception 'Verified Flutterwave transaction does not match this order.' using errcode = 'P0001';
  end if;

  select * into v_existing_by_id from public.payments where transaction_id=p_transaction_id for update;
  if found and (v_existing_by_id.order_id<>v_order.id or v_existing_by_id.tx_ref<>v_order.tx_ref) then
    raise exception 'This Flutterwave transaction ID is already linked to another order.' using errcode = '23505';
  end if;

  select * into v_existing_by_ref from public.payments where tx_ref=v_order.tx_ref for update;
  if found and (v_existing_by_ref.order_id<>v_order.id or v_existing_by_ref.transaction_id<>p_transaction_id) then
    raise exception 'This order reference already has a different payment transaction.' using errcode = '23505';
  end if;

  if v_order.status not in ('pending','successful') then
    raise exception 'This order is not eligible for payment completion.' using errcode = 'P0001';
  end if;

  if not found then
    insert into public.payments(order_id,user_id,provider,transaction_id,tx_ref,amount,currency,status,raw_response)
    values(v_order.id,v_order.user_id,'flutterwave',p_transaction_id,v_order.tx_ref,p_amount,pg_catalog.upper(p_currency),'successful',p_raw_response);
  end if;

  if v_order.status='pending' then
    update public.orders set status='successful',updated_at=now() where id=v_order.id and status='pending';
  end if;

  insert into public.enrollments(user_id,course_id,order_id,enrollment_source)
  values(v_order.user_id,v_order.course_id,v_order.id,'purchase')
  on conflict (user_id,course_id) do nothing;

  update public.dcds_payment_receipt_reviews
  set review_status='approved',reviewed_by=p_admin_user_id,reviewed_at=now(),updated_at=now()
  where order_id=v_order.id and review_status='submitted';

  insert into public.dcds_payment_review_events(order_id,review_id,actor_user_id,event_type,details)
  select v_order.id,r.id,p_admin_user_id,'flutterwave_payment_verified',
    pg_catalog.jsonb_build_object('transaction_id',p_transaction_id,'amount',p_amount,'currency',pg_catalog.upper(p_currency))
  from (select id from public.dcds_payment_receipt_reviews where order_id=v_order.id) r;

  return pg_catalog.jsonb_build_object('success',true,'order_id',v_order.id,'status','successful');
end;
$$;

create or replace function public.admin_list_payment_review_events(p_limit integer default 50)
returns table (
  event_id uuid,
  order_id uuid,
  event_type text,
  actor_email text,
  details jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_dcds_admin(), false) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  return query
  select e.id,e.order_id,e.event_type,coalesce(u.email::text,''),e.details,e.created_at
  from public.dcds_payment_review_events e
  left join auth.users u on u.id=e.actor_user_id
  order by e.created_at desc
  limit greatest(1,least(coalesce(p_limit,50),100));
end;
$$;

revoke all on function public.admin_list_payment_orders(text,text,text,integer) from public,anon;
revoke all on function public.admin_payment_dashboard_stats() from public,anon;
revoke all on function public.admin_create_manual_bank_order(text,uuid) from public,anon;
revoke all on function public.admin_record_payment_receipt(uuid,text,text,text,text,numeric,text,text) from public,anon;
revoke all on function public.admin_approve_manual_bank_payment(uuid,text,boolean) from public,anon;
revoke all on function public.admin_reject_payment_receipt(uuid,text) from public,anon;
revoke all on function public.admin_finalize_flutterwave_payment(uuid,uuid,text,text,numeric,text,jsonb) from public,anon,authenticated;
revoke all on function public.admin_list_payment_review_events(integer) from public,anon;

grant execute on function public.admin_list_payment_orders(text,text,text,integer) to authenticated;
grant execute on function public.admin_payment_dashboard_stats() to authenticated;
grant execute on function public.admin_create_manual_bank_order(text,uuid) to authenticated;
grant execute on function public.admin_record_payment_receipt(uuid,text,text,text,text,numeric,text,text) to authenticated;
grant execute on function public.admin_approve_manual_bank_payment(uuid,text,boolean) to authenticated;
grant execute on function public.admin_reject_payment_receipt(uuid,text) to authenticated;
grant execute on function public.admin_finalize_flutterwave_payment(uuid,uuid,text,text,numeric,text,jsonb) to service_role;
grant execute on function public.admin_list_payment_review_events(integer) to authenticated;
