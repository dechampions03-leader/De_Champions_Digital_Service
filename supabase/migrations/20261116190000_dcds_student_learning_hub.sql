create table if not exists public.student_learning_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  weekly_lesson_goal integer not null default 3
    check (weekly_lesson_goal between 1 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.student_course_activity (
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  lesson_id uuid not null references public.course_lessons(id) on delete cascade,
  last_opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, course_id)
);

create index if not exists student_course_activity_user_recent_idx
  on public.student_course_activity (user_id, last_opened_at desc);

alter table public.student_learning_settings enable row level security;
alter table public.student_course_activity enable row level security;

revoke all on public.student_learning_settings from anon;
revoke all on public.student_course_activity from anon;
grant select, insert, update on public.student_learning_settings to authenticated;
grant select, insert, update on public.student_course_activity to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='student_learning_settings'
      and policyname='Students can view their own learning settings'
  ) then
    create policy "Students can view their own learning settings"
      on public.student_learning_settings for select to authenticated
      using (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='student_learning_settings'
      and policyname='Students can create their own learning settings'
  ) then
    create policy "Students can create their own learning settings"
      on public.student_learning_settings for insert to authenticated
      with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='student_learning_settings'
      and policyname='Students can update their own learning settings'
  ) then
    create policy "Students can update their own learning settings"
      on public.student_learning_settings for update to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='student_course_activity'
      and policyname='Students can view their own course activity'
  ) then
    create policy "Students can view their own course activity"
      on public.student_course_activity for select to authenticated
      using (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='student_course_activity'
      and policyname='Students can record their own course activity'
  ) then
    create policy "Students can record their own course activity"
      on public.student_course_activity for insert to authenticated
      with check (
        auth.uid() = user_id
        and exists (
          select 1 from public.enrollments e
          where e.user_id = auth.uid() and e.course_id = student_course_activity.course_id
        )
        and exists (
          select 1 from public.course_lessons l
          where l.id = student_course_activity.lesson_id
            and l.course_id = student_course_activity.course_id
        )
      );
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='student_course_activity'
      and policyname='Students can update their own course activity'
  ) then
    create policy "Students can update their own course activity"
      on public.student_course_activity for update to authenticated
      using (auth.uid() = user_id)
      with check (
        auth.uid() = user_id
        and exists (
          select 1 from public.enrollments e
          where e.user_id = auth.uid() and e.course_id = student_course_activity.course_id
        )
        and exists (
          select 1 from public.course_lessons l
          where l.id = student_course_activity.lesson_id
            and l.course_id = student_course_activity.course_id
        )
      );
  end if;
end
$$;
