-- DCDS international payout foundation (disabled by default).
-- This adds country-aware beneficiary and FX quote storage only.
-- It does NOT alter the existing NGN payout workflow or initiate transfers.

begin;

create table if not exists public.dcds_international_payout_routes (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'flutterwave'
    check (provider = 'flutterwave'),
  route_code text not null unique,
  country_code text not null
    check (country_code = 'EU' or country_code ~ '^[A-Z]{2}$'),
  country_name text not null,
  currency text not null
    check (currency ~ '^[A-Z]{3}$'),
  payout_method text not null default 'bank_account'
    check (payout_method = 'bank_account'),
  status text not null default 'disabled'
    check (status in ('disabled','sandbox_testing','sandbox_verified','live_review','enabled','suspended')),
  required_fields text[] not null default array['beneficiary_name','account_number']::text[],
  optional_fields text[] not null default array[]::text[],
  route_config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(route_config) = 'object'),
  provider_approved boolean not null default false,
  sandbox_verified_at timestamptz,
  live_verified_at timestamptz,
  enabled_at timestamptz,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dcds_intl_route_enable_guard check (
    status <> 'enabled'
    or (provider_approved = true and sandbox_verified_at is not null and live_verified_at is not null and enabled_at is not null)
  )
);

create index if not exists dcds_intl_routes_status_idx
  on public.dcds_international_payout_routes(status, country_code, currency);

create table if not exists public.dcds_international_payout_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  route_id uuid not null references public.dcds_international_payout_routes(id) on delete restrict,
  beneficiary_name text not null
    check (char_length(trim(beneficiary_name)) between 2 and 160),
  beneficiary_data_ciphertext text not null
    check (char_length(beneficiary_data_ciphertext) >= 32),
  account_hint_last4 text not null
    check (account_hint_last4 ~ '^[A-Za-z0-9]{4}$'),
  verification_status text not null default 'pending'
    check (verification_status in ('pending','verified','failed','disabled')),
  provider_beneficiary_id text,
  verified_at timestamptz,
  verification_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dcds_intl_account_verified_guard check (
    verification_status <> 'verified' or verified_at is not null
  ),
  constraint dcds_intl_one_account_per_route unique (user_id, route_id)
);

create index if not exists dcds_intl_accounts_user_idx
  on public.dcds_international_payout_accounts(user_id, created_at desc);

create table if not exists public.dcds_international_payout_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  route_id uuid not null references public.dcds_international_payout_routes(id) on delete restrict,
  source_amount_ngn numeric(14,2) not null check (source_amount_ngn >= 5000),
  destination_amount numeric(18,6) not null check (destination_amount > 0),
  destination_currency text not null check (destination_currency ~ '^[A-Z]{3}$'),
  fx_rate numeric(24,12) not null check (fx_rate > 0),
  provider_fee_amount numeric(18,6) not null default 0 check (provider_fee_amount >= 0),
  provider_fee_currency text not null check (provider_fee_currency ~ '^[A-Z]{3}$'),
  provider_quote_reference text,
  idempotency_key text not null unique,
  status text not null default 'quoted'
    check (status in ('quoted','accepted','expired','consumed','cancelled')),
  quoted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  consumed_at timestamptz,
  constraint dcds_intl_quote_expiry_guard check (expires_at > quoted_at)
);

create index if not exists dcds_intl_quotes_user_idx
  on public.dcds_international_payout_quotes(user_id, quoted_at desc);

-- Supported Flutterwave transfer corridors are listed for controlled rollout only.
-- All routes remain disabled until DCDS independently verifies its merchant account,
-- country-specific beneficiary fields, sandbox results, live route and funding.
insert into public.dcds_international_payout_routes
  (route_code,country_code,country_name,currency,payout_method,status,required_fields,internal_notes)
values
  ('FLW_US_USD_BANK','US','United States','USD','bank_account','disabled',
   array['beneficiary_name','account_number','routing_number']::text[],
   'Provider guide lists USD bank transfers to the United States. Confirm DCDS merchant eligibility and required account metadata.'),
  ('FLW_GB_GBP_BANK','GB','United Kingdom','GBP','bank_account','disabled',
   array['beneficiary_name','account_number']::text[],
   'Provider guide lists GBP bank transfers to the UK. Confirm the route-specific sort code/IBAN requirements before enabling.'),
  ('FLW_EU_EUR_BANK','EU','SEPA bank transfer area','EUR','bank_account','disabled',
   array['beneficiary_name','iban']::text[],
   'SEPA destination coverage is country-specific. Enable individual destinations only after checking the beneficiary country and bank requirements.'),
  ('FLW_GH_GHS_BANK','GH','Ghana','GHS','bank_account','disabled',
   array['beneficiary_name','account_number','account_bank']::text[],
   'Confirm bank/branch requirements against the live provider bank list before enabling.'),
  ('FLW_KE_KES_BANK','KE','Kenya','KES','bank_account','disabled',
   array['beneficiary_name','account_number','account_bank']::text[],
   'Confirm current bank code and local validation requirements before enabling.'),
  ('FLW_MW_MWK_BANK','MW','Malawi','MWK','bank_account','disabled',
   array['beneficiary_name','account_number','account_bank']::text[],
   'Route remains disabled pending merchant and sandbox verification.'),
  ('FLW_TZ_TZS_BANK','TZ','Tanzania','TZS','bank_account','disabled',
   array['beneficiary_name','account_number','account_bank']::text[],
   'Route remains disabled pending merchant and sandbox verification.'),
  ('FLW_UG_UGX_BANK','UG','Uganda','UGX','bank_account','disabled',
   array['beneficiary_name','account_number','account_bank']::text[],
   'Route remains disabled pending merchant and sandbox verification.'),
  ('FLW_CM_XAF_BANK','CM','Cameroon','XAF','bank_account','disabled',
   array['beneficiary_name','account_number','account_bank']::text[],
   'Route remains disabled pending merchant and sandbox verification.'),
  ('FLW_CI_XOF_BANK','CI','Cote d''Ivoire','XOF','bank_account','disabled',
   array['beneficiary_name','account_number','account_bank']::text[],
   'Route remains disabled pending merchant and sandbox verification.'),
  ('FLW_SN_XOF_BANK','SN','Senegal','XOF','bank_account','disabled',
   array['beneficiary_name','account_number','account_bank']::text[],
   'Route remains disabled pending merchant and sandbox verification.'),
  ('FLW_ZA_ZAR_BANK','ZA','South Africa','ZAR','bank_account','disabled',
   array['beneficiary_name','account_number','account_bank']::text[],
   'Route remains disabled pending merchant and sandbox verification.')
on conflict (route_code) do nothing;

alter table public.dcds_international_payout_routes enable row level security;
alter table public.dcds_international_payout_accounts enable row level security;
alter table public.dcds_international_payout_quotes enable row level security;

-- All access goes through authenticated Edge Functions using the server-side service role.
-- No direct browser/Data API access is granted to anon or authenticated users.
revoke all on public.dcds_international_payout_routes from public, anon, authenticated;
revoke all on public.dcds_international_payout_accounts from public, anon, authenticated;
revoke all on public.dcds_international_payout_quotes from public, anon, authenticated;

grant select, insert, update, delete on public.dcds_international_payout_routes to service_role;
grant select, insert, update, delete on public.dcds_international_payout_accounts to service_role;
grant select, insert, update, delete on public.dcds_international_payout_quotes to service_role;

comment on table public.dcds_international_payout_routes is
  'Country/currency provider corridors. Disabled by default; enabled status requires provider approval plus sandbox and live verification timestamps.';
comment on table public.dcds_international_payout_accounts is
  'Encrypted international beneficiary payloads. No direct client access; managed only by authenticated server-side functions.';
comment on table public.dcds_international_payout_quotes is
  'Short-lived NGN-to-destination payout FX quote snapshots. Not a payout request or transfer instruction.';

commit;
