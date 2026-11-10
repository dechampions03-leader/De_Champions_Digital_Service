-- Phase 1: atomic checkout creation and support reply history.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
-- Draft migration for feature branch review only. Do not apply to production before approval.

create or replace function public.dcds_create_checkout_order(
  p_user_id uuid,
  p_course_id uuid,
  p_tx_ref text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user auth.users%rowtype;
  v_course public.courses%rowtype;
  v_existing_enrolment uuid;
  v_pending_order uuid;
  v_order public.orders%rowtype;
begin
  if p_user_id is null or p_course_id is null or p_tx_ref is null
     or length(trim(p_tx_ref)) < 12 or length(p_tx_ref) > 120 then
    raise exception 'Invalid checkout request.' using errcode = '22023';
  end if;

  select * into v_user
  from auth.users
  where id = p_user_id
  for share;

  if not found or v_user.email is null then
    raise exception 'Your account has no email address.' using errcode = 'P0001';
  end if;
  if v_user.email_confirmed_at is null then
    raise exception 'Please verify your email address before making a payment.' using errcode = 'P0001';
  end if;

  -- Serialize checkout attempts for this student/course pair.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':' || p_course_id::text, 0)
  );

  select id into v_existing_enrolment
  from public.enrollments
  where user_id = p_user_id and course_id = p_course_id
  limit 1;

  if v_existing_enrolment is not null then
    raise exception 'You are already enrolled in this course.' using errcode = 'P0001';
  end if;

  select id into v_pending_order
  from public.orders
  where user_id = p_user_id and course_id = p_course_id and status = 'pending'
  order by created_at desc
  limit 1;

  if v_pending_order is not null then
    raise exception 'A checkout is already pending for this course. Contact support to verify its status before trying again.' using errcode = 'P0001';
  end if;

  select * into v_course
  from public.courses
  where id = p_course_id;

  if not found then
    raise exception 'Course not found.' using errcode = 'P0001';
  end if;

  if v_course.price is null or v_course.price <= 0 then
    raise exception 'Course price is invalid.' using errcode = '22023';
  end if;

  insert into public.orders (user_id, course_id, amount, currency, status, tx_ref)
  values (p_user_id, p_course_id, v_course.price, coalesce(v_course.currency, 'NGN'), 'pending', p_tx_ref)
  returning * into v_order;

  return pg_catalog.jsonb_build_object(
    'id', v_order.id,
    'tx_ref', v_order.tx_ref,
    'amount', v_order.amount,
    'currency', v_order.currency,
    'course_title', v_course.title
  );
end;
$$;

revoke all on function public.dcds_create_checkout_order(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.dcds_create_checkout_order(uuid, uuid, text) to service_role;

alter table public.student_support_tickets
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

create table if not exists public.student_support_ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.student_support_tickets(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('admin_reply', 'status_changed', 'reply_and_status_changed')),
  old_status text,
  new_status text,
  response_text text,
  created_at timestamptz not null default now()
);

create index if not exists student_support_ticket_events_ticket_created_idx
  on public.student_support_ticket_events(ticket_id, created_at desc);

alter table public.student_support_ticket_events enable row level security;

drop policy if exists "Students can read their support ticket events" on public.student_support_ticket_events;
create policy "Students can read their support ticket events"
  on public.student_support_ticket_events
  for select to authenticated
  using (
    exists (
      select 1
      from public.student_support_tickets t
      where t.id = ticket_id
        and t.user_id = (select auth.uid())
    )
  );

drop policy if exists "DCDS admins can read support ticket events" on public.student_support_ticket_events;
create policy "DCDS admins can read support ticket events"
  on public.student_support_ticket_events
  for select to authenticated
  using ((select public.is_dcds_admin()));

revoke all on public.student_support_ticket_events from anon, authenticated;
grant select on public.student_support_ticket_events to authenticated;
grant all on public.student_support_ticket_events to service_role;

create or replace function private.capture_dcds_support_ticket_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reply_changed boolean;
  v_status_changed boolean;
  v_event_type text;
  v_notification_id uuid;
begin
  v_reply_changed := new.admin_response is distinct from old.admin_response
    and nullif(btrim(new.admin_response), '') is not null;
  v_status_changed := new.status is distinct from old.status;

  if not v_reply_changed and not v_status_changed then
    return new;
  end if;

  v_event_type := case
    when v_reply_changed and v_status_changed then 'reply_and_status_changed'
    when v_reply_changed then 'admin_reply'
    else 'status_changed'
  end;

  insert into public.student_support_ticket_events (
    ticket_id, actor_user_id, event_type, old_status, new_status, response_text
  ) values (
    new.id, case when v_reply_changed then new.responded_by else new.updated_by end,
    v_event_type, old.status, new.status,
    case when v_reply_changed then new.admin_response else null end
  );

  if v_reply_changed and new.responded_by is not null then
    insert into public.notifications (
      title, message, category, created_by, audience, delivery_channel
    ) values (
      'Support team replied',
      'There is a new reply to your support ticket: ' || new.subject,
      'general',
      new.responded_by,
      null,
      'notification'
    )
    returning id into v_notification_id;

    insert into public.notification_recipients (
      notification_id, user_id, is_read, sms_status
    ) values (
      v_notification_id, new.user_id, false, 'not_requested'
    )
    on conflict (notification_id, user_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function private.capture_dcds_support_ticket_update() from public, anon, authenticated;

drop trigger if exists trg_capture_dcds_support_ticket_update on public.student_support_tickets;
create trigger trg_capture_dcds_support_ticket_update
after update of admin_response, status on public.student_support_tickets
for each row
execute function private.capture_dcds_support_ticket_update();
