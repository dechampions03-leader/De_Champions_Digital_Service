# Phase 1 — Security and Reliability (review branch)

Branch: `feature/phase1-security-reliability`
Base: `main`

## Scope in this draft
- Correct payout reconciliation by selecting `provider_transfer_id` in the processing/reconcile request query. The no-resend and manual-review behavior is intentionally preserved.
- Require confirmed email and server-side atomic order creation for checkout. The database function serializes same-student/same-course checkout attempts, rejects existing enrolments, and blocks another checkout while a pending order exists.
- Add append-only support ticket update history and a student notification for a newly changed, non-empty admin reply.

## Important rollout notes
- This branch is not deployed. The SQL migration is not applied to Supabase.
- Do not enable real payouts as part of this work.
- Existing pending orders are not modified or automatically expired. A pending checkout blocks a new checkout until reconciled by support; this conservative behavior avoids duplicate charges while pending-order reconciliation is designed.
- Existing orders, payments, enrolments, reward balances, and certificates are not rewritten.
- The migration creates a `private` schema function. Confirm the schema exists and inspect its owner/permissions before applying. If private schema is not present, create it with a suitably restricted owner as part of reviewed migration.
- The support event trigger records `responded_by` only for events containing a changed reply. Status-only events currently have a null actor because the existing ticket update path has no dedicated `updated_by` field. Add a verified admin actor to the update path before treating status-event actor attribution as complete.

## Required pre-deployment checks
1. Run TypeScript/Deno checks for both Edge Functions.
2. Apply the migration only to an isolated development database after reviewing the existing migration baseline.
3. Test verified/unverified checkout, enrolled student, pending checkout, concurrent checkout attempts, and Flutterwave checkout rejection/timeout.
4. Test payout reconciliation against provider success, pending, failed/reversed, and unavailable states; verify no second transfer is sent.
5. Test support reply notification deduplication, status-only history, student-only ticket visibility, and admin visibility.
6. Run Supabase security/performance advisors and inspect all new grants/policies.
7. Confirm the production migration and function deployment separately with the owner.

## Rollback
- Edge Functions: redeploy the previously deployed function versions.
- Database: rollback only after confirming no new support history data needs retention. Drop the trigger, trigger function, event table and checkout RPC in a controlled rollback migration. Do not delete payment/order rows.


## Validation status — 2026-11-10

### Completed read-only checks
- Confirmed the live payout reconciliation query was missing `provider_transfer_id`; the branch copy now selects it in the reconcile path. The existing guard against sending a second transfer remains.
- Confirmed `courses` contains the fields used by the checkout RPC (`id`, `title`, `price`, `currency`).
- Confirmed `enrollments` has a unique `(user_id, course_id)` constraint and `orders` has a unique `tx_ref`; the new RPC additionally serializes concurrent checkout attempts.
- Confirmed the support ticket table has the fields referenced by the trigger, and the notification/recipient tables have the columns used by the trigger.
- Confirmed the existing admin directory policy uses `is_dcds_admin()`, which is the basis for the new admin event-history read policy.
- Re-ran the live Supabase advisors. Existing findings remain: 8 RLS-enabled tables without policies (currently service-role-only ACLs on the reviewed set), 14 SECURITY DEFINER warnings, 22 unindexed foreign keys, 18 RLS init-plan warnings, 22 unused-index notices, 17 multiple-permissive-policy notices, and 5 duplicate-index notices. Health advisor returned no lints.

### Not yet validated
- No isolated development Supabase project is connected, so the migration has not been applied or executed in a disposable database.
- Deno/TypeScript build and live Flutterwave sandbox tests have not been run.
- No payout reconciliation request was executed, because real payout/provider actions are not part of static review.
- No authenticated student/admin end-to-end support tests have been run.

### Review gates before merge
1. Connect a separate development Supabase project (not production) and apply this migration there.
2. Validate function owner/privileges, schema grants, trigger behavior and RLS under student/admin roles.
3. Add integration tests for duplicate and concurrent checkout, confirmed/unconfirmed users, enrolled users, pending orders and Flutterwave response ambiguity.
4. Verify payout provider success/pending/failed/unknown outcomes and prove no second transfer can be issued.
5. Run Deno checks and browser-level payment/support regression tests.
6. Only after the above pass, request owner approval for merging the branch. Production deployment still requires separate explicit approval.

### Known operational caveat
The 37 historical pending orders without payment rows are not automatically closed. The checkout RPC conservatively blocks another checkout for the same user/course until that pending order is reconciled. Support needs a safe Flutterwave reference check before any such order is failed or retried.


### Additional compatibility review
- Confirmed the existing homepage invokes `create-payment` with `course_id` and expects `success` plus `payment_link`; the proposed function preserves that response contract.
- Confirmed the current deployed payment function uses the `DCDS_SERVICE_ROLE_KEY` and `FLW_SECRET_KEY` secret names. Secret values were not read.
- Confirmed notification categories and delivery channels allow `general` and `notification`, and recipient rows support the fields used by the support-reply trigger.
- Confirmed the notification recipient table has two duplicate UNIQUE constraints on `(notification_id,user_id)`. The migration uses `ON CONFLICT (notification_id,user_id)`; PostgreSQL can infer the matching unique index, but duplicate constraints remain a separate cleanup candidate and are not removed in this change.
- Corrected the support audit trigger so status-only events are not incorrectly attributed to the author of an earlier reply.
- The support status-only actor limitation is explicit: the current ticket schema has no dedicated `updated_by` field. It is safer to store a null actor than to imply that the previous reply author made the status change.
