-- Add enrolled-course Q&A channels to the age-separated Community Lounge.

alter table public.dcds_community_rooms
  add column if not exists course_id uuid references public.courses(id) on delete cascade;

alter table public.dcds_community_rooms
  drop constraint if exists dcds_community_rooms_room_type_check,
  add constraint dcds_community_rooms_room_type_check
    check (room_type in ('general','project_showcase','study_help','course_qna'));

create unique index if not exists dcds_community_rooms_course_cohort_uidx
  on public.dcds_community_rooms(course_id,cohort)
  where course_id is not null;

insert into public.dcds_community_rooms(slug,title,description,cohort,room_type,course_id,is_active,sort_order)
select
  case when cohorts.cohort='teen_13_17' then 'teen-course-' else 'adult-course-' end || c.slug || '-qna',
  left(c.title || ' · Course Q&A',80),
  left('Course-specific questions, answers and learning discussions for ' || c.title,500),
  cohorts.cohort,'course_qna',c.id,true,
  1000 + row_number() over(order by cohorts.cohort,c.title)
from public.courses c
cross join (values ('teen_13_17'::text),('adult_18_plus'::text)) cohorts(cohort)
on conflict(slug) do update set
  title=excluded.title,
  description=excluded.description,
  course_id=excluded.course_id,
  is_active=true;

-- Existing access provisioning must grant only general rooms plus course
-- rooms for courses the student is actually enrolled in.
create or replace function private.dcds_sync_community_access_request()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  verified_band text;
  verified_status text;
  guardian_status text;
begin
  if new.status = 'approved' and old.status is distinct from new.status then
    select age_band,status,guardian_consent_status
      into verified_band,verified_status,guardian_status
    from public.dcds_community_age_requests
    where user_id = new.user_id;

    if not found or verified_status <> 'verified' then
      raise exception 'Community access requires an approved community age review.';
    end if;

    if new.requested_cohort = 'adult_18_plus'
       and not (verified_band = '18_plus' and guardian_status = 'not_required') then
      raise exception 'Adult community access requires a verified 18+ community age record.';
    end if;

    if new.requested_cohort = 'teen_13_17'
       and not (verified_band = '13_17' and guardian_status = 'verified') then
      raise exception 'Teen community access requires independently verified guardian consent.';
    end if;

    insert into public.dcds_community_access(user_id,cohort,status,approved_by,approved_at)
    values (new.user_id,new.requested_cohort,'active',new.reviewed_by,coalesce(new.reviewed_at,now()))
    on conflict(user_id) do update set
      cohort=excluded.cohort,status='active',approved_by=excluded.approved_by,
      approved_at=excluded.approved_at,updated_at=now();

    insert into public.dcds_community_memberships(room_id,user_id,role,status)
    select r.id,new.user_id,'student','active'
    from public.dcds_community_rooms r
    where r.cohort=new.requested_cohort and r.is_active
      and (
        r.room_type <> 'course_qna'
        or exists (
          select 1 from public.enrollments e
          where e.user_id=new.user_id and e.course_id=r.course_id
        )
      )
    on conflict(room_id,user_id) do update set
      status='active',role='student',updated_at=now();

  elsif new.status in ('rejected','suspended') and old.status is distinct from new.status then
    update public.dcds_community_access
    set status='suspended',updated_at=now()
    where user_id=new.user_id;

    update public.dcds_community_memberships
    set status='suspended',updated_at=now()
    where user_id=new.user_id;
  end if;

  return new;
end;
$function$;

create or replace function private.dcds_community_sync_course_enrollment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_cohort text;
  v_access_status text;
begin
  if tg_op in ('DELETE','UPDATE') then
    delete from public.dcds_community_memberships m
    using public.dcds_community_rooms r
    where m.room_id=r.id
      and r.room_type='course_qna'
      and r.course_id=old.course_id
      and m.user_id=old.user_id
      and m.role='student';
  end if;

  if tg_op in ('INSERT','UPDATE') then
    select cohort,status into v_cohort,v_access_status
    from public.dcds_community_access
    where user_id=new.user_id;

    if found and v_access_status='active' then
      insert into public.dcds_community_memberships(room_id,user_id,role,status)
      select r.id,new.user_id,'student','active'
      from public.dcds_community_rooms r
      where r.room_type='course_qna'
        and r.course_id=new.course_id
        and r.cohort=v_cohort
        and r.is_active
      on conflict(room_id,user_id) do update set
        role='student',status='active',updated_at=now();
    end if;
  end if;

  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$;
revoke all on function private.dcds_community_sync_course_enrollment() from public,anon,authenticated;

drop trigger if exists dcds_community_sync_course_enrollment on public.enrollments;
create trigger dcds_community_sync_course_enrollment
after insert or update of user_id,course_id or delete on public.enrollments
for each row execute function private.dcds_community_sync_course_enrollment();

-- Provision course Q&A memberships for learners who are already enrolled and
-- already have approved community access.
insert into public.dcds_community_memberships(room_id,user_id,role,status)
select r.id,e.user_id,'student','active'
from public.enrollments e
join public.dcds_community_access a on a.user_id=e.user_id and a.status='active'
join public.dcds_community_rooms r on r.course_id=e.course_id
  and r.room_type='course_qna' and r.cohort=a.cohort and r.is_active
on conflict(room_id,user_id) do update set
  role='student',status='active',updated_at=now();

drop policy "Approved cohort members who accepted rules view their rooms"
on public.dcds_community_rooms;
create policy "Approved cohort members who accepted rules view their rooms"
on public.dcds_community_rooms for select to authenticated
using (
  (select public.is_dcds_admin())
  or (
    (select private.dcds_community_has_current_rules())
    and exists (
      select 1 from public.dcds_community_access a
      where a.user_id=(select auth.uid())
        and a.cohort=dcds_community_rooms.cohort
        and a.status='active'
    )
    and (
      dcds_community_rooms.room_type <> 'course_qna'
      or exists (
        select 1 from public.dcds_community_memberships m
        where m.room_id=dcds_community_rooms.id
          and m.user_id=(select auth.uid())
          and m.status='active'
      )
    )
  )
);

comment on column public.dcds_community_rooms.course_id is 'Course linked to a course-specific Q&A channel; students receive membership only for courses in which they are enrolled.';
