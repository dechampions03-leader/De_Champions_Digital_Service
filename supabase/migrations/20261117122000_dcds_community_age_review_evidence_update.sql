-- Permit authorised DCDS administrators to correct private age-review evidence
-- before or after the age-review status transition. Students retain no access.
grant update on public.dcds_community_age_verification_reviews to authenticated;
create policy "DCDS admins update private community age review evidence"
on public.dcds_community_age_verification_reviews for update to authenticated
using ((select public.is_dcds_admin()))
with check (
  reviewer_user_id = (select auth.uid())
  and (select public.is_dcds_admin())
);
