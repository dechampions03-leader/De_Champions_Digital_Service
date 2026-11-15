drop policy if exists "DCDS admins insert showcase items" on public.dcds_showcase_items;
create policy "DCDS admins insert showcase items"
  on public.dcds_showcase_items
  for insert
  to authenticated
  with check (
    (select public.is_dcds_admin())
    and (select (auth.jwt()->>'is_anonymous')::boolean) is false
  );

drop policy if exists "DCDS admins update showcase items" on public.dcds_showcase_items;
create policy "DCDS admins update showcase items"
  on public.dcds_showcase_items
  for update
  to authenticated
  using (
    (select public.is_dcds_admin())
    and (select (auth.jwt()->>'is_anonymous')::boolean) is false
  )
  with check (
    (select public.is_dcds_admin())
    and (select (auth.jwt()->>'is_anonymous')::boolean) is false
  );

drop policy if exists "DCDS admins delete showcase items" on public.dcds_showcase_items;
create policy "DCDS admins delete showcase items"
  on public.dcds_showcase_items
  for delete
  to authenticated
  using (
    (select public.is_dcds_admin())
    and (select (auth.jwt()->>'is_anonymous')::boolean) is false
  );

drop policy if exists "DCDS showcase view published or admin items" on public.dcds_showcase_items;
create policy "DCDS showcase view published or admin items"
  on public.dcds_showcase_items
  for select
  to anon, authenticated
  using (
    is_published = true
    or (
      (select public.is_dcds_admin())
      and (select (auth.jwt()->>'is_anonymous')::boolean) is false
    )
  );

drop policy if exists "DCDS admins upload creative showcase media" on storage.objects;
create policy "DCDS admins upload creative showcase media"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'dcds-creative-showcase'
    and (select public.is_dcds_admin())
    and (select (auth.jwt()->>'is_anonymous')::boolean) is false
  );

drop policy if exists "DCDS admins replace creative showcase media" on storage.objects;
create policy "DCDS admins replace creative showcase media"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'dcds-creative-showcase'
    and (select public.is_dcds_admin())
    and (select (auth.jwt()->>'is_anonymous')::boolean) is false
  )
  with check (
    bucket_id = 'dcds-creative-showcase'
    and (select public.is_dcds_admin())
    and (select (auth.jwt()->>'is_anonymous')::boolean) is false
  );

drop policy if exists "DCDS admins delete creative showcase media" on storage.objects;
create policy "DCDS admins delete creative showcase media"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'dcds-creative-showcase'
    and (select public.is_dcds_admin())
    and (select (auth.jwt()->>'is_anonymous')::boolean) is false
  );
