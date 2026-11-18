create table if not exists public.dcds_vtu_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  service_type text not null check (service_type in ('airtime', 'data')),
  network_code text not null check (network_code in ('mtn', 'glo', '9mobile', 'airtel')),
  network_id smallint not null check (network_id between 1 and 4),
  phone text not null check (phone ~ '^0[789][0-9]{9}$'),
  data_plan_id text,
  data_plan_name text,
  customer_amount numeric(12,2) not null check (customer_amount >= 50),
  provider_cost numeric(12,2) not null check (provider_cost > 0),
  provider_discount_percent numeric(5,2) not null default 0 check (provider_discount_percent >= 0 and provider_discount_percent <= 50),
  currency text not null default 'NGN' check (currency = 'NGN'),
  tx_ref text not null unique,
  flutterwave_transaction_id text unique,
  provider_request_id text not null unique,
  provider_reference text,
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'successful', 'failed', 'expired')),
  fulfillment_status text not null default 'not_started'
    check (fulfillment_status in ('not_started', 'processing', 'successful', 'failed', 'uncertain')),
  payment_link text,
  payment_response jsonb,
  provider_response jsonb,
  checkout_expires_at timestamptz not null,
  payment_verified_at timestamptz,
  fulfillment_started_at timestamptz,
  fulfilled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dcds_vtu_data_plan_required check (
    (service_type = 'data' and data_plan_id is not null and length(data_plan_id) > 0)
    or (service_type = 'airtime' and data_plan_id is null)
  )
);

create index if not exists dcds_vtu_orders_user_created_idx
  on public.dcds_vtu_orders (user_id, created_at desc);

create index if not exists dcds_vtu_orders_pending_expiry_idx
  on public.dcds_vtu_orders (payment_status, checkout_expires_at)
  where payment_status = 'pending';

alter table public.dcds_vtu_orders enable row level security;

drop policy if exists "Students can view their own DCDS VTU orders" on public.dcds_vtu_orders;
create policy "Students can view their own DCDS VTU orders"
  on public.dcds_vtu_orders
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on public.dcds_vtu_orders from anon, authenticated;
grant select on public.dcds_vtu_orders to authenticated;
