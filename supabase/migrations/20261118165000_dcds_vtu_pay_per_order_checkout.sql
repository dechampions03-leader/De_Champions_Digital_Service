
-- Direct pay-per-order airtime and data purchases.
-- This is separate from course orders/payments and deliberately has no wallet ledger.
create table if not exists public.dcds_vtu_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  client_request_id uuid not null,
  service_type text not null check (service_type in ('airtime','data')),
  network text not null check (network in ('mtn','glo','9mobile','airtel')),
  network_id smallint not null check (network_id between 1 and 4),
  recipient_phone text not null check (recipient_phone ~ '^0[789][0-9]{9}$'),
  data_plan_id text,
  data_plan_name text,
  data_plan_type text,
  data_validity text,
  airtime_amount numeric(12,2),
  amount numeric(12,2) not null check (amount >= 50),
  provider_cost numeric(12,2) not null check (provider_cost > 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  tx_ref text not null unique,
  oplug_request_id text not null unique,
  flutterwave_transaction_id text unique,
  payment_link text,
  checkout_expires_at timestamptz not null,
  status text not null default 'pending_payment'
    check (status in ('pending_payment','paid','processing','successful','refund_required','failed','cancelled','needs_review')),
  flutterwave_verification jsonb,
  provider_reference text,
  provider_status text,
  provider_response jsonb,
  last_error text,
  paid_at timestamptz,
  purchase_started_at timestamptz,
  fulfilled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dcds_vtu_service_fields_check check (
    (service_type = 'data'
      and data_plan_id is not null
      and nullif(btrim(data_plan_name), '') is not null
      and airtime_amount is null)
    or
    (service_type = 'airtime'
      and data_plan_id is null
      and data_plan_name is null
      and airtime_amount is not null
      and airtime_amount = amount)
  ),
  constraint dcds_vtu_tx_ref_length_check check (length(tx_ref) between 12 and 120),
  constraint dcds_vtu_request_id_length_check check (length(oplug_request_id) between 12 and 80)
);

create unique index if not exists dcds_vtu_user_client_request_uidx
  on public.dcds_vtu_orders(user_id, client_request_id);

create index if not exists dcds_vtu_user_created_idx
  on public.dcds_vtu_orders(user_id, created_at desc);

create index if not exists dcds_vtu_status_created_idx
  on public.dcds_vtu_orders(status, created_at desc);

-- A customer may only have one unresolved top-up checkout at a time.
create unique index if not exists dcds_vtu_one_open_order_per_user_uidx
  on public.dcds_vtu_orders(user_id)
  where status in ('pending_payment','paid','processing','needs_review');

alter table public.dcds_vtu_orders enable row level security;

-- All writes and reads go through authenticated server-side Edge Functions.
-- No client role receives table access; the server uses a Supabase secret/service key.
revoke all on table public.dcds_vtu_orders from public, anon, authenticated;
grant all on table public.dcds_vtu_orders to service_role;
