# DCDS migration reconciliation report

**Audit date:** 2026-11-21  
**Mode:** Read-only inspection  
**Repository:** `dechampions03-leader/De_Champions_Digital_Service`  
**Inspected repository ref:** `main` (`51c184105af1b9688914f0ccc93cd1f6378d8d59`)  
**Working feature branch:** `feature/dcds-verified-plus-ecosystem`

## Executive result

**Migration reconciliation is not complete. Do not run `supabase db push`, `supabase migration repair`, `supabase db reset --linked`, or apply a new DCDS Verified+ migration to either shared Supabase project yet.**

Supabase migration comparison is timestamp-based. The exact timestamp overlap between the checked-in migration filenames and the remote migration histories is low:

| Environment | Checked-in migration files | Remote applied records | Exact timestamp matches | Local timestamps not found remotely | Remote timestamps not found locally |
|---|---:|---:|---:|---:|---:|
| DCDS-Development | 48 | 54 | 4 | 44 | 50 |
| Production-candidate project | 48 | 80 | 8 | 40 | 72 |

Matching migration names do not resolve this mismatch. Some SQL changes appear under different timestamp prefixes in the remote history; other remote records have no direct counterpart in the current `main` migration directory. A name-only mapping is diagnostic evidence, not proof that two migration files are equivalent.

Supabase documents that `supabase migration list` compares timestamps only, and that `migration repair` changes the remote migration history by inserting or deleting history records. Repair must not be used as a shortcut to conceal an unreviewed schema difference.

References:
- [Supabase local development workflow](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Supabase migration list](https://supabase.com/docs/reference/cli/supabase-migration-list)
- [Supabase migration repair](https://supabase.com/docs/reference/cli/supabase-migration-repair)
- [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations)

## Latest read-only revalidation — 2026-11-21

The two configured Supabase projects were checked again through the current project list, migration list, public-table inventory, targeted information-schema/pg_policies inspection, and security advisors. No DDL or data-changing query was run.

| Environment | Current project status | Remote migration records | Local SQL files | Exact timestamp matches | Local timestamps absent remotely | Remote timestamps absent locally | Public tables |
|---|---|---:|---:|---:|---:|---:|---:|
| DCDS-Development (`tjgsxbmkpvktlqulbktv`) | ACTIVE_HEALTHY | 54 | 48 | 4 | 44 | 50 | 81 |
| Production-candidate (`qxsenflgaweeadvggnyp`) | ACTIVE_HEALTHY | 80 | 48 | 8 | 40 | 72 | 94 |

The timestamp reconciliation remains unchanged and incomplete. Development still has repeated logical names under multiple remote versions (including community course-Q&A channels, official staff badges, regional course pricing, admin payment operations, payment verification audit events and pending-checkout reconciliation). The production-candidate history still contains the repeated VTU pay-per-order checkout logical name. These are unresolved content-mapping tasks, not safe repair candidates.

The live schema inspection also reconfirmed that the existing `dcds_community_posts`, `dcds_community_reports`, `dcds_community_moderation_actions`, `dcds_community_post_reactions` and `dcds_community_blocks` tables belong to the supervised room/cohort Student Community. Their policies depend on room membership, accepted rules, cohort restrictions and Student Community moderation. They are **not** the Verified+ network persistence layer and must not be widened or repurposed.

The existing Student Community moderation action model is scoped to community messages/posts/reports/credentials/membership/access/live sessions. It does not provide the Verified+ strike ledger, 180-day strike window, independent appeal lifecycle, delegated network restrictions or separate Root-only permanent network-ban controls. Verified+ requires separately scoped records and policies.

The security advisors still report RLS-enabled tables with no policies on 13 Development tables and 24 production-candidate tables. This needs individual table/grant review. It is not permission to add broad policies or disable RLS.

Production-candidate table inventory includes existing course orders, payments, enrolments, payouts, notifications and account-related records. Keep that environment read-only during this reconciliation and preserve all production records.

**Decision:** The migration blocker remains active. No migration repair, schema pull, reset, DDL, Edge Function deployment, role change, secret edit, data mutation or Production release was performed during this revalidation.

## 1. Environments inspected

| Supabase project | Project ref | Status | Applied migration records | Public tables |
|---|---|---|---:|---:|
| DCDS-Development | `tjgsxbmkpvktlqulbktv` | ACTIVE_HEALTHY | 54 | 81 |
| Production-candidate project (`dechampions03-leader's Project`) | `qxsenflgaweeadvggnyp` | ACTIVE_HEALTHY | 80 | 94 |

The second project is treated as the production candidate based on the existing DCDS project separation/history. Confirm the deployment-to-project mapping from the release configuration before any write or deployment. Both projects were inspected through read-only project metadata, migration-list, table-list and advisor calls.

## 2. Timestamp reconciliation

The comparison used each checked-in filename's leading timestamp against the remote `schema_migrations` version returned by Supabase.

### DCDS-Development

Exact timestamp matches:
- `20261113074944_dcds_ai_conversation_memory.sql`
- `20261113075745_dcds_ai_private_rls_helper.sql`
- `20261117083732_dcds_professional_learning_suite.sql`
- `20261117083924_dcds_professional_learning_suite_policy_hardening.sql`

That leaves 44 checked-in timestamps not present in the remote migration history and 50 remote timestamps not present in the current repository directory.

The Development migration history also contains repeated logical names under different versions, including:
- `dcds_community_course_qna_channels`
- `dcds_community_official_staff_badges`
- `dcds_regional_course_pricing`
- `dcds_admin_payment_operations`
- `dcds_payment_verification_audit_event`
- `dcds_pending_checkout_reconciliation`

Some repetitions may represent separate revisions, but their SQL content must be mapped before choosing any repair action.

### Production-candidate project

Exact timestamp matches:
- `20261111125858_dcds_international_payout_foundation.sql`
- `20261112081327_dcds_pending_checkout_reconciliation.sql`
- `20261113160000_dcds_ai_global_age_access_controls.sql`
- `20261113160210_dcds_ai_age_policy_autoapproval_guard.sql`
- `20261115133057_dcds_creative_showcase_media_manager.sql`
- `20261115133115_dcds_creative_showcase_policy_refinement.sql`
- `20261115133408_dcds_showcase_created_by_index.sql`
- `20261115133749_dcds_showcase_permanent_admin_only_policies.sql`

That leaves 40 checked-in timestamps not present in the remote history and 72 remote timestamps not present in the current repository directory.

The production-candidate history has a repeated logical name:
- `dcds_vtu_pay_per_order_checkout` appears under two remote versions (`20261118165734` and `20261118165809`).

Some remote names also contain the original filename timestamp as part of the name (for example, dual-channel signup verification). Do not infer equivalence from name text alone.

## 3. Repository baseline and configuration findings

### Existing schema baseline

The repository contains:

`supabase/baseline/dcds-production-complete-baseline.sql`

- Size: 373,633 bytes.
- Its commit message (2026-11-12 23:18:26 UTC) says it preserves the verified schema-only baseline used to restore DCDS-Development and contains no production customer rows.
- This is a valuable historical schema reference. It is not proof of the current schema in either remote environment and must not be replayed on a live database without a separate, reviewed restore plan.

### Supabase CLI configuration

The current `main` tree does not contain `supabase/config.toml`. That needs to be addressed as part of restoring a reproducible local Supabase CLI workflow. Do not invent configuration values or link the CLI to a project until the target is confirmed.

### Draft migration inside the migrations directory

`supabase/migrations/20261110000100_phase1_security_reliability.sql` is present in the migration directory but is not present by exact timestamp or migration name in either remote history. The file itself explicitly calls itself a draft and says not to apply it to production.

The draft includes a course checkout function and student support-ticket event-history changes. It is not a DCDS Verified+ migration. The existing `.github/workflows/phase1-validation.yml` checks for this exact path, so do not move or delete it without updating the workflow in a reviewed change. Until its intended status is clarified, do not push the migration directory wholesale to either shared project.

## 4. Related schema findings

The existing application schema already contains several profile-related domains:

- `profiles` — legacy profile table; its primary key is bigint and it is not directly keyed to `auth.users.id`.
- `dcds_career_profiles` — professional/career details.
- `dcds_community_profiles` — student-community profile with cohort and privacy restrictions.
- `dcds_student_projects` — student portfolio/project records.
- `dcds_community_credentials` — separately reviewed education/professional credentials.

These are not interchangeable. A universal profile should be a new, auth-user-keyed model, linking to these existing domains without overwriting student-specific age, guardian, or cohort controls.

The current course checkout function is not a drop-in membership checkout: it creates `orders` tied to `course_id`, and the existing admin verification flow assumes course orders/enrolment. Verified+ requires a separate membership-order and entitlement path.

## 5. Security advisor observations

Supabase advisors returned existing items that need a separate security review before launching identity and privacy features:

- Production-candidate project: 24 RLS-enabled tables with no policies; 26 SECURITY DEFINER functions callable by the authenticated role; and a warning that leaked-password protection is not enabled.
- Development: 13 RLS-enabled tables with no policies and 26 SECURITY DEFINER functions callable by the authenticated role.

An RLS-enabled table without policies is generally closed to API roles, which may be intentional for private/internal tables or may indicate missing policies. SECURITY DEFINER warnings must be reviewed function by function to confirm internal role checks and execute grants. Do not bulk-remove policies or privileges based only on advisor counts.

## 6. Safe reconciliation plan

### Gate A — preserve and establish the true environment mapping

1. Confirm which Supabase project ref is used by the current production deployment and which is Development.
2. Record fresh, read-only migration lists for both environments immediately before reconciliation.
3. Back up schema and data according to the project's retention and recovery requirements. Keep production customer data out of Git.
4. Keep the existing baseline as a historical reference; do not apply it to an existing database.

### Gate B — rebuild a trustworthy development baseline

1. Use an isolated local database or throwaway preview environment, not the shared production database.
2. Obtain a fresh schema-only dump from DCDS-Development using a read-only dump operation.
3. Compare that dump with the preserved 2026-11-12 baseline and the current 81-table Development schema inventory.
4. Reconstruct a canonical local migration baseline plus later, forward-only migrations. Review SQL for RLS, grants, functions, triggers, storage policies, extensions, and publication settings.
5. Confirm a clean local reset/rebuild succeeds before accepting the new baseline.
6. Determine how to reconcile the remote migration history only after the SQL changes represented by each timestamp have been verified. If repair is needed, apply it to an isolated Development target first and verify with `supabase migration list`.

### Gate C — Verified+ development

After Gate B:
1. Add only new forward migrations for the universal profile, identity cases/provider references, membership plans/orders/entitlements, privacy preferences, security events, and TRUSTMARKET seller applications.
2. Test RLS and permissions with anonymous, ordinary authenticated, verified active, verified expired, seller applicant, approved seller, moderator, and root-admin identities.
3. Implement the separate membership payment workflow and idempotent webhook finalization. Do not change course enrolment, VTU orders, payouts, or existing balances.
4. Run Supabase security/performance advisors and fix feature-specific findings before production planning.

### Gate D — production release

Production remains untouched until:
- target project mapping is confirmed;
- migration list is clean and reproducible;
- a full backup and rollback plan exist;
- development tests, payment replay tests, RLS tests, and privacy review pass;
- the identity-verification provider and its legal/privacy controls are selected;
- a production release is explicitly approved.

## 7. Actions performed in this audit

- Read GitHub repository metadata, main tree, migration filenames, relevant migration SQL, and baseline file metadata.
- Read project metadata, migration histories, table inventories, Edge Function inventory, and Supabase advisor output for both projects.
- Created the isolated GitHub working branch `feature/dcds-verified-plus-ecosystem` and stored this report there.

## 8. Actions deliberately not performed

- No SQL was applied.
- No migration history was repaired.
- No remote schema was reset, pulled, altered, or pushed.
- No Edge Function was deployed or replaced.
- No secrets, payment settings, production balances, student rows, or payout records were changed.
- No production deployment was triggered.

**Current status:** Migration reconciliation is a release blocker. Frontend design and provider-interface work can be prepared behind disabled feature flags, but database-backed Verified+ activation and TRUSTMARKET transactions must wait for a reconciled development schema.


## Latest DCDS-Development revalidation — 2026-11-23

This follow-up was a read-only check of DCDS-Development (tjgsxbmkpvktlqulbktv) after the Verified+ billing adapter work was added to the feature branch.

| Check | Result |
|---|---:|
| Project status | ACTIVE_HEALTHY |
| Applied remote migration records | 54 |
| Public tables | 81 |
| Verified+ billing / identity / membership-specific tables | 0 |
| Newly deployed Verified+ billing Edge Functions | 0 |
| DDL or data-changing operations in this revalidation | 0 |

A targeted information-schema search for tables containing verified_plus, membership, subscription, or billing returned only public.dcds_community_memberships. Its columns are id, room_id, user_id, role, status, created_at, and updated_at. Its RLS policies restrict member reads to the member's own room membership (or the existing DCDS admin helper) and administrator writes to the community administration path. This is the supervised Student Community room-membership table, not a Verified+ paid membership, subscription, entitlement, or billing ledger. Do not repurpose it.

The Development Edge Function inventory still contains the existing course-payment, VTU, webhook and AI functions, but no Verified+ billing checkout, cancellation or membership webhook function. Existing create-payment and verify-payment are course-specific and must remain separate from Verified+.

**Decision remains unchanged:** migration reconciliation is still a hard blocker. Do not apply a new migration, execute DDL, deploy a billing function, create Flutterwave plans, or change Development/Production secrets as part of this revalidation. The dedicated Verified+ schema, RLS, transactional RPCs and webhook persistence must wait for a reconciled, reproducible Development migration baseline.
