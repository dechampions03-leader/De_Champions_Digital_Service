-- DCDS Career Centre trust and verification safeguards.
-- Active mentors require recorded consent; published opportunities require admin verification.

alter table public.dcds_mentors
  add column consent_confirmed_at timestamptz,
  add column consent_confirmed_by uuid references auth.users(id) on delete set null,
  add constraint dcds_mentors_active_requires_consent
    check (
      status <> 'active'
      or (consent_confirmed_at is not null and consent_confirmed_by is not null)
    );

alter table public.dcds_career_opportunities
  add column verified_at timestamptz,
  add column verified_by uuid references auth.users(id) on delete set null,
  add constraint dcds_career_opportunities_published_requires_verification
    check (
      status <> 'published'
      or (verified_at is not null and verified_by is not null)
    );
