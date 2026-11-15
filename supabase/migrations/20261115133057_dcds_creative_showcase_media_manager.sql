
create table if not exists public.dcds_showcase_items (
  category_slug text not null check (category_slug in (
    'graphic-design','video-editing','ai-video-creativity','ai-tools-prompts',
    'ai-image-creativity','whiteboard-animation','website-designing','app-building',
    'kids-nursery-rhymes','advanced-3d-cartoon-animation','affiliate-marketing','social-media-management'
  )),
  slot_number smallint not null check (slot_number between 1 and 6),
  title text not null check (length(btrim(title)) between 1 and 120),
  description text not null default '' check (length(description) <= 600),
  media_type text not null check (media_type in ('image','video')),
  media_path text not null unique,
  mime_type text not null check (mime_type in (
    'image/jpeg','image/png','image/webp','image/gif','image/avif',
    'video/mp4','video/webm','video/quicktime'
  )),
  file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 52428800),
  is_published boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (category_slug, slot_number),
  check (split_part(media_path, '/', 1) = category_slug and split_part(media_path, '/', 2) = slot_number::text)
);

create index if not exists dcds_showcase_items_public_order_idx
  on public.dcds_showcase_items (is_published, category_slug, slot_number);

alter table public.dcds_showcase_items enable row level security;
grant select on public.dcds_showcase_items to anon, authenticated;
grant insert, update, delete on public.dcds_showcase_items to authenticated;

drop policy if exists "DCDS showcase public published items" on public.dcds_showcase_items;
create policy "DCDS showcase public published items"
  on public.dcds_showcase_items for select to anon, authenticated
  using (is_published = true);

drop policy if exists "DCDS admins manage showcase items" on public.dcds_showcase_items;
create policy "DCDS admins manage showcase items"
  on public.dcds_showcase_items for all to authenticated
  using (public.is_dcds_admin())
  with check (public.is_dcds_admin());

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'dcds-creative-showcase','dcds-creative-showcase',true,52428800,
  array['image/jpeg','image/png','image/webp','image/gif','image/avif','video/mp4','video/webm','video/quicktime']::text[]
)
on conflict (id) do update
set name=excluded.name,public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "DCDS admins upload creative showcase media" on storage.objects;
create policy "DCDS admins upload creative showcase media"
  on storage.objects for insert to authenticated
  with check (bucket_id='dcds-creative-showcase' and public.is_dcds_admin());

drop policy if exists "DCDS admins replace creative showcase media" on storage.objects;
create policy "DCDS admins replace creative showcase media"
  on storage.objects for update to authenticated
  using (bucket_id='dcds-creative-showcase' and public.is_dcds_admin())
  with check (bucket_id='dcds-creative-showcase' and public.is_dcds_admin());

drop policy if exists "DCDS admins delete creative showcase media" on storage.objects;
create policy "DCDS admins delete creative showcase media"
  on storage.objects for delete to authenticated
  using (bucket_id='dcds-creative-showcase' and public.is_dcds_admin());
