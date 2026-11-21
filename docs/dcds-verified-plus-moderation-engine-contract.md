# DCDS Verified+ Moderation Engine — Server Contract

**Status:** Provider-neutral domain engine and synthetic tests prepared  
**Target branch:** feature/dcds-verified-plus-ecosystem  
**Production impact:** None. No database schema, RLS policy, Edge Function endpoint, secret, account or deployment is modified by this preparation.

## 1. Purpose and boundary

The moderation engine is a server-authoritative policy layer for the DCDS Verified+ Member Network. It is not a replacement for authentication, membership billing, identity verification, database access control, media scanning or human moderation.

The first implementation unit is located at:

- supabase/functions/_shared/verified-plus/moderation-engine.ts
- supabase/functions/_shared/verified-plus/moderation-engine_test.ts

The module is pure: deterministic inputs produce deterministic policy outcomes. It has no database, storage, network, Supabase client, AI provider, queue or notification dependency.

## 2. Server-trusted access context

Before calling authorizeNetworkAction, an Edge Function must derive:

- authenticated user ID/session from verified JWT/session context;
- active/locked/deleted account status from authoritative account records;
- identity decision from the identity domain, not user-editable metadata;
- monthly/lifetime membership entitlement and current expiry from the membership domain;
- network age eligibility from the final DCDS age policy;
- current network-only restriction and expiry from the moderation domain.

Never accept client-submitted isVerified, isPaid, role, isModerator, ageEligible, strikeCount, restriction or contentApproved values as authoritative.

### Action matrix

| Action | Standard signed-in account | Active Verified+ account |
|---|---:|---:|
| View approved feed | Yes | Yes |
| React/comment/reply/reshare | Yes, subject to age and restriction controls | Yes, subject to restriction controls |
| Create original post | No | Yes |

All signed-out feed requests are denied. A posting-only restriction leaves engagement available; an engagement restriction leaves read access available; a participation suspension or permanent ban blocks the network. A safety hold blocks network writes while a reviewer examines the case.

Unresolved age eligibility may retain authenticated read access but blocks network social writes until the DCDS age policy is final. Ineligible accounts are denied network access. This is a conservative gate and must be reconciled with the final minimum-age policy before release.

## 3. Content-check contract

moderateNetworkContent applies deterministic first-pass checks to original posts, comments, replies and attributed reshares.

| Condition | First-pass result |
|---|---|
| Exact approved HTTPS DCDS host and path | May pass URL check |
| External URL, lookalike host, insecure URL | Reject |
| Email, phone number, off-platform handle | Reject |
| Explicit off-platform group/contact invitation | Reject |
| Explicit off-topic lifestyle/social/political/religious solicitation | Reject |
| Empty content or invalid reshare caption | Reject |
| DCDS relevance unclear | Hold for human review |
| Unconfirmed parent post for comment/reply | Hold for human review |
| Possible duplicate / rate threshold reached | Hold for review/service handling |
| Safety classifier signal | Hold; no automatic strike |
| Approved original content with DCDS topic signals | Pass first-pass checks |
| Approved reference reshare with no caption | Pass only after server verifies original is still shareable |

The DCDS URL allowlist is supplied by trusted server configuration. Exact host matching is used; wildcards are not supported. Paths are matched on segment boundaries. There is no default allowlist entry.

The first-pass topic dictionary is not a complete language-understanding system. A keyword pass is not proof of policy compliance. A classifier flag is not proof of a violation. Ambiguous content must go to a human rather than be auto-published or automatically sanctioned. Before launch, DCDS must add a reviewed multilingual phrase test corpus and evaluate false-positive and false-negative rates.

The result includes mayApplyAccountSanction=false. A content classifier never writes a strike, suspends an account or permanently bans a member.

## 4. Confirmed strike computation

The caller must load confirmed strike events for the account and apply the rolling 180-day window using server time. Pending reports, rejected reports, overturned strikes and unconfirmed flags must not count.

| Next confirmed strike | Domain plan |
|---|---|
| 1 | Remove content, record strike and warning |
| 2 | Remove content, record strike and 7-day original-posting restriction |
| 3 | Remove content, record strike and 30-day network posting/engagement suspension |
| 4 or later | Remove content, record strike and require Root Administrator review; 90-day participation restriction only after Root approval |

The strike planner returns a plan only. The persistent write must be a single server-side transaction covering the confirmed case decision, strike event, restriction record, content visibility state and append-only audit event. Unique case/decision constraints must make retries idempotent. Do not update course, payment, wallet, payout, identity, membership billing or VTU tables as a side effect.

## 5. Moderator authorization

authorizeModerationAdminAction defines the initial role boundary:

- Moderators may approve/remove content, warn, record a confirmed strike, apply a 7-day posting restriction and initiate temporary safety holds within their scope.
- A 30-day suspension requires explicit senior delegation or Root authority.
- Fourth-strike/90-day participation suspension is Root-only.
- Permanent network ban is Root-only and also requires a severe case, an active safety-hold state and typed PERMANENT confirmation.
- Automated services cannot issue formal sanctions or decide appeals.
- Appeal resolution requires a reviewer identity different from the original decision maker.

Production server routes must independently load actor role grants from the admin-authorization source, validate current status and enforce every condition again inside the write transaction. The client-side admin selector is never an authority.

## 6. Required server orchestration before production

1. Verify the request session and derive the account ID from the session.
2. Load relevant network entitlement, age gate, restriction, parent/reference item and moderator permission from trusted server-side records.
3. Call the access gate for the requested network action.
4. Validate input shape, size, media metadata, idempotency and rate limits.
5. Run the content checks and configured safety services.
6. If rejected, return a safe reason code without publishing. If held, create a pending-review item only after the persistence schema is approved. If allowed, proceed to the transactional write path.
7. For moderator actions, load target case, active strikes and actor authorization; require a reason code and moderator note.
8. Commit case decision, strike/restriction, content state and audit event atomically. Ensure idempotent retries.
9. Notify the affected account without exposing reporter identity or restricted evidence.
10. Support independent appeals, reversal/correction events and restriction expiry.

The first live Edge Function must not be wired until the migration reconciliation blocker is cleared and the minimum schema/RLS design is reviewed. Do not create schema or deploy an endpoint as part of this preparation task.

## 7. Privacy and data boundaries

The moderation engine reads only content deliberately submitted to or displayed in the network and the minimum account/access state needed to authorize an action.

It must not read private AI conversations, private learning memory, NIN/document images, biometric evidence, private messages, guardian details, grades, course submissions, payment data, wallet balances, payouts or VTU records for network content decisions.

Moderation records and evidence require least-privilege access, a documented retention period, append-only correction history and reporter-identity confidentiality.

## 8. Persistence and RLS design

The [Moderation Persistence and RLS Design](dcds-verified-plus-moderation-persistence-and-rls-design.md) maps the pure domain engine to a proposed dedicated Verified+ database boundary, including content, reports, cases, strike and restriction events, appeals, moderator grants, audit events, RLS roles, transactional writes and a test matrix.

The live schema currently contains a separate room/cohort Student Community moderation system. Do not reuse its posts, reports, moderation actions, reactions or blocks for Verified+.

## 9. Launch gates and remaining work

- Reconcile existing remote migration histories and tracked migration files before proposing any database migration.
- Finalise DCDS minimum age and standard-member age-gate policy.
- Confirm the moderator role/grant source and delegated 30-day restriction procedure.
- Define approved DCDS host/path allowlist and review ownership.
- Add multilingual content examples and a reviewed moderation test set.
- Design RLS and transactional persistence for posts, cases, strikes, restrictions, appeals and audit events.
- Add media antivirus/MIME/size/OCR/QR scanning via a replaceable provider adapter.
- Add rate limiting and duplicate detection through the chosen persistence/cache boundary.
- Build authenticated Edge Function routes only after the preceding gates are met.

**Implementation status:** Pure moderation domain functions and synthetic tests are prepared in the feature branch. No live moderation endpoint, database object, RLS policy, user restriction or production deployment is active.
