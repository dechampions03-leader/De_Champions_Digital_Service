create or replace function public.admin_finalize_flutterwave_payment(
  p_order_id uuid,p_admin_user_id uuid,p_transaction_id text,p_tx_ref text,
  p_amount numeric,p_currency text,p_raw_response jsonb
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
  v_review_id uuid;
begin
  if not exists(select 1 from public.dcds_admins a where a.user_id=p_admin_user_id) then
    raise exception 'Administrator access required' using errcode='42501';
  end if;
  if p_order_id is null or p_admin_user_id is null or p_transaction_id is null or p_tx_ref is null
     or p_amount is null or p_currency is null or p_raw_response is null then
    raise exception 'Verified transaction details are incomplete.' using errcode='22023';
  end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found.' using errcode='P0001'; end if;
  if v_order.tx_ref like 'DCDS-MANUAL-%' then
    raise exception 'Manual bank-transfer orders cannot be completed with a Flutterwave transaction.' using errcode='P0001';
  end if;
  if v_order.tx_ref<>p_tx_ref or v_order.amount<>p_amount
     or pg_catalog.upper(v_order.currency)<>pg_catalog.upper(p_currency) then
    raise exception 'Verified Flutterwave transaction does not match this order.' using errcode='P0001';
  end if;
  select * into v_existing_by_id from public.payments where transaction_id=p_transaction_id for update;
  if found and (v_existing_by_id.order_id<>v_order.id or v_existing_by_id.tx_ref<>v_order.tx_ref) then
    raise exception 'This Flutterwave transaction ID is already linked to another order.' using errcode='23505';
  end if;
  select * into v_existing_by_ref from public.payments where tx_ref=v_order.tx_ref for update;
  if found and (v_existing_by_ref.order_id<>v_order.id or v_existing_by_ref.transaction_id<>p_transaction_id) then
    raise exception 'This order reference already has a different payment transaction.' using errcode='23505';
  end if;
  if v_order.status not in ('pending','successful') then
    raise exception 'This order is not eligible for payment completion.' using errcode='P0001';
  end if;
  if not found then
    insert into public.payments(order_id,user_id,provider,transaction_id,tx_ref,amount,currency,status,raw_response)
    values(v_order.id,v_order.user_id,'flutterwave',p_transaction_id,v_order.tx_ref,p_amount,
      pg_catalog.upper(p_currency),'successful',p_raw_response);
  end if;
  if v_order.status='pending' then
    update public.orders set status='successful',updated_at=now() where id=v_order.id and status='pending';
  end if;
  insert into public.enrollments(user_id,course_id,order_id,enrollment_source)
  values(v_order.user_id,v_order.course_id,v_order.id,'purchase')
  on conflict(user_id,course_id) do nothing;
  update public.dcds_payment_receipt_reviews
  set review_status='approved',reviewed_by=p_admin_user_id,reviewed_at=now(),updated_at=now()
  where order_id=v_order.id and review_status='submitted';
  select id into v_review_id from public.dcds_payment_receipt_reviews where order_id=v_order.id limit 1;
  insert into public.dcds_payment_review_events(order_id,review_id,actor_user_id,event_type,details)
  values(v_order.id,v_review_id,p_admin_user_id,'flutterwave_payment_verified',
    pg_catalog.jsonb_build_object('transaction_id',p_transaction_id,'amount',p_amount,'currency',pg_catalog.upper(p_currency)));
  return pg_catalog.jsonb_build_object('success',true,'order_id',v_order.id,'status','successful');
end;
$$;

revoke all on function public.admin_finalize_flutterwave_payment(uuid,uuid,text,text,numeric,text,jsonb) from public,anon,authenticated;
grant execute on function public.admin_finalize_flutterwave_payment(uuid,uuid,text,text,numeric,text,jsonb) to service_role;
