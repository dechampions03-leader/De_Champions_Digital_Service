
drop policy if exists "DCDS showcase public published items" on public.dcds_showcase_items;
drop policy if exists "DCDS admins manage showcase items" on public.dcds_showcase_items;

create policy "DCDS showcase view published or admin items"
  on public.dcds_showcase_items
  for select
  to anon, authenticated
  using (is_published = true or (select public.is_dcds_admin()));

create policy "DCDS admins insert showcase items"
  on public.dcds_showcase_items
  for insert
  to authenticated
  with check ((select public.is_dcds_admin()));

create policy "DCDS admins update showcase items"
  on public.dcds_showcase_items
  for update
  to authenticated
  using ((select public.is_dcds_admin()))
  with check ((select public.is_dcds_admin()));

create policy "DCDS admins delete showcase items"
  on public.dcds_showcase_items
  for delete
  to authenticated
  using ((select public.is_dcds_admin()));
