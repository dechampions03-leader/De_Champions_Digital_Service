-- Preserve correct recovery accounting when a reward was already paid locally or internationally.
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

  select * into v_reward
    from public.dcds_reward_ledger
   where order_id=p_order_id
   for update;

  if not found then
    return jsonb_build_object('success',true,'result','no_referral_reward');
  end if;

  if exists (
    select 1 from public.dcds_reward_events
     where reward_ledger_id=v_reward.id
       and event_type in ('reward_reversed','recovery_due')
  ) then
    return jsonb_build_object('success',true,'result','already_reversed');
  end if;

  if v_reward.status='reversed' then
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
    select status into v_payout_status
      from public.dcds_payout_requests
     where id=v_reward.payout_request_id
     for update;
    if v_payout_status in ('requested','processing') then
      raise exception 'Reward is reserved in an open payout. Reconcile or close that payout before refunding this course order.';
    end if;
  end if;

  -- A paid ledger row means its full ₦1,000 value has been disbursed.
  -- This includes the case where part was paid internationally and the remaining
  -- value was paid through the Nigerian payout processor.
  if v_reward.status='paid' then
    insert into public.dcds_reward_events
      (reward_ledger_id,order_id,ambassador_user_id,event_type,amount,reason,actor_user_id,details)
    values (
      v_reward.id,p_order_id,v_reward.ambassador_user_id,'recovery_due',
      -v_reward.amount,v_reason,p_actor_user_id,
      jsonb_build_object('note','Reward was fully paid before the course refund; recover the full disbursed reward through administrator review.')
    );
    return jsonb_build_object('success',true,'result','recovery_due','amount',v_reward.amount);
  end if;

  if v_reward.status not in ('available','held') then
    insert into public.dcds_reward_events
      (reward_ledger_id,order_id,ambassador_user_id,event_type,amount,reason,actor_user_id,details)
    values (
      v_reward.id,p_order_id,v_reward.ambassador_user_id,'manual_review',
      0,v_reason,p_actor_user_id,
      jsonb_build_object('note','Reward is not yet available; administrator review is required before reversal.')
    );
    return jsonb_build_object('success',true,'result','manual_review');
  end if;

  v_unpaid:=greatest(v_reward.amount-v_intl_paid,0);

  if v_intl_paid>0 then
    insert into public.dcds_reward_events
      (reward_ledger_id,order_id,ambassador_user_id,event_type,amount,reason,actor_user_id,details)
    values (
      v_reward.id,p_order_id,v_reward.ambassador_user_id,'recovery_due',
      -v_intl_paid,v_reason,p_actor_user_id,
      jsonb_build_object('note','A portion of this reward was paid internationally; that paid portion is a recovery liability.')
    );
  end if;

  if v_unpaid>0 then
    insert into public.dcds_reward_events
      (reward_ledger_id,order_id,ambassador_user_id,event_type,amount,reason,actor_user_id,details)
    values (
      v_reward.id,p_order_id,v_reward.ambassador_user_id,'reward_reversed',
      -v_unpaid,v_reason,p_actor_user_id,
      jsonb_build_object('note','Only the unpaid remainder of the reward was reversed.')
    );
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

revoke all on function public.dcds_reverse_referral_reward(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.dcds_reverse_referral_reward(uuid,text,uuid) to service_role;
