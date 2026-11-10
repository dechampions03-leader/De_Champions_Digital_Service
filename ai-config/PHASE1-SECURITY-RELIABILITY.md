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
- The support event trigger assumes admin response updates set `responded_by` as the existing admin UI does. Status-only events may have a null actor unless the update path supplies an actor field; this is retained for audit accuracy rather than inventing an actor.

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
