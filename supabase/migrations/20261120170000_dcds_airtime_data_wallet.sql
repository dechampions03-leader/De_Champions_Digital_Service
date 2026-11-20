-- DCDS Airtime & Data Wallet — isolated NGN wallet ledger.
-- This migration is additive: it does not alter course orders, payments,
-- referral commissions, existing VTU pay-per-order records, or Production.
-- Apply only to the Development project after review and sandbox validation.

create table if not exists public.dcds_wallet_accounts (
  user_id uuid primary key references auth.users(id) on delete restrict,
  currency text not null default 'NGN' check (currency = 'NGN'),
  balance numeric(14,2) not null default 0 check (balance >= 0),
  status text not null default 'active' check (status in ('active','frozen','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dcds_wallet_funding_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  client_request_id uuid not null,
  tx_ref text not null unique,
  amount numeric(14,2) not null check (amount >= 100 and amount <= 1000000),
  currency text not null default 'NGN' check (currency = 'NGN'),
  payment_link text,
  flutterwave_transaction_id text unique,
  status text not null default 'pending'
    check (status in ('pending','credited','failed','expired','needs_review')),
  verification jsonb,
  expires_at timestamptz not null,
  credited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_request_id)
);

create index if not exists dcds_wallet_funding_user_created_idx
  on public.dcds_wallet_funding_intents(user_id, created_at desc);
create index if not exists dcds_wallet_funding_status_created_idx
  on public.dcds_wallet_funding_intents(status, created_at desc);

-- Append-only posted ledger. A unique reference prevents duplicate credits/debits.
create table if not exists public.dcds_wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  entry_type text not null check (entry_type in ('funding_credit','vtu_debit','vtu_refund','admin_adjustment')),
  direction text not null check (direction in ('credit','debit')),
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  reference text not null unique,
  balance_after numeric(14,2) not null check (balance_after >= 0),
  related_funding_intent_id uuid references public.dcds_wallet_funding_intents(id) on delete restrict,
  related_vtu_order_id uuid,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint dcds_wallet_ledger_direction_check check (
    (entry_type in ('funding_credit','vtu_refund','admin_adjustment') and direction = 'credit')
    or (entry_type = 'vtu_debit' and direction = 'debit')
  )
);

create index if not exists dcds_wallet_ledger_user_created_idx
  on public.dcds_wallet_ledger(user_id, created_at desc);
create index if not exists dcds_wallet_ledger_related_funding_idx
  on public.dcds_wallet_ledger(related_funding_intent_id);

create table if not exists public.dcds_vtu_wallet_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  client_request_id uuid not null,
  service_type text not null check (service_type in ('airtime','data')),
  network text not null check (network in ('mtn','glo','9mobile','airtel','spectranet','smile')),
  recipient_phone text not null check (recipient_phone ~ '^[0-9]{7,15}$'),
  data_plan_id text,
  data_plan_name text,
  amount numeric(14,2) not null check (amount > 0),
  provider_cost numeric(14,2) not null check (provider_cost > 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  wallet_debit_reference text not null unique,
  provider_request_id text not null unique,
  provider_reference text,
  provider_status text,
  provider_response jsonb,
  status text not null default 'processing'
    check (status in ('processing','successful','refund_required','refunded','failed','needs_review')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fulfilled_at timestamptz,
  unique (user_id, client_request_id),
  constraint dcds_wallet_vtu_plan_check check (
    (service_type = 'data' and data_plan_id is not null and nullif(btrim(data_plan_name),'') is not null)
    or (service_type = 'airtime' and data_plan_id is null and data_plan_name is null)
  )
);

create index if not exists dcds_vtu_wallet_orders_user_created_idx
  on public.dcds_vtu_wallet_orders(user_id, created_at desc);
create index if not exists dcds_vtu_wallet_orders_status_created_idx
  on public.dcds_vtu_wallet_orders(status, created_at desc);

alter table public.dcds_wallet_accounts enable row level security;
alter table public.dcds_wallet_funding_intents enable row level security;
alter table public.dcds_wallet_ledger enable row level security;
alter table public.dcds_vtu_wallet_orders enable row level security;

-- No direct browser access. Wallet balance and ledger are read/written through
-- authenticated Edge Functions using service-role credentials server-side.
revoke all on table public.dcds_wallet_accounts from public, anon, authenticated;
revoke all on table public.dcds_wallet_funding_intents from public, anon, authenticated;
revoke all on table public.dcds_wallet_ledger from public, anon, authenticated;
revoke all on table public.dcds_vtu_wallet_orders from public, anon, authenticated;
grant all on table public.dcds_wallet_accounts to service_role;
grant all on table public.dcds_wallet_funding_intents to service_role;
grant all on table public.dcds_wallet_ledger to service_role;
grant all on table public.dcds_vtu_wallet_orders to service_role;
