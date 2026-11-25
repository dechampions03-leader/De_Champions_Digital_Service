# DCDS Verified+ Moderation Persistence and RLS Design

**Status:** Design proposal only — not a migration and not approved for database execution  
**Review date:** 2026-11-21  
**Target branch:** `feature/dcds-verified-plus-ecosystem`  
**Production impact:** None. No database object, policy, role, storage bucket, Edge Function, account or deployment is changed by this document.

## 1. Design goal

Persist the Verified+ Member Network as a separate DCDS product domain with secure content, reports, moderation cases, strikes, restrictions, appeals and audit history.

The database must enforce the same product rules already specified:

- all eligible signed-in DCDS accounts can read approved member-network posts;
- only identity-approved accounts with active Monthly (30-day), Annual (12-month) or Five-Year (60-month) Verified+ entitlement can create original posts;
- eligible standard/unverified accounts can react, comment, reply and reshare attributed references;
- no anonymous access;
- off-brand content and unapproved external links must not become visible;
- moderation is scoped to the Verified+ network and does not alter unrelated platform entitlements;
- permanent network bans require Root Administrator approval and a severe-case review;
- automated content checks never issue a strike or permanent sanction.

This is a persistence and access-control design, not a deployment plan.

## 2. Current database evidence and hard blocker

Fresh read-only Supabase checks on 2026-11-21 confirmed:

| Environment | Supabase project ref | Remote migration records | Local migration files | Exact timestamp matches | Local timestamps absent remotely | Remote timestamps absent locally | Public tables |
|---|---|---:|---:|---:|---:|---:|---:|
| DCDS-Development | `tjgsxbmkpvktlqulbktv` | 54 | 48 | 4 | 44 | 50 | 81 |
| Production-candidate | `qxsenflgaweeadvggnyp` | 80 | 48 | 8 | 40 | 72 | 94 |

Project metadata currently reports both projects as ACTIVE_HEALTHY. That does not make their migration histories reconciled. The production-candidate project's mapping to the actual public deployment must still be confirmed from release configuration before any write or deployment.

The same read-only checks found the existing Student Community data model and policies in both environments. In particular:

- `dcds_community_posts` is room-bound, has a `room_id`, and its access policy depends on approved community membership and current community rules;
- `dcds_community_reports` is room-bound and currently targets the Student Community's `message` or `post` objects;
- `dcds_community_moderation_actions` records Student Community action types such as publish, hide, remove, reject, verify, suspend, restore and report resolution;
- `dcds_community_post_reactions` is a separate same-cohort positive-reaction model;
- `dcds_community_blocks` is the Student Community block relationship.

These structures implement the supervised age-cohort Student Community. **Do not repurpose them for the Verified+ Network.** Their room/cohort/member checks are not equivalent to the wider signed-in DCDS feed, and expanding their policies could weaken child-safety boundaries.

The current schema also exposes two admin registries (`admin_users` with `admin`/`super_admin` values, and `dcds_admins` membership). The canonical Root Administrator mapping and delegated moderation-role source must be confirmed before a role-grant migration or administrator seed is designed.

## 3. Domain separation

Use a dedicated Verified+ naming boundary. Suggested future objects below are conceptual and must be checked against the reconciled canonical schema before their names are finalised.

### 3.1 Member content

| Proposed object | Purpose | Important constraints |
|---|---|---|
| `dcds_verified_network_posts` | Original Verified+ member posts | `author_id` references `auth.users`; server-derived publisher entitlement; publication state; bounded text; moderation decision reference; timestamps |
| `dcds_verified_network_comments` | Comments and threaded replies | `post_id`, `author_id`, optional `parent_comment_id`; bounded text; approved/hidden/removed/pending state |
| `dcds_verified_network_reactions` | One active emoji reaction per user/post | Unique `(post_id,user_id)`; enum/check constraint for supported reactions; account and age gate enforced by server/RLS |
| `dcds_verified_network_reshares` | Attributed in-network reference reshares | Original post ID + resharer ID; unique per pair; no caption/body/media/URL column; cannot widen audience |
| `dcds_verified_network_media` | Private media metadata | Owner, storage path, MIME/size/check status; private bucket; no public object URL |

No new post should copy a private course, grade, AI, credential or student record. When a member deliberately shares a permitted excerpt from another DCDS feature, store only the selected content/reference and source type—not a live join that exposes the source record.

### 3.2 Reports and moderation cases

| Proposed object | Purpose | Important constraints |
|---|---|---|
| `dcds_verified_network_reports` | Member safety reports | Reporter, target content type/id, reason code, details, status, assigned reviewer; reporter identity hidden from the reported member |
| `dcds_verified_network_moderation_cases` | Human-review queue and system-held cases | Source report or system signal, content target, target member, severity, reason codes, case state, assignment, idempotency key |
| `dcds_verified_network_strike_events` | Confirmed violation ledger | Append-only event, target account, case, event timestamp, confirmation actor and reason code; only confirmed, non-overturned events count |
| `dcds_verified_network_restriction_events` | Restriction grant/lift history | Append-only grant/revoke/expiry events; restriction scope, start/end, case, actor and reason |
| `dcds_verified_network_appeals` | Member challenge to formal action | Case/action reference, appellant, submitted statement, status and assigned independent reviewer |
| `dcds_verified_network_appeal_events` | Appeal decision and correction history | Append-only decision/correction events; reviewer must differ from original decision maker |
| `dcds_verified_network_audit_events` | Append-only action history | Actor, target, case, action, reason code, timestamps, correlation/idempotency key and minimal before/after metadata |

Avoid a polymorphic target reference becoming an implicit permission check. The server must validate each target type/id against the correct Verified+ content table before creating or resolving a case. A case reference by itself must never grant content access.

Avoid copying the full reported content into every report/audit row. Keep the canonical content in the content table; store the minimum case reference and a restricted evidence pointer only when preservation is necessary for a safe review. Evidence storage must be private and retention-limited.

### 3.3 Roles and policy configuration

| Proposed object | Purpose | Important constraints |
|---|---|---|
| `dcds_verified_network_admin_grants` | Explicit network moderator/senior moderator/root grants | User, role, active interval, grantor, reason and revocation event; no client self-assignment |
| `dcds_verified_network_allowed_destinations` | Exact DCDS-controlled HTTPS link allowlist | Exact hostname and path prefix; no wildcard host; enabled/disabled; approval actor and audit event |
| `dcds_verified_network_policy_versions` | Versioned policy/notice acceptance | Policy version, effective date and member acceptance; never infer acceptance from account creation |

Do not seed or map a Root Administrator from `admin_users` or `dcds_admins` until the canonical authority and current Root account are confirmed. Existing admin membership must not silently grant Verified+ moderation or permanent-ban authority.

## 4. Publication and moderation lifecycle

### 4.1 Content submission

1. Derive the member ID from the verified auth session. Ignore client-supplied author, role, membership, age, moderation, strike and account-status claims.
2. Load the identity decision, active Verified+ membership entitlement, account status, age eligibility and current network restriction from their respective trusted domains.
3. Call the provider-neutral `authorizeNetworkAction` access gate.
4. Validate length, media metadata, parent/original reference, idempotency key and rate-limit signals.
5. Run `moderateNetworkContent` and any configured media/safety scanners.
6. On clear rejection, do not publish. On uncertainty or safety signal, hold for review. On a clean first-pass result, create content in a non-public pending state until the server's publication transaction succeeds.
7. In one database transaction, persist content and the moderation outcome/audit reference, then expose it only when the trusted status is published/approved.

The pure moderation engine only returns a decision. It never creates a report, case, strike, restriction or ban.

### 4.2 Moderator decision transaction

A formal moderation decision must be a single trusted server transaction that:

- verifies the acting administrator's current grant and scope;
- verifies the case is open and the case target is still the expected content/member;
- validates reason code and moderator note;
- checks active confirmed strike events in the rolling 180-day window using database/server time;
- marks/hides/removes the content as required;
- writes the confirmed strike event where applicable;
- writes the restriction event where policy requires it;
- appends a moderation audit event;
- marks the case resolved/escalated;
- uses an idempotency key/unique constraint to prevent duplicate strikes when a request is retried.

A failed transaction must leave the content, strike count, restriction and audit state unchanged together. Do not split a sanction into separate client writes.

### 4.3 Restriction expiry

The system must derive active restrictions using server time. Expired posting/engagement restrictions must stop applying without a manual client toggle. Preserve grant, expiry and revocation events for audit; never rewrite an old audit event to make history appear different.

The four-step ladder remains:

1. confirmed strike 1: remove/reject content and warning;
2. confirmed strike 2: 7-day original-posting restriction;
3. confirmed strike 3: 30-day network posting/engagement suspension;
4. confirmed strike 4+: Root Administrator review; any 90-day participation suspension requires Root approval.

The 180-day count includes confirmed, non-overturned events only. Reports, automated flags, duplicate alerts and pending cases do not count as strikes.

### 4.4 Appeals

- A member submits an appeal through an authenticated endpoint.
- The original decision maker cannot decide the appeal.
- An overturned decision creates a correction event and restores the applicable network privilege if no other active restriction applies.
- Never delete the original action or overwrite the original audit event.

## 5. RLS and grant model

All proposed content and moderation tables must have RLS enabled. No anonymous access is allowed.

| Data class | Anonymous | Standard signed-in member | Active Verified+ member | Moderator | Root Administrator |
|---|---|---|---|---|---|
| Published network posts/comments | Deny | Read eligible published feed | Read eligible published feed | Read for authorised review | Read all in network scope |
| Own pending content | Deny | Read own safe status only | Read own safe status only | Read in assigned scope | Read all |
| Original-post insert/update | Deny | Deny | Server endpoint only, after entitlement check | Not granted by role alone | Not granted by role alone |
| Comments/replies/reactions/reshare | Deny | Server endpoint only, subject to eligibility/restriction | Server endpoint only, subject to restriction | No bypass of member rules by default | No bypass of member rules by default |
| Member reports | Deny | Submit/view own report receipt only | Submit/view own report receipt only | Assigned moderation scope | All Verified+ cases |
| Case details/evidence | Deny | Deny | Deny | Assigned case only; minimum evidence | Full Verified+ moderation scope |
| Strike/restriction summary | Deny | Own safe summary only | Own safe summary only | In assigned scope | Full Verified+ network scope |
| Appeals | Deny | Submit/view own appeal | Submit/view own appeal | Only when not original decision maker and assigned | Independent review and Root review |
| Admin grants/allowlist | Deny | Deny | Deny | Read only if needed for delegated scope | Manage under Root-only controls |
| Audit events | Deny | No direct table access | No direct table access | Case-scoped audit fields | Full Verified+ network audit |

**Important:** RLS filters rows; it does not implement every business transition. The default client role must not receive direct INSERT/UPDATE/DELETE privileges on reports/cases/strikes/restrictions/appeals/audit/admin grants. Use narrow authenticated server endpoints or carefully audited RPCs for writes.

Any `SECURITY DEFINER` helper/RPC must use an empty or fixed `search_path`, schema-qualified object references, explicit execute grants, authenticated actor derivation and strict input checks. Re-review every execute grant and helper body. Never trust a role or user ID supplied by the browser.

For feed reads, use a dedicated policy/helper that verifies the signed-in account is active, network-eligible under the final DCDS age policy, not permanently banned/participation-suspended, and not blocked by a relationship rule. Do not make a public bucket or public view to simplify the feed.

## 6. Admin authority model

- Moderator: content review, remove/hide, warning and first/second-strike action within a delegated case scope.
- Senior moderator: may receive explicit delegation for 30-day network suspension, time-bounded and auditable.
- Root Administrator: fourth-strike escalation, 90-day participation suspension, and permanent Verified+ network ban after severe-case human review.
- Automated service: may create a review signal or hold item; cannot issue formal strikes, suspensions, permanent bans or decide appeals.

The exact Root Administrator identity bootstrap, current admin source and delegation approver remain unresolved. Do not implement an admin-grant seed until verified by a read-only mapping of existing admin registries and explicit owner approval.

## 7. Security and privacy non-goals

The Verified+ network moderation domain must not read or modify:

- private DCDS AI conversations or saved AI learning memory;
- NIN numbers, identity-document scans, selfies, facial templates or provider evidence;
- student grades, assignment answers, private course submissions or guardian records;
- course payment orders or payments;
- wallet/balance, referral rewards, ambassador ledger, payout or VTU records;
- existing Student Community age-cohort membership, moderation cases, guardian-consent records or community posts.

Network strikes affect Verified+ Network privileges only. They must not cancel paid membership, change identity verification, alter billing, suspend courses or mutate financial/VTU records.

## 8. Required RLS and transaction test matrix

Before a migration is approved, test with separate synthetic identities:

- anonymous visitor;
- standard signed-in member;
- identity-approved active Monthly Verified+ member;
- identity-approved active Annual Verified+ member;
- identity-approved expired Monthly member;
- identity-approved expired Annual member;
- unverified member attempting original post;
- ineligible-age and unresolved-age accounts under the final DCDS policy;
- member with posting-only restriction;
- member with engagement suspension;
- member in safety hold;
- permanently network-banned member;
- moderator without case assignment;
- moderator assigned to the case;
- senior moderator without and with 30-day delegation;
- Root Administrator;
- original decision maker attempting self-review of an appeal;
- independent appeal reviewer;
- blocked member attempting feed, comment, reaction and reshare access.

Test idempotent retries, concurrent duplicate reports, concurrent strike resolution, exact 180-day boundaries, expired restriction, owner spoofing, cross-account row IDs, forged role claims, RLS direct access, SQL function grants, private-media URL leakage and audit append-only guarantees.

## 9. Existing advisor findings to handle separately

Fresh security-advisor checks on 2026-11-21 still report 13 Development tables and 24 production-candidate tables with RLS enabled but no policies. Some may be intentionally server-only. Do not bulk-add permissive policies or remove RLS. Review each table's intended access and grants individually.

The production-candidate and Development advisors also retain broader existing authentication/permission warnings. Verified+ must not treat the current database as security-cleared merely because its own domain tests pass.

## 10. Migration and release gate

The current remote migration histories remain inconsistent with the 48 checked-in files (4 exact timestamp matches in Development; 8 in production-candidate). Do not create/apply a Verified+ migration to either shared project until the canonical Development baseline has been rebuilt and compared successfully.

Required order:

1. resolve the existing migration-reconciliation plan in `docs/dcds-migration-reconciliation.md`;
2. confirm Production project mapping and backups;
3. finalise minimum-age and Root Administrator identity/role mapping;
4. review this schema/RLS proposal against the canonical rebuilt Development schema;
5. prepare a forward-only, feature-scoped migration with no edits to existing Student Community tables;
6. test clean local rebuild, RLS, transactional RPCs, idempotency, media access and appeals;
7. run advisors and security review;
8. only then request a separate approval for Development schema application.

**Current status:** Design proposal complete. No SQL migration, RLS policy, storage bucket, function endpoint or database write has been applied.
