-- DCDS privacy operations: audited account-deletion requests.
-- The request deliberately has no FK to auth.users so the audit record can
-- survive the eventual Auth identity deletion. No user data is deleted here.

create table if not exists public.dcds_account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email_at_request text,
  request_note text,
  status text not null default 'pending'
    check (status in (
      'pending',
      'in_review',
      'action_required',
      'approved_for_deletion',
      'rejected',
      'completed',
      'cancelled'
    )),
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  completion_checklist jsonb not null default '{}'::jsonb
    check (jsonb_typeof(completion_checklist) = 'object'),
  completed_at timestamptz
);

create index if not exists dcds_account_deletion_requests_status_requested_idx
  on public.dcds_account_deletion_requests (status, requested_at desc);

create index if not exists dcds_account_deletion_requests_user_requested_idx
  on public.dcds_account_deletion_requests (user_id, requested_at desc);

create unique index if not exists dcds_account_deletion_requests_one_active_per_user_idx
  on public.dcds_account_deletion_requests (user_id)
  where status in ('pending', 'in_review', 'action_required', 'approved_for_deletion');

alter table public.dcds_account_deletion_requests enable row level security;

-- Access is mediated only by the authenticated, audited Edge Function.
revoke all on table public.dcds_account_deletion_requests from anon, authenticated;
grant all on table public.dcds_account_deletion_requests to service_role;

comment on table public.dcds_account_deletion_requests is
  'Private, audited account-deletion workflow. Auth identity deletion is only allowed after authorised manual review of related personal data and legally retained financial/audit records.';
comment on column public.dcds_account_deletion_requests.user_id is
  'Original Auth UUID retained as a non-FK audit reference after Auth identity deletion.';
comment on column public.dcds_account_deletion_requests.email_at_request is
  'Minimal contact identifier captured at request time; cleared when deletion is completed.';
comment on column public.dcds_account_deletion_requests.completion_checklist is
  'Explicit administrator attestations covering personal data, learning records, financial/audit retention, and external storage/processors.';
