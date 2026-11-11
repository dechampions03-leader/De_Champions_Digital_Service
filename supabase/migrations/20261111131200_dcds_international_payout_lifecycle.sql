-- Complete DCDS international payout lifecycle.
-- Currency conversion, per-reward allocation, request, audit and settlement.
-- Routes remain disabled until provider gates and route evidence are satisfied.

begin;

create table if not exists public.dcds_international_payout_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  payout_account_id uuid not null references public.dcds_international_payout_accounts(id) on delete restrict,
  quote_id uuid not null unique references public.dcds_international_payout_quotes(id) on delete restrict,
  source_amount_ngn numeric(14,2) not null check (source_amount_ngn >= 5000),
  destination_amount numeric(18,6) not null check (destination_amount > 0),
  destination_currency text not null check (destination_currency ~ '^[A-Z]{3}$'),
  fx_rate numeric(24,12) not null check (fx_rate > 0),
  provider_fee_amount numeric(18,6) not null default 0 check (provider_fee_amount >= 0),
  provider_fee_currency text not null check (provider_fee_currency ~ '^[A-Z]{3}$'),
  status text not null default 'requested'
    check (status in ('requested','processing','paid','failed','cancelled','manual_review')),
  transfer_reference text not null unique,
  provider_transfer_id text unique,
  failure_reason text,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dcds_intl_payout_requests_user_idx
  on public.dcds_international_payout_requests(user_id, requested_at desc);
create index if not exists dcds_intl_payout_requests_status_idx
  on public.dcds_international_payout_requests(status, requested_at desc);
create unique index if not exists dcds_intl_one_open_request_per_user
  on public.dcds_international_payout_requests(user_id)
  where status in ('requested','processing','manual_review');

create table if not exists public.dcds_international_payout_allocations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.dcds_international_payout_requests(id) on delete restrict,
  reward_ledger_id uuid not null references public.dcds_reward_ledger(id) on delete restrict,
  amount_ngn numeric(14,2) not null check (amount_ngn > 0),
  status text not null default 'reserved'
    check (status in ('reserved','paid','released')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  released_at timestamptz,
  unique (request_id, reward_ledger_id)
);

create index if not exists dcds_intl_allocations_reward_idx
  on public.dcds_international_payout_allocations(reward_ledger_id, status);
create unique index if not exists dcds_intl_one_reserved_allocation_per_reward
  on public.dcds_international_payout_allocations(reward_ledger_id)
  where status = 'reserved';

create table if not exists public.dcds_international_payout_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.dcds_international_payout_requests(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  provider_event_key text unique,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details)='object'),
  created_at timestamptz not null default now()
);
create index if not exists dcds_intl_payout_events_request_idx
  on public.dcds_international_payout_events(request_id, created_at desc);

-- Configure the destination-specific data required by Flutterwave's v3 bank-transfer API.
update public.dcds_international_payout_routes
set required_fields = array[
      'beneficiary_name','account_number','routing_number','bank_name',
      'beneficiary_address','postal_code','street_number','city','account_type'
    ]::text[],
    optional_fields = array[
      'swift_code','email','mobile_number','sender_address',
      'sender_mobile_number','street_name'
    ]::text[],
    route_config = jsonb_build_object(
      'country_for_bank_list','US',
      'transfer_meta_fields',jsonb_build_array(
        'routing_number','swift_code','bank_name','account_type','email',
        'mobile_number','beneficiary_address','sender_address',
        'sender_mobile_number','postal_code','street_number','street_name','city'
      ),
      'top_level_account_bank',false,
      'amount_precision',2,
      'provider_verification','admin_review'
    ),
    updated_at=now()
where route_code='FLW_US_USD_BANK';

update public.dcds_international_payout_routes
set required_fields = array[
      'beneficiary_name','account_number','routing_number','bank_name','account_type'
    ]::text[],
    optional_fields = array[
      'swift_code','email','mobile_number','beneficiary_address',
      'sender_address','sender_mobile_number','postal_code','street_number',
      'street_name','city'
    ]::text[],
    route_config = jsonb_build_object(
      'country_for_bank_list','GB',
      'transfer_meta_fields',jsonb_build_array(
        'routing_number','swift_code','bank_name','account_type','email',
        'mobile_number','beneficiary_address','sender_address',
        'sender_mobile_number','postal_code','street_number','street_name','city'
      ),
      'top_level_account_bank',false,
      'amount_precision',2,
      'provider_verification','admin_review'
    ),
    updated_at=now()
where route_code='FLW_GB_GBP_BANK';

update public.dcds_international_payout_routes
set required_fields = array[
      'beneficiary_name','account_number','routing_number','swift_code',
      'bank_name','postal_code','street_number','city'
    ]::text[],
    optional_fields = array[
      'email','mobile_number','beneficiary_address','sender_address',
      'sender_mobile_number','street_name'
    ]::text[],
    route_config = jsonb_build_object(
      'country_for_bank_list','DE',
      'transfer_meta_fields',jsonb_build_array(
        'routing_number','swift_code','bank_name','email','mobile_number',
        'beneficiary_address','sender_address','sender_mobile_number',
        'postal_code','street_number','street_name','city'
      ),
      'top_level_account_bank',false,
      'amount_precision',2,
      'provider_verification','admin_review',
      'country_selection_required',true
    ),
    updated_at=now()
where route_code='FLW_EU_EUR_BANK';

update public.dcds_international_payout_routes
set required_fields = array['beneficiary_name','account_number','account_bank','bank_name']::text[],
    optional_fields = array['email','mobile_number','branch_code']::text[],
    route_config = jsonb_build_object(
      'country_for_bank_list',country_code,
      'transfer_meta_fields',jsonb_build_array('bank_name','email','mobile_number','branch_code'),
      'top_level_account_bank',true,
      'amount_precision',2,
      'provider_verification','admin_review'
    ),
    updated_at=now()
where route_code in ('FLW_GH_GHS_BANK','FLW_KE_KES_BANK','FLW_MW_MWK_BANK',
                     'FLW_TZ_TZS_BANK','FLW_UG_UGX_BANK','FLW_CM_XAF_BANK',
                     'FLW_CI_XOF_BANK','FLW_SN_XOF_BANK','FLW_ZA_ZAR_BANK');

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

-- Atomic reservation of reward balances for an international payout.
create or replace function private.dcds_create_international_payout_request(
  p_user_id uuid,
  p_quote_id uuid,
  p_payout_account_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_ambassador public.dcds_ambassadors%rowtype;
  v_quote public.dcds_international_payout_quotes%rowtype;
  v_account public.dcds_international_payout_accounts%rowtype;
  v_route public.dcds_international_payout_routes%rowtype;
  v_request_id uuid;
  v_reference text;
  v_available numeric(14,2);
  v_remaining numeric(14,2);
  v_row record;
  v_reserve numeric(14,2);
begin
  if p_user_id is null or p_quote_id is null or p_payout_account_id is null then
    raise exception 'User, quote and payout account are required.';
  end if;

  select * into v_ambassador from public.dcds_ambassadors
   where user_id=p_user_id for update;
  if not found or v_ambassador.status <> 'active' then
    raise exception 'Active ambassador status is required.';
  end if;

  select * into v_quote from public.dcds_international_payout_quotes
   where id=p_quote_id and user_id=p_user_id for update;
  if not found or v_quote.status <> 'quoted' then
    raise exception 'This payout quote is no longer available.';
  end if;
  if v_quote.expires_at <= now() then
    update public.dcds_international_payout_quotes set status='expired' where id=v_quote.id;
    raise exception 'This FX quote has expired. Request a fresh quote.';
  end if;

  select * into v_account from public.dcds_international_payout_accounts
   where id=p_payout_account_id and user_id=p_user_id for update;
  if not found or v_account.verification_status <> 'verified' then
    raise exception 'A DCDS-verified international beneficiary is required.';
  end if;
  if v_account.route_id <> v_quote.route_id then
    raise exception 'The verified beneficiary does not match the quoted payout corridor.';
  end if;

  select * into v_route from public.dcds_international_payout_routes
   where id=v_quote.route_id for update;
  if not found or v_route.status <> 'enabled' then
    raise exception 'This destination corridor is not enabled.';
  end if;

  if exists (
    select 1 from public.dcds_international_payout_requests
     where user_id=p_user_id and status in ('requested','processing','manual_review')
  ) or exists (
    select 1 from public.dcds_payout_requests
     where user_id=p_user_id and status in ('requested','processing')
  ) then
    raise exception 'You already have a withdrawal request being processed.';
  end if;

  select coalesce(sum(greatest(l.amount-coalesce(a.paid_amount,0),0)),0)
    into v_available
  from public.dcds_reward_ledger l
  left join lateral (
    select sum(x.amount_ngn) as paid_amount
    from public.dcds_international_payout_allocations x
    where x.reward_ledger_id=l.id and x.status='paid'
  ) a on true
  where l.ambassador_user_id=p_user_id
    and l.currency='NGN'
    and l.status='available'
    and l.payout_request_id is null;

  if v_quote.source_amount_ngn < 5000 then
    raise exception 'The NGN equivalent must be at least ₦5,000.';
  end if;
  if v_quote.source_amount_ngn > v_available then
    raise exception 'Your available reward balance is lower than this FX quote.';
  end if;

  v_request_id:=gen_random_uuid();
  v_reference:='DCDS-INTL-'||upper(replace(v_request_id::text,'-',''));
  insert into public.dcds_international_payout_requests (
    id,user_id,payout_account_id,quote_id,source_amount_ngn,
    destination_amount,destination_currency,fx_rate,
    provider_fee_amount,provider_fee_currency,status,transfer_reference
  ) values (
    v_request_id,p_user_id,p_payout_account_id,v_quote.id,v_quote.source_amount_ngn,
    v_quote.destination_amount,v_quote.destination_currency,v_quote.fx_rate,
    v_quote.provider_fee_amount,v_quote.provider_fee_currency,'requested',v_reference
  );

  v_remaining:=v_quote.source_amount_ngn;
  for v_row in
    select l.id,l.amount,coalesce(a.paid_amount,0) as paid_amount
    from public.dcds_reward_ledger l
    left join lateral (
      select sum(x.amount_ngn) as paid_amount
      from public.dcds_international_payout_allocations x
      where x.reward_ledger_id=l.id and x.status='paid'
    ) a on true
    where l.ambassador_user_id=p_user_id
      and l.currency='NGN'
      and l.status='available'
      and l.payout_request_id is null
    order by l.created_at,l.id
    for update of l
  loop
    exit when v_remaining <= 0;
    v_reserve:=least(v_remaining,greatest(v_row.amount-v_row.paid_amount,0));
    if v_reserve > 0 then
      insert into public.dcds_international_payout_allocations
        (request_id,reward_ledger_id,amount_ngn,status)
      values(v_request_id,v_row.id,v_reserve,'reserved');
      update public.dcds_reward_ledger set status='held' where id=v_row.id;
      v_remaining:=v_remaining-v_reserve;
    end if;
  end loop;

  if v_remaining > 0.01 then
    raise exception 'Reward balances changed while reserving this payout. Refresh and request a new quote.';
  end if;

  update public.dcds_international_payout_quotes
     set status='consumed',accepted_at=now(),consumed_at=now()
   where id=v_quote.id;

  insert into public.dcds_international_payout_events(request_id,user_id,event_type,details)
  values(v_request_id,p_user_id,'requested',jsonb_build_object(
    'quote_id',v_quote.id,'source_amount_ngn',v_quote.source_amount_ngn,
    'destination_amount',v_quote.destination_amount,
    'destination_currency',v_quote.destination_currency,
    'transfer_reference',v_reference
  ));

  return jsonb_build_object(
    'success',true,'request_id',v_request_id,'transfer_reference',v_reference,
    'source_amount_ngn',v_quote.source_amount_ngn,
    'destination_amount',v_quote.destination_amount,
    'destination_currency',v_quote.destination_currency,'status','requested'
  );
end;
$function$;

-- Idempotent state transitions; rewards are only released after verified failure/cancellation.
create or replace function private.dcds_transition_international_payout(
  p_request_id uuid,
  p_new_status text,
  p_actor_user_id uuid default null,
  p_provider_transfer_id text default null,
  p_failure_reason text default null,
  p_details jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_request public.dcds_international_payout_requests%rowtype;
begin
  if p_new_status not in ('processing','paid','failed','cancelled','manual_review') then
    raise exception 'Unsupported international payout transition.';
  end if;
  select * into v_request from public.dcds_international_payout_requests
   where id=p_request_id for update;
  if not found then raise exception 'International payout request not found.'; end if;

  if v_request.status=p_new_status then
    if p_new_status in ('processing','manual_review')
       and nullif(trim(coalesce(p_provider_transfer_id,'')),'') is not null then
      if v_request.provider_transfer_id is not null
         and v_request.provider_transfer_id<>p_provider_transfer_id then
        raise exception 'A different provider transfer is already attached.';
      end if;
      update public.dcds_international_payout_requests
       set provider_transfer_id=p_provider_transfer_id,updated_at=now()
       where id=p_request_id;
    end if;
    return jsonb_build_object('success',true,'status',v_request.status,'unchanged',true);
  end if;

  if v_request.status not in ('requested','processing','manual_review') then
    raise exception 'This international payout request is already closed.';
  end if;

  if p_new_status='processing' then
    if v_request.status<>'requested' then
      raise exception 'Only a new request can enter processing. Reconcile existing transfers instead.';
    end if;
    update public.dcds_international_payout_requests
      set status='processing',
          provider_transfer_id=coalesce(p_provider_transfer_id,provider_transfer_id),
          updated_at=now()
      where id=p_request_id;

  elsif p_new_status='manual_review' then
    update public.dcds_international_payout_requests
      set status='manual_review',
          provider_transfer_id=coalesce(p_provider_transfer_id,provider_transfer_id),
          failure_reason=left(coalesce(p_failure_reason,'Transfer outcome needs manual reconciliation.'),500),
          updated_at=now()
      where id=p_request_id;

  elsif p_new_status='paid' then
    if v_request.status not in ('processing','manual_review') then
      raise exception 'Payout must be processing or under reconciliation before it can be paid.';
    end if;
    if nullif(trim(coalesce(p_provider_transfer_id,v_request.provider_transfer_id,'')),'') is null then
      raise exception 'Verified provider transfer ID is required.';
    end if;
    update public.dcds_international_payout_requests
      set status='paid',provider_transfer_id=coalesce(p_provider_transfer_id,provider_transfer_id),
          processed_at=now(),failure_reason=null,updated_at=now()
      where id=p_request_id;
    update public.dcds_international_payout_allocations
      set status='paid',paid_at=now()
      where request_id=p_request_id and status='reserved';
    update public.dcds_reward_ledger l
       set status=case when (
         select coalesce(sum(a.amount_ngn),0)
         from public.dcds_international_payout_allocations a
         where a.reward_ledger_id=l.id and a.status='paid'
       ) >= l.amount then 'paid' else 'available' end
     where l.id in (
       select reward_ledger_id from public.dcds_international_payout_allocations
       where request_id=p_request_id
     );

  elsif p_new_status in ('failed','cancelled') then
    if v_request.status not in ('requested','processing','manual_review') then
      raise exception 'Payout cannot be released from this state.';
    end if;
    update public.dcds_international_payout_requests
      set status=p_new_status,
          failure_reason=left(coalesce(p_failure_reason,
            case when p_new_status='cancelled' then 'Withdrawal cancelled before settlement.' else 'Provider confirmed that the transfer failed.' end),500),
          processed_at=now(),updated_at=now()
      where id=p_request_id;
    update public.dcds_international_payout_allocations
      set status='released',released_at=now()
      where request_id=p_request_id and status='reserved';
    update public.dcds_reward_ledger l
       set status=case when (
         select coalesce(sum(a.amount_ngn),0)
         from public.dcds_international_payout_allocations a
         where a.reward_ledger_id=l.id and a.status='paid'
       ) >= l.amount then 'paid' else 'available' end
     where l.id in (
       select reward_ledger_id from public.dcds_international_payout_allocations
       where request_id=p_request_id
     );
  end if;

  insert into public.dcds_international_payout_events(
    request_id,user_id,event_type,actor_user_id,details
  ) values (
    p_request_id,v_request.user_id,p_new_status,p_actor_user_id,
    coalesce(p_details,'{}'::jsonb)||jsonb_build_object(
      'provider_transfer_id',coalesce(p_provider_transfer_id,v_request.provider_transfer_id),
      'failure_reason',p_failure_reason
    )
  );
  return jsonb_build_object('success',true,'status',p_new_status);
end;
$function$;

-- Local NGN withdrawals must account for amounts already paid through an international route.
create or replace function public.dcds_create_payout_request(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_account public.dcds_payout_accounts%rowtype;
  v_ambassador public.dcds_ambassadors%rowtype;
  v_amount numeric(12,2);
  v_request_id uuid;
  v_reference text;
  v_existing uuid;
begin
  if p_user_id is null then raise exception 'User identity is required.'; end if;

  select * into v_ambassador from public.dcds_ambassadors
   where user_id=p_user_id for update;
  if not found or v_ambassador.status <> 'active' then
    raise exception 'Active ambassador status is required.';
  end if;

  select * into v_account from public.dcds_payout_accounts
   where user_id=p_user_id for update;
  if not found or v_account.verification_status <> 'verified' then
    raise exception 'A verified payout bank account is required.';
  end if;

  if exists (
    select 1 from public.dcds_international_payout_requests
    where user_id=p_user_id and status in ('requested','processing','manual_review')
  ) then
    raise exception 'You already have an international withdrawal being processed.';
  end if;

  select id into v_existing from public.dcds_payout_requests
   where user_id=p_user_id and status in ('requested','processing')
   limit 1 for update;
  if found then raise exception 'You already have a payout request being processed.'; end if;

  select coalesce(sum(greatest(l.amount-coalesce(a.paid_amount,0),0)),0)::numeric(12,2)
    into v_amount
  from public.dcds_reward_ledger l
  left join lateral (
    select sum(x.amount_ngn) as paid_amount
    from public.dcds_international_payout_allocations x
    where x.reward_ledger_id=l.id and x.status='paid'
  ) a on true
  where l.ambassador_user_id=p_user_id
    and l.currency='NGN'
    and l.status='available'
    and l.payout_request_id is null;

  if v_amount < 5000 then
    raise exception 'Your available reward balance has not reached the ₦5,000 minimum.';
  end if;

  v_request_id:=gen_random_uuid();
  v_reference:='DCDS-PAYOUT-'||upper(replace(v_request_id::text,'-',''));
  insert into public.dcds_payout_requests
    (id,user_id,payout_account_id,amount,currency,status,transfer_reference)
  values (v_request_id,p_user_id,v_account.id,v_amount,'NGN','requested',v_reference);

  update public.dcds_reward_ledger
   set status='held',payout_request_id=v_request_id
   where ambassador_user_id=p_user_id and status='available'
     and payout_request_id is null;
  if not found then raise exception 'No available rewards could be reserved.'; end if;

  return jsonb_build_object('request_id',v_request_id,'amount',v_amount,'currency','NGN',
    'status','requested','transfer_reference',v_reference,
    'account_last4',v_account.account_number_last4,'bank_name',v_account.bank_name);
end;
$function$;

-- Refunds/reversals must not erase reserved or already-paid international amounts.
create or replace function public.dcds_reverse_referral_reward(
  p_order_id uuid,
  p_reason text,
  p_actor_user_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_reward public.dcds_reward_ledger%rowtype;
  v_payout_status text;
  v_reason text;
  v_intl_paid numeric(14,2);
  v_intl_reserved numeric(14,2);
  v_unpaid numeric(14,2);
begin
  if p_order_id is null then raise exception 'Order ID is required.'; end if;
  v_reason:=left(trim(coalesce(p_reason,'')),500);
  if v_reason='' then raise exception 'A refund or reversal reason is required.'; end if;

  select * into v_reward from public.dcds_reward_ledger
   where order_id=p_order_id for update;
  if not found then return jsonb_build_object('success',true,'result','no_referral_reward'); end if;

  if exists(select 1 from public.dcds_reward_events
    where reward_ledger_id=v_reward.id and event_type in ('reward_reversed','recovery_due')) then
    return jsonb_build_object('success',true,'result','already_reversed');
  end if;

  select coalesce(sum(amount_ngn) filter (where status='paid'),0),
         coalesce(sum(amount_ngn) filter (where status='reserved'),0)
    into v_intl_paid,v_intl_reserved
  from public.dcds_international_payout_allocations
  where reward_ledger_id=v_reward.id;

  if v_intl_reserved > 0 then
    raise exception 'Reward is reserved in an international payout. Reconcile or close that payout before refunding this course order.';
  end if;

  if v_reward.status='held' and v_reward.payout_request_id is not null then
    select status into v_payout_status from public.dcds_payout_requests
     where id=v_reward.payout_request_id for update;
    if v_payout_status in ('requested','processing') then
      raise exception 'Reward is reserved in an open payout. Reconcile or close that payout before refunding this course order.';
    end if;
  end if;

  v_unpaid:=greatest(v_reward.amount-v_intl_paid,0);

  if v_intl_paid>0 then
    insert into public.dcds_reward_events
      (reward_ledger_id,order_id,ambassador_user_id,event_type,amount,reason,actor_user_id,details)
    values(v_reward.id,p_order_id,v_reward.ambassador_user_id,'recovery_due',-v_intl_paid,v_reason,p_actor_user_id,
      jsonb_build_object('note','International reward portion was already paid; recovery liability requires administrator review.'));
  end if;

  if v_unpaid>0 then
    insert into public.dcds_reward_events
      (reward_ledger_id,order_id,ambassador_user_id,event_type,amount,reason,actor_user_id,details)
    values(v_reward.id,p_order_id,v_reward.ambassador_user_id,'reward_reversed',-v_unpaid,v_reason,p_actor_user_id,
      jsonb_build_object('note','Unpaid reward remainder reversed.'));
  end if;

  update public.dcds_reward_ledger
    set status='reversed',reversed_at=now(),reversal_reason=v_reason
    where id=v_reward.id;

  return jsonb_build_object(
    'success',true,
    'result',case when v_intl_paid>0 then 'recovery_due' else 'reward_reversed' end,
    'recovered_amount',v_intl_paid,
    'reversed_amount',v_unpaid
  );
end;
$function$;

revoke all on function private.dcds_create_international_payout_request(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function private.dcds_transition_international_payout(uuid,text,uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function private.dcds_create_international_payout_request(uuid,uuid,uuid) to service_role;
grant execute on function private.dcds_transition_international_payout(uuid,text,uuid,text,text,jsonb) to service_role;

revoke all on function public.dcds_create_payout_request(uuid) from public, anon, authenticated;
grant execute on function public.dcds_create_payout_request(uuid) to service_role;
revoke all on function public.dcds_reverse_referral_reward(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.dcds_reverse_referral_reward(uuid,text,uuid) to service_role;

alter table public.dcds_international_payout_requests enable row level security;
alter table public.dcds_international_payout_allocations enable row level security;
alter table public.dcds_international_payout_events enable row level security;
revoke all on public.dcds_international_payout_requests from public, anon, authenticated;
revoke all on public.dcds_international_payout_allocations from public, anon, authenticated;
revoke all on public.dcds_international_payout_events from public, anon, authenticated;
grant select,insert,update,delete on public.dcds_international_payout_requests to service_role;
grant select,insert,update,delete on public.dcds_international_payout_allocations to service_role;
grant select,insert,update,delete on public.dcds_international_payout_events to service_role;

commit;
