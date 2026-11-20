-- Atomic wallet operations. These RPCs are callable only by service_role;
-- Edge Functions must authenticate the customer and verify provider/payment data first.

create or replace function public.dcds_internal_wallet_credit_funding(
  p_funding_intent_id uuid,
  p_flutterwave_transaction_id text,
  p_verification jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_intent public.dcds_wallet_funding_intents%rowtype;
  v_account public.dcds_wallet_accounts%rowtype;
  v_ledger public.dcds_wallet_ledger%rowtype;
begin
  if p_funding_intent_id is null or nullif(btrim(p_flutterwave_transaction_id), '') is null then
    raise exception 'Funding reference and verified Flutterwave transaction are required';
  end if;

  select * into v_intent
  from public.dcds_wallet_funding_intents
  where id = p_funding_intent_id
  for update;

  if not found then raise exception 'Wallet funding request not found'; end if;

  if v_intent.status = 'credited' then
    if v_intent.flutterwave_transaction_id <> p_flutterwave_transaction_id then
      raise exception 'Funding request is already credited with a different transaction';
    end if;
    select * into v_account from public.dcds_wallet_accounts where user_id = v_intent.user_id;
    select * into v_ledger from public.dcds_wallet_ledger
      where related_funding_intent_id = v_intent.id;
    return jsonb_build_object('success', true, 'already_credited', true,
      'balance', v_account.balance, 'ledger_id', v_ledger.id);
  end if;

  if v_intent.status <> 'pending' or v_intent.expires_at < now() then
    raise exception 'Funding request is not eligible for credit';
  end if;

  insert into public.dcds_wallet_accounts(user_id)
  values (v_intent.user_id)
  on conflict (user_id) do nothing;

  select * into v_account
  from public.dcds_wallet_accounts
  where user_id = v_intent.user_id
  for update;

  if v_account.status <> 'active' then raise exception 'Wallet is not active'; end if;

  update public.dcds_wallet_accounts
  set balance = balance + v_intent.amount, updated_at = now()
  where user_id = v_intent.user_id
  returning * into v_account;

  insert into public.dcds_wallet_ledger(
    user_id, entry_type, direction, amount, currency, reference,
    balance_after, related_funding_intent_id, description, metadata
  ) values (
    v_intent.user_id, 'funding_credit', 'credit', v_intent.amount, 'NGN',
    'funding:' || v_intent.tx_ref, v_account.balance, v_intent.id,
    'Wallet funding confirmed by Flutterwave',
    coalesce(p_verification, '{}'::jsonb)
  ) returning * into v_ledger;

  update public.dcds_wallet_funding_intents
  set status = 'credited',
      flutterwave_transaction_id = p_flutterwave_transaction_id,
      verification = coalesce(p_verification, '{}'::jsonb),
      credited_at = now(),
      updated_at = now()
  where id = v_intent.id;

  return jsonb_build_object('success', true, 'already_credited', false,
    'balance', v_account.balance, 'ledger_id', v_ledger.id);
end;
$$;

create or replace function public.dcds_internal_wallet_debit_vtu(
  p_user_id uuid,
  p_client_request_id uuid,
  p_service_type text,
  p_network text,
  p_recipient_phone text,
  p_data_plan_id text,
  p_data_plan_name text,
  p_amount numeric,
  p_provider_cost numeric,
  p_provider_request_id text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_account public.dcds_wallet_accounts%rowtype;
  v_order public.dcds_vtu_wallet_orders%rowtype;
  v_balance numeric(14,2);
begin
  if p_user_id is null or p_client_request_id is null then raise exception 'Customer and idempotency key are required'; end if;
  if p_service_type not in ('airtime','data') then raise exception 'Unsupported service type'; end if;
  if p_network not in ('mtn','glo','9mobile','airtel','spectranet','smile') then raise exception 'Unsupported network'; end if;
  if p_amount is null or p_amount <= 0 or p_provider_cost is null or p_provider_cost <= 0 or p_amount < p_provider_cost then
    raise exception 'Invalid wallet purchase amount';
  end if;
  if p_service_type = 'data' and (nullif(btrim(p_data_plan_id),'') is null or nullif(btrim(p_data_plan_name),'') is null) then
    raise exception 'A valid data plan is required';
  end if;
  if p_service_type = 'airtime' and (p_data_plan_id is not null or p_data_plan_name is not null) then
    raise exception 'Airtime cannot include data plan fields';
  end if;
  if nullif(btrim(p_provider_request_id),'') is null then raise exception 'Provider request ID is required'; end if;

  select * into v_order
  from public.dcds_vtu_wallet_orders
  where user_id = p_user_id and client_request_id = p_client_request_id;

  if found then
    if v_order.service_type <> p_service_type or v_order.network <> p_network or
       v_order.recipient_phone <> p_recipient_phone or v_order.amount <> p_amount or
       coalesce(v_order.data_plan_id,'') <> coalesce(p_data_plan_id,'') then
      raise exception 'Idempotency key was already used for different purchase details';
    end if;
    select balance into v_balance from public.dcds_wallet_accounts where user_id = p_user_id;
    return jsonb_build_object('success', true, 'already_created', true,
      'order_id', v_order.id, 'status', v_order.status, 'balance', coalesce(v_balance,0));
  end if;

  select * into v_account
  from public.dcds_wallet_accounts
  where user_id = p_user_id
  for update;

  if not found or v_account.status <> 'active' then raise exception 'Active wallet not found'; end if;
  if v_account.balance < p_amount then raise exception 'Insufficient wallet balance'; end if;

  update public.dcds_wallet_accounts
  set balance = balance - p_amount, updated_at = now()
  where user_id = p_user_id
  returning balance into v_balance;

  insert into public.dcds_vtu_wallet_orders(
    user_id, client_request_id, service_type, network, recipient_phone,
    data_plan_id, data_plan_name, amount, provider_cost, wallet_debit_reference,
    provider_request_id, status
  ) values (
    p_user_id, p_client_request_id, p_service_type, p_network, p_recipient_phone,
    p_data_plan_id, p_data_plan_name, p_amount, p_provider_cost,
    'vtu-debit:' || p_provider_request_id, p_provider_request_id, 'processing'
  ) returning * into v_order;

  insert into public.dcds_wallet_ledger(
    user_id, entry_type, direction, amount, currency, reference,
    balance_after, related_vtu_order_id, description, metadata
  ) values (
    p_user_id, 'vtu_debit', 'debit', p_amount, 'NGN',
    'vtu-debit:' || p_provider_request_id, v_balance, v_order.id,
    'Airtime or data purchase',
    jsonb_build_object('network', p_network, 'service_type', p_service_type,
      'recipient_phone_last4', right(p_recipient_phone,4))
  );

  return jsonb_build_object('success', true, 'already_created', false,
    'order_id', v_order.id, 'status', v_order.status, 'balance', v_balance);
end;
$$;

create or replace function public.dcds_internal_wallet_refund_vtu(
  p_order_id uuid,
  p_reason text,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.dcds_vtu_wallet_orders%rowtype;
  v_account public.dcds_wallet_accounts%rowtype;
  v_balance numeric(14,2);
  v_ledger_id uuid;
begin
  select * into v_order from public.dcds_vtu_wallet_orders where id = p_order_id for update;
  if not found then raise exception 'Wallet purchase not found'; end if;

  if v_order.status = 'refunded' then
    select balance into v_balance from public.dcds_wallet_accounts where user_id = v_order.user_id;
    select id into v_ledger_id from public.dcds_wallet_ledger where reference = 'vtu-refund:' || v_order.id;
    return jsonb_build_object('success', true, 'already_refunded', true,
      'balance', v_balance, 'ledger_id', v_ledger_id);
  end if;

  if v_order.status not in ('refund_required','failed') then
    raise exception 'Only a definitively failed purchase can be refunded';
  end if;

  select * into v_account from public.dcds_wallet_accounts
  where user_id = v_order.user_id for update;
  if not found then raise exception 'Wallet account not found'; end if;

  update public.dcds_wallet_accounts
  set balance = balance + v_order.amount, updated_at = now()
  where user_id = v_order.user_id
  returning balance into v_balance;

  insert into public.dcds_wallet_ledger(
    user_id, entry_type, direction, amount, currency, reference,
    balance_after, related_vtu_order_id, description, metadata
  ) values (
    v_order.user_id, 'vtu_refund', 'credit', v_order.amount, 'NGN',
    'vtu-refund:' || v_order.id, v_balance, v_order.id,
    left(coalesce(nullif(p_reason,''),'Airtime or data purchase refund'),180),
    coalesce(p_metadata,'{}'::jsonb)
  ) returning id into v_ledger_id;

  update public.dcds_vtu_wallet_orders
  set status = 'refunded', last_error = left(coalesce(p_reason,''),500), updated_at = now()
  where id = v_order.id;

  return jsonb_build_object('success', true, 'already_refunded', false,
    'balance', v_balance, 'ledger_id', v_ledger_id);
end;
$$;

-- Only trusted Edge Functions may invoke wallet mutation RPCs.
revoke all on function public.dcds_internal_wallet_credit_funding(uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.dcds_internal_wallet_debit_vtu(uuid,uuid,text,text,text,text,text,numeric,numeric,text) from public, anon, authenticated;
revoke all on function public.dcds_internal_wallet_refund_vtu(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.dcds_internal_wallet_credit_funding(uuid,text,jsonb) to service_role;
grant execute on function public.dcds_internal_wallet_debit_vtu(uuid,uuid,text,text,text,text,text,numeric,numeric,text) to service_role;
grant execute on function public.dcds_internal_wallet_refund_vtu(uuid,text,jsonb) to service_role;

-- Ledger entries are append-only even for server-side application code.
revoke update, delete, truncate on public.dcds_wallet_ledger from service_role;
grant select, insert on public.dcds_wallet_ledger to service_role;
