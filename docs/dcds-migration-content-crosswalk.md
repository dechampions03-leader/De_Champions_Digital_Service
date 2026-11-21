# DCDS migration content crosswalk — candidate mappings

**Audit date:** 2026-11-21  
**Mode:** Read-only repository and migration-metadata inspection  
**Repository ref:** `feature/dcds-verified-plus-ecosystem`  
**Supabase projects:** DCDS-Development (`tjgsxbmkpvktlqulbktv`), production-candidate (`qxsenflgaweeadvggnyp`)

## Executive result

The repository contains 48 checked-in SQL files. The current remote histories contain 54 Development records and 80 production-candidate records. Exact filename-timestamp overlap remains 4 for Development and 8 for production-candidate.

This inspection advances the crosswalk for repeated remote migration names. It does **not** establish SQL equivalence. The Supabase migration-list response exposes remote version/name metadata, not the SQL body that was executed for each remote version. Therefore each same-name match below is a candidate mapping only.

**Do not run migration repair, db push, linked reset, baseline restore, or any migration against either shared project based on this report.**

## 1. Repeated logical names in DCDS-Development

| Remote version | Remote migration name | Candidate checked-in file | Candidate local timestamp |
|---|---|---|---|
| `20261117122715` | `dcds_community_course_qna_channels` | `20261117135000_dcds_community_course_qna_channels.sql` | `20261117135000` |
| `20261117122938` | `dcds_community_course_qna_channels` | Same candidate file | `20261117135000` |
| `20261117122742` | `dcds_community_official_staff_badges` | `20261117140000_dcds_community_official_staff_badges.sql` | `20261117140000` |
| `20261117122941` | `dcds_community_official_staff_badges` | Same candidate file | `20261117140000` |
| `20261119193053` | `dcds_regional_course_pricing` | `20261111090000_dcds_regional_course_pricing.sql` | `20261111090000` |
| `20261119193834` | `dcds_regional_course_pricing` | Same candidate file | `20261111090000` |
| `20261119193056` | `dcds_admin_payment_operations` | `20261111110000_dcds_admin_payment_operations.sql` | `20261111110000` |
| `20261119194002` | `dcds_admin_payment_operations` | Same candidate file | `20261111110000` |
| `20261119193100` | `dcds_payment_verification_audit_event` | `20261111113000_dcds_payment_verification_audit_event.sql` | `20261111113000` |
| `20261119194013` | `dcds_payment_verification_audit_event` | Same candidate file | `20261111113000` |
| `20261119193103` | `dcds_pending_checkout_reconciliation` | `20261112081327_dcds_pending_checkout_reconciliation.sql` | `20261112081327` |
| `20261119194055` | `dcds_pending_checkout_reconciliation` | Same candidate file | `20261112081327` |

There are six repeated logical names in the Development history. The two remote versions for each name must be treated as distinct applied records until their actual SQL effects are established.

## 2. Repeated logical name in production-candidate

| Remote version | Remote migration name | Candidate checked-in file | Candidate local timestamp |
|---|---|---|---|
| `20261118165734` | `dcds_vtu_pay_per_order_checkout` | `20261118165000_dcds_vtu_pay_per_order_checkout.sql` | `20261118165000` |
| `20261118165809` | `dcds_vtu_pay_per_order_checkout` | Same candidate file | `20261118165000` |

The production-candidate history has one repeated logical name. The local SQL file is a candidate, not proof that both remote versions ran identical SQL.

## 3. Local SQL effect fingerprints inspected

These are observations from the checked-in SQL bodies, not statements about the exact SQL executed at each remote version.

| Candidate file | Observed local SQL effects | Reconciliation concern |
|---|---|---|
| `20261111090000_dcds_regional_course_pricing.sql` | Creates/maintains the regional course-price index and RLS policies; contains `dcds_create_checkout_order` function logic. | The remote history contains two records with this name. Compare actual checkout function definition and policy state before assigning either remote version. |
| `20261111110000_dcds_admin_payment_operations.sql` | Payment-receipt review/event indexes and RLS, payment-receipt Storage policies, manual bank-order and review functions. | This is operational payment logic, not merely dashboard metadata. Confirm function bodies, grants, Storage policies and related tables. |
| `20261111113000_dcds_payment_verification_audit_event.sql` | Defines `admin_finalize_flutterwave_payment`, verifies order/transaction/amount/currency relationships, inserts payment records, marks course orders successful, enrols the learner, and records a payment-review event. Execute is revoked from browser roles and granted to `service_role`. | Despite its filename, the file contains course-payment finalization and enrolment behavior. It must not be treated as an inert audit-only migration. Protect course/payment integrity. |
| `20261112081327_dcds_pending_checkout_reconciliation.sql` | Adds `orders.checkout_expires_at`, creates a pending-checkout index, alters payment-review event constraints and drops/replaces checkout/admin-list functions. | This can affect checkout behavior. Compare the current function signatures and bodies, constraints and index definition before any migration-history decision. |
| `20261117135000_dcds_community_course_qna_channels.sql` | Adds course linkage to Student Community rooms; changes room types/policies and adds enrollment-synchronization trigger/function logic. | This is tied to the supervised Student Community room/cohort model. Do not repurpose it for Verified+ network content or moderation. |
| `20261117140000_dcds_community_official_staff_badges.sql` | Defines a stable security-definer helper that returns only administrator user IDs for official staff badges; grants authenticated execution but not public/anon execution. | Check the exact remote function definition and EXECUTE grants. It exposes only a constrained boolean-like staff identity lookup, not admin-table access. |
| `20261118165000_dcds_vtu_pay_per_order_checkout.sql` | Adds indexes for `dcds_vtu_orders` and enables RLS; the header describes server-only writes/reads and no client-role table access. | This is money-moving VTU order infrastructure. Do not repair or replay its history without checking table schema, RLS, grants, indexes and Edge Function assumptions. |

## 4. Other important local migration status

### Draft phase-one migration

`supabase/migrations/20261110000100_phase1_security_reliability.sql` explicitly labels itself a feature-branch draft and says not to apply it to Production. It is not timestamp-matched in either remote history. It changes course checkout/support-ticket behavior and has a dedicated workflow dependency. Keep it excluded from any bulk migration application until separately resolved.

### Timestamp matches are not content matches

The current filename-to-remote comparison is based on timestamp equality. A logical name match can identify a candidate file, but the remote migration metadata does not provide the SQL text, hash, or repository commit that produced a particular remote version. Repeated remote names could represent replays, corrected SQL, separate revisions, or renamed history records. Do not guess which.

## 5. Workflow safeguards and stale-baseline observations

The current branch contains two baseline-related workflows:

- `.github/workflows/dcds-production-schema-export.yml` has a manual dispatch path and an automatic push trigger scoped to `feature/phase1-security-reliability`, not this Verified+ feature branch. Its script uses a production database URL secret for schema-only export and custom-trigger inspection. It was inspected but not triggered.
- `.github/workflows/dcds-development-baseline-restore.yml` is a write-capable Development restore workflow. It is scoped to `feature/phase1-security-reliability` plus manual dispatch, validates a hard-coded old artifact/run reference, and expects a historical baseline of 34 public tables, 26 functions, 59 policies and other fixed counts. The latest Development inventory contains 81 public tables. Its preflight should classify the current Development schema as unsafe rather than empty or matching that older baseline and exit before the SQL-apply step. **Do not dispatch this workflow as the current Development restore plan.** The artifact/run reference and expected schema counts need revalidation before the workflow is used at all.

Neither workflow was run. No database connection or SQL execution was initiated by this inspection.

## 6. Next reconciliation actions

1. Obtain fresh schema-only exports from both projects using approved read-only credentials and store them as private, short-retention artifacts; never commit production data or secrets.
2. Extract the actual current definitions of the objects touched by each candidate migration: function bodies and grants, table/column/constraint/index definitions, policies, triggers and Storage policies.
3. Compare those live object definitions against each local candidate SQL file and available Git history. Record each remote version as **confirmed equivalent**, **later revision**, **partially represented**, **unmapped**, or **unknown**.
4. Recover any missing SQL from reviewed Git commits or backup artifacts where possible. A live schema dump can confirm current state, but cannot by itself prove the exact historical SQL that created it.
5. Only after this crosswalk is evidenced should we design a canonical local baseline and a forward-only migration sequence. Test it on a disposable local PostgreSQL/Supabase environment before considering a Development-only change.
6. Keep Production read-only until the project-to-deployment mapping, backup/rollback process and migration history are independently verified.

## 7. Actions deliberately not performed

- No `supabase migration repair`, `supabase db push`, linked reset, schema reset or SQL migration was run.
- No remote schema, row, role, grant, secret, Edge Function or payment setting was changed.
- No baseline restore or production export workflow was dispatched.
- No Student Community policy or Verified+ domain table was changed.

**Status:** The next task is object-level schema comparison using fresh read-only exports. The migration crosswalk is now more specific, but it is still not safe to reconcile or apply.
