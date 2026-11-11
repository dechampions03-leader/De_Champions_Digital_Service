-- Let DCDS accounts verified by either email OTP or SMS OTP use student services.
-- The email address remains mandatory and is still the provider payment contact.
-- This does not auto-confirm either contact method.

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
as $function$
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
  if v_user.email_confirmed_at is null and v_user.phone_confirmed_at is null then
    raise exception 'Please verify your email address or mobile number before making a payment.' using errcode = 'P0001';
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
$function$;

create or replace function public.admin_create_manual_bank_order(
  p_student_email text,
  p_course_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid:=auth.uid();
  v_user auth.users%rowtype;
  v_course public.courses%rowtype;
  v_order public.orders%rowtype;
  v_ref text;
begin
  if not coalesce(public.is_dcds_admin(),false) then
    raise exception 'Administrator access required' using errcode='42501';
  end if;
  if p_student_email is null or pg_catalog.length(pg_catalog.btrim(p_student_email))<5 or p_course_id is null then
    raise exception 'Student email and course are required.' using errcode='22023';
  end if;
  select * into v_user from auth.users
  where pg_catalog.lower(email)=pg_catalog.lower(pg_catalog.btrim(p_student_email)) limit 1;
  if not found or (v_user.email_confirmed_at is null and v_user.phone_confirmed_at is null) then
    raise exception 'A student with a verified email address or mobile number could not be found.' using errcode='P0001';
  end if;
  select * into v_course from public.courses where id=p_course_id;
  if not found then raise exception 'Course not found.' using errcode='P0001'; end if;
  if pg_catalog.upper(coalesce(v_course.currency,'NGN'))<>'NGN' then
    raise exception 'Direct manual bank-transfer orders are currently limited to NGN. Use Flutterwave for international currencies.' using errcode='P0001';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user.id::text||':'||p_course_id::text,0));
  if exists(select 1 from public.enrollments where user_id=v_user.id and course_id=p_course_id) then
    raise exception 'This student is already enrolled in the selected course.' using errcode='P0001';
  end if;
  if exists(select 1 from public.orders where user_id=v_user.id and course_id=p_course_id and status='pending') then
    raise exception 'This student already has a pending checkout for this course. Reconcile it before creating a manual bank-transfer order.' using errcode='P0001';
  end if;
  v_ref:='DCDS-MANUAL-'||pg_catalog.replace(gen_random_uuid()::text,'-','');
  insert into public.orders(user_id,course_id,amount,currency,status,tx_ref)
  values(v_user.id,p_course_id,v_course.price,'NGN','pending',v_ref) returning * into v_order;
  insert into public.dcds_payment_review_events(order_id,actor_user_id,event_type,details)
  values(v_order.id,v_admin,'manual_order_created',
    pg_catalog.jsonb_build_object('student_email',v_user.email,'course_title',v_course.title,'amount',v_order.amount,'currency',v_order.currency));
  return pg_catalog.jsonb_build_object('order_id',v_order.id,'student_email',v_user.email,
    'course_title',v_course.title,'amount',v_order.amount,'currency',v_order.currency,'tx_ref',v_order.tx_ref);
end;
$function$;

create or replace function public.get_general_course_channels()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid;
  user_is_verified boolean;
  student_is_enrolled boolean;
  channel_list jsonb;
begin
  current_user_id := auth.uid();
  if current_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select exists (
    select 1
    from auth.users u
    where u.id = current_user_id
      and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
  ) into user_is_verified;

  if not user_is_verified then
    raise exception 'Email or mobile verification required.' using errcode = '42501';
  end if;

  select exists (
    select 1
    from public.enrollments e
    where e.user_id = current_user_id
      and e.course_id = 'a1030000-0000-4000-8000-000000000001'::uuid
  ) into student_is_enrolled;

  if not student_is_enrolled then
    raise exception 'General Course enrollment required.' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('name', c.channel_name, 'url', c.invite_url)
      order by c.channel_number
    ),
    '[]'::jsonb
  ) into channel_list
  from public.dcds_general_course_channels c;

  if jsonb_array_length(channel_list) <> 4 then
    raise exception 'General Course channels are not fully configured.';
  end if;

  return jsonb_build_object('success', true, 'channels', channel_list);
end;
$function$;

create or replace function public.admin_list_students(
  p_search text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table(
  user_id uuid,
  email text,
  full_name text,
  phone text,
  account_created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  enrollment_count bigint,
  successful_order_count bigint,
  total_successful_amount numeric,
  enrolled_courses jsonb
)
language plpgsql
security definer
set search_path = 'public', 'auth', 'pg_temp'
as $function$
begin
  if not coalesce(public.is_dcds_admin(), false) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  return query
  select
    u.id,
    u.email::text,
    coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
      'DCDS Student'
    )::text,
    coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'phone'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'dcds_phone_e164'), ''),
      nullif(btrim(u.phone), '')
    )::text,
    u.created_at,
    u.last_sign_in_at,
    coalesce(u.email_confirmed_at, u.phone_confirmed_at),
    coalesce(en.enrollment_count, 0)::bigint,
    coalesce(ord.successful_order_count, 0)::bigint,
    coalesce(ord.total_successful_amount, 0)::numeric,
    coalesce(en.enrolled_courses, '[]'::jsonb)
  from auth.users u
  left join lateral (
    select
      count(*)::bigint as enrollment_count,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'course_id', c.id,
            'course_title', c.title,
            'enrolled_at', e.created_at
          )
          order by e.created_at desc
        ),
        '[]'::jsonb
      ) as enrolled_courses
    from public.enrollments e
    join public.courses c on c.id = e.course_id
    where e.user_id = u.id
  ) en on true
  left join lateral (
    select
      count(*) filter (where o.status = 'successful')::bigint as successful_order_count,
      coalesce(sum(o.amount) filter (where o.status = 'successful'), 0)::numeric as total_successful_amount
    from public.orders o
    where o.user_id = u.id
  ) ord on true
  where
    p_search is null
    or btrim(p_search) = ''
    or lower(
      coalesce(u.email, '') || ' ' ||
      coalesce(u.raw_user_meta_data ->> 'full_name', '') || ' ' ||
      coalesce(u.raw_user_meta_data ->> 'name', '') || ' ' ||
      coalesce(u.raw_user_meta_data ->> 'phone', '') || ' ' ||
      coalesce(u.raw_user_meta_data ->> 'dcds_phone_e164', '') || ' ' ||
      coalesce(u.phone, '')
    ) like '%' || lower(btrim(p_search)) || '%'
  order by u.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 200))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$function$;
