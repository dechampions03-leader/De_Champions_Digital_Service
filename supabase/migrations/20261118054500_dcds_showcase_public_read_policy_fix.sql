-- Keep visitor reads independent from the administrator-only helper.
-- The anonymous API role may read published showcase records, but must never
-- need EXECUTE permission on public.is_dcds_admin().
drop policy if exists "DCDS showcase view published or admin items"
  on public.dcds_showcase_items;
drop policy if exists "DCDS showcase public published items"
  on public.dcds_showcase_items;
drop policy if exists "DCDS admins view draft showcase items"
  on public.dcds_showcase_items;

create policy "DCDS showcase public published items"
  on public.dcds_showcase_items
  for select
  to anon, authenticated
  using (is_published = true);

create policy "DCDS admins view draft showcase items"
  on public.dcds_showcase_items
  for select
  to authenticated
  using (
    (select public.is_dcds_admin())
    and (select (auth.jwt()->>'is_anonymous')::boolean) is false
  );
