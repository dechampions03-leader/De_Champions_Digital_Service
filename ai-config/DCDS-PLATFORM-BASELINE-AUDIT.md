# DCDS Platform Baseline Audit

**Audit date:** 2026-11-10  
**Production project:** `qxsenflgaweeadvggnyp`  
**Development project:** `tjgsxbmkpvktlqulbktv`  
**Production branch:** `main`  
**Phase 1 review branch:** `feature/phase1-security-reliability`  
**Shared AI branch:** `feature/shared-dcds-ai`

## Executive status

This is a read-only inventory and compatibility record. It does not authorize production changes, production deployments, PR merges, payment activity, payouts, paid infrastructure, or copying production records into development.

- Production is the live system and remains unchanged by this audit.
- Development is a separate, currently empty DCDS database (zero public tables/functions/migrations at audit time) but already has Supabase-managed schemas, roles, extensions and platform triggers.
- A successful read-only public-schema export was obtained. It contains public application DDL and no top-level row-data INSERT/COPY statements.
- The public export does **not** include the seven public CREATE TRIGGER attachment statements. It includes their trigger-function definitions. The auth.users referral trigger and global ensure_rls event trigger are also outside the public-only dump.
- Do not restore the public export blindly. A second, read-only pg-delta schema diff is being added to capture trigger attachments and supported customizations on managed schemas, especially the DCDS auth.users trigger. Event-trigger coverage must be verified separately before restore.
- Phase 1 remains an open draft PR #2. Its database migration has not been applied to production or development.
- Shared AI remains a separate feature branch and is not production-live.

## Verified production public-schema inventory

| Object | Count | Verification |
|---|---:|---|
| Public application tables | 34 | Live catalog and schema export |
| Public function signatures | 26 | Live catalog and schema export |
| Unique public function names | 25 | One announcement function has two overloads |
| Public application triggers | 7 | Live catalog; trigger DDL absent from plain public dump |
| Public RLS policies | 59 | Live catalog and schema export |
| Public tables with RLS enabled | 34 | Live catalog |
| Public indexes | 94 | Live catalog; export inventory records 37 explicit index DDL statements |
| SECURITY DEFINER public functions | 23 | Live catalog |

The difference between 94 live indexes and 37 explicit CREATE INDEX statements is not automatically an error: primary-key/unique constraints and their backing indexes are represented separately in a schema dump.

## Production application trigger inventory

The live production catalog confirms seven enabled public application triggers. The plain public schema export contains **zero CREATE TRIGGER statements**, so it is not sufficient by itself to restore their attachments. Their exact DDL was separately inspected from pg_catalog:

1. `dcds_log_payout_request_created` — logs payout request creation.
2. `dcds_payout_events_immutable` — rejects payout event update/delete.
3. `dcds_process_successful_order` — processes a newly successful order.
4. `dcds_reward_events_immutable` — rejects reward event update/delete.
5. `trg_bump_course_completion_policy_version` — bumps course completion policy version when lessons change.
6. `trg_dcds_public_announcements_updated_at` — maintains announcement updated_at.
7. `trigger_auto_issue_certificate` — attempts certificate issuance after lesson progress insertion.

Additional DCDS automation outside the public schema:

- `auth.users.dcds_capture_referral_after_signup` invokes `public.capture_dcds_referral_on_signup()`.
- Database event trigger `ensure_rls` runs on CREATE TABLE / CREATE TABLE AS / SELECT INTO and invokes `public.rls_auto_enable()`.

The public-only export contains trigger-function definitions but does not recreate the trigger attachments, the auth.users referral trigger, or the global event trigger. The new pg-delta workflow supplements it with supported managed-schema customizations. Event trigger ensure_rls must still be separately verified and, if missing from the diff, recreated in development only after referenced functions and tables exist.

## Supabase-managed infrastructure

Production and development both already contain the managed `auth`, `storage`, `realtime`, `extensions`, and `public` schemas; managed roles `anon`, `authenticated`, `service_role`, `postgres`; and the inspected extension set. Development already has Supabase-managed event triggers, and production has one additional custom DCDS event trigger, `ensure_rls`.

Do not dump/restore Supabase-managed schemas, users, auth records, storage objects, realtime internals, secrets, or platform triggers. Preserve the development project's own managed infrastructure.

## Production migrations

Production has 18 recorded migrations at audit time:

- secure_public_announcement_access
- create_student_support_tickets
- restrict_student_support_ticket_insert_columns
- add_secure_admin_student_registry
- versioned_course_completion_and_certificate_snapshots
- restrict_admin_helper_function_execution
- add_lms_quizzes_assignments_foundation
- grant_lms_assessment_table_access
- handle_expired_quiz_attempts_without_rollback
- dcds_atomic_payout_request_reservation
- dcds_payout_audit_events_and_atomic_request
- dcds_payout_state_transition_and_release
- dcds_append_only_reward_reversal_ledger
- dcds_store_provider_transfer_id_for_reconciliation
- add_admin_dcds_review_moderation
- allow_admins_to_view_pending_dcds_reviews
- allow_dcds_admins_to_delete_reviews
- revoke_unused_public_table_grants

Development has zero DCDS migrations recorded at audit time. A safe baseline process must establish schema and reconcile migration history carefully; do not mark historical migrations applied until the corresponding schema objects have been verified.

## Public function inventory (26 signatures / 25 names)

- Admin/student registry: `admin_add_student_note`, `admin_enrol_student`, `admin_get_student_record`, `admin_list_students`, `admin_remove_student_enrolment`, `admin_set_student_access`, `admin_update_student_profile`.
- Certificates/completion: `auto_issue_course_certificate`, `bump_course_completion_policy_version`, `issue_course_certificate`.
- Referral/rewards: `capture_dcds_referral_on_signup`, `dcds_reverse_referral_reward`, `process_dcds_successful_course_order`.
- Payout: `dcds_create_payout_request`, `dcds_log_payout_request_event`, `dcds_reject_payout_event_mutation`, `dcds_reject_reward_event_mutation`, `dcds_transition_payout`.
- Announcements: `dcds_public_announcements_set_updated_at`, `publish_dcds_announcement` (5-argument and 6-argument overloads).
- General course/admin: `get_general_course_channels`, `is_dcds_admin`.
- Quiz: `start_dcds_quiz`, `submit_dcds_quiz`.
- RLS event automation: `rls_auto_enable`.

All SECURITY DEFINER functions require an explicit review of owner, search_path, EXECUTE grants, caller authorization and referenced objects before deployment. The catalog reports 23 such public function signatures; this count is a review queue, not a finding that all are vulnerable.

## Current deployed Edge Function versions (production snapshot)

| Function | Version | JWT verification |
|---|---:|---|
| swift-handler | 11 | true |
| Verify-payment- | 10 | true |
| flutterwave-webhook | 11 | false |
| create-payment | 7 | true |
| verify-payment | 5 | true |
| get-general-course-channels | 5 | true |
| get-public-announcements | 4 | false |
| manage-public-announcements | 4 | true |
| dcds-payout-account | 6 | true |
| dcds-payout-request | 4 | true |
| dcds-process-payout | 7 | true |

The Phase 1 branch's payout processor differs from production by the targeted addition of `provider_transfer_id` to the payout request lookup; the no-resend/manual-reconciliation safeguards are retained. The branch's checkout function is a substantive replacement of the deployed create-payment implementation and must be tested for all existing response, timeout, order-state and Flutterwave behaviors before rollout. Do not assume the deployed function version number indicates source equivalence.

## Phase 1 — open draft PR #2

PR: https://github.com/dechampions03-leader/De_Champions_Digital_Service/pull/2

Includes:
- Atomic server-side checkout RPC and confirmed-email check.
- Payout reconciliation lookup correction.
- Support ticket history, actor attribution, notification trigger and UI timestamps.
- Static Deno/migration validation.

Still blocked on:
- A safe, complete development baseline.
- Runtime checkout concurrency and idempotency tests.
- Flutterwave sandbox checkout rejection/timeout tests.
- Payout reconciliation tests in a non-real-transfer environment.
- Support event/RLS/notification integration tests.
- Regression checks for student/admin dashboards and existing API contracts.
- Security/performance advisor review after development migration.

## Shared AI feature branch

Branch: `feature/shared-dcds-ai`

The AI work is separate from PR #2. It includes an authenticated chat Edge Function, DCDS knowledge retrieval from repository files, Gemini integration via a server-side secret, and per-user rate limiting. It is not deployed and is not production-live.

The usage-window migration has been hardened to use an empty search_path and schema-qualified built-ins. It still requires Deno/source review, Gemini model/provider verification, development database testing, privacy/error handling review and secret configuration verification. Never put provider secrets in browser code, repository content, or student-facing files.

## Development reconstruction gates

1. Preserve Supabase-managed development schemas, roles, extensions, and platform-owned triggers.
2. Generate a pg-delta diff from an empty local shadow schema, verifying the 34 public tables, 26 function signatures, 59 policies, seven public trigger attachments, and DCDS auth.users trigger customization.
3. Verify whether pg-delta captures the custom ensure_rls event trigger. If not, add its exact reviewed DDL as a separate development-only migration.
4. Review and sanitize default privileges before applying. The public dump includes broad default privileges for anon/authenticated; a restore must not accidentally broaden future object access.
5. Restore reviewed DCDS objects only, then compare development catalog counts and representative definitions with production.
6. Reconcile the 18 historical production migration versions only after corresponding objects are verified; do not blindly mark all as applied.
7. Apply the shared AI usage migration and Phase 1 migration on development only in dependency order.
8. Run functional tests and Supabase security/performance advisors.
9. Keep PR #2 draft until all blockers pass. Merging to main and production deployment require separate explicit owner approval.

## Operational protections

- No production DDL/DML, Edge Function deployment, payments, transfers, or payout enablement is part of this audit.
- No production student, payment, order, certificate, bank-account, or reward records are copied to development.
- No paid Supabase branch is to be created.
- Existing historical pending orders must be reconciled against Flutterwave references; do not auto-fail, delete, or recreate them.
- Real payouts remain disabled unless separately approved after sandbox and operational verification.


## Critical ACL/default-privilege finding — verified against live production and development

A direct `has_table_privilege` catalog check confirmed that the broad privileges in the baseline diff are **also effective in the live production database**, not merely a pg-delta artifact:

- `anon` has `TRUNCATE`, `TRIGGER`, `MAINTAIN`, and `REFERENCES` privileges on 14 public tables.
- `authenticated` has those same four privileges on 20 public tables.
- These are real PostgreSQL table privileges. RLS does not filter `TRUNCATE` or trigger-management privilege; the REST API may not expose every PostgreSQL command directly, so this is a database-hardening finding, not evidence of a confirmed exploit.
- Production and the empty development project both have broad default table privileges for future objects created by `postgres` and `supabase_admin`, including the four privileges above for `anon` and `authenticated`.

**Required safe-development normalization (do not run against production as part of this task):**

```sql
REVOKE TRUNCATE, TRIGGER, MAINTAIN, REFERENCES
  ON ALL TABLES IN SCHEMA public
  FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, MAINTAIN, REFERENCES
  ON TABLES FROM anon, authenticated;
```

This preserves the existing SELECT/INSERT/UPDATE/DELETE grants and the existing RLS policies while removing unnecessary elevated table privileges for browser-facing roles on development objects. The default-privilege change is limited to new public objects created by `postgres`; platform-owned `supabase_admin` defaults are not modified.

Production remediation must be a separate, owner-approved migration after a table-by-table application compatibility review. Do not silently normalize production during development reconstruction.

## Policy review clarification

The 59 live public policies were enumerated from `pg_policies`. The duplicate permissive-policy groups on `notifications` and `notification_recipients` remain cleanup candidates. The follow-up catalog pass did not establish a confirmed policy predicate attached to the wrong table, so no policy was altered on that assumption. Any consolidation requires a separate effective-policy review and regression tests.

## Baseline artifact execution characteristics

- The complete pg-delta baseline contains 34 `CREATE TABLE`, 26 `CREATE FUNCTION`, 59 `CREATE POLICY`, 8 application/managed-table `CREATE TRIGGER`, and 1 `CREATE EVENT TRIGGER` statements, plus explicit RLS activation and ACL statements.
- The companion custom-trigger SQL contains the same 8 trigger attachments and event trigger. Do not apply both files; doing so would create duplicate-trigger failures.
- The complete baseline contains no top-level INSERT/COPY row-data statements and no DROP TABLE/SCHEMA statements.
- The public-only pg_dump contains broad default-privilege statements; the pg-delta complete baseline does not reproduce those default-ACL statements. The development project already has its own platform defaults, so apply the development normalization above before treating the baseline as safe for ongoing schema work.
- Restore must be transactional, must refuse to run if the development public schema is not empty, and must verify object counts plus ACLs after application.
