# DCDS Verified+ and Universal Profile Architecture

**Status:** Product decisions recorded; implementation specification in progress  
**Target branch:** `feature/dcds-verified-plus-ecosystem`  
**Production impact:** None. This document does not create or alter database objects, payment settings, secrets, or deployments.

## 1. Product goal

Build one connected DCDS identity and membership experience for registered people across the DCDS platform. A member uses one account and one universal profile across the Academy, AI Learning Assistant, community, professional tools, and DCDS TRUSTMARKET.

Verified+ is a paid membership and entitlement layer. It is not a claim that payment makes a person trustworthy, professionally qualified, or immune from fraud.

## 2. Confirmed product decisions

| Area | Decision |
|---|---|
| Universal profile | Available to every eligible registered DCDS member |
| Blue Badge identity eligibility | Nigerian and international members |
| Nigerian identity route | An authorised provider-supported NIN verification route or another accepted government document |
| International identity route | Accepted government-issued identity documents supported by the selected verification provider |
| Monthly Verified+ | NGN 7,500 for 30 days |
| Annual Verified+ | NGN 75,000 for 12 months, paid upfront |
| Five-Year Verified+ | NGN 320,000 for 60 months, paid upfront |
| Lifetime Verified+ | Not offered; no perpetual paid entitlement |
| Advanced privacy | Additional controls for active Verified+ members; baseline privacy remains available to everyone |
| Advertising | Standard members may be eligible for ordinary DCDS display ads; active Verified+ members receive an ad-free authenticated experience |
| TRUSTMARKET sellers | Must be Verified+ eligible, apply separately, and pass provider approval |
| Business and professional credentials | Separate verification tracks; identity verification alone does not confer them |
| Verified+ social network | All signed-in DCDS accounts can view and engage with approved posts; only eligible active Verified+ members can publish original posts |
| Verified+ interactions | Verified+ members publish original posts; all signed-in accounts can react, comment, reply and reshare attributed cards without captions |
| Blue Badge presentation | Exact blue scalloped rosette with a prominent white check; large on profiles, medium beside post names, compact in comments and member lists |
| Creator medal artwork | Gold scalloped seal with a purple centre star and purple ribbon tails; distinct from the Blue Badge |
| Creator label | Separate profile presentation label; it is not identity verification, a professional credential, or a membership entitlement |
| Member connections | Member cards provide Follow and Message actions, subject to privacy, age eligibility, contact preferences and safety controls |

| Accounts | One DCDS account and one universal profile; no separate marketplace or membership account |

### Membership and identity are separate

Maintain two independent records:

1. **Identity decision:** pending, verified, rejected, requires-review, suspended, or revoked.
2. **Membership entitlement:** inactive, active monthly, active annual, active five-year, expired, cancelled, or suspended.

A successful identity check is not a payment confirmation. A successful payment is not an identity approval. Seller approval is a third, independent decision.

Working expiry rule: keep the historical identity decision so a member does not have to repeat verification on every renewal, but disable paid Verified+ entitlements when the paid period ends: 30 days for Monthly, 12 months for Annual or 60 months for Five-Year. The public Blue Badge should be displayed only when the required identity and a currently active monthly, annual or five-year membership are both confirmed. No paid term creates a perpetual entitlement. Automatic renewal is opt-in for each plan, and members can cancel it themselves at any time without administrator approval; the paid entitlement remains active through the already-paid-through timestamp. See the [Automatic Renewal and Self-Service Cancellation Specification](dcds-verified-plus-auto-renewal-and-cancellation-spec.md) and the [Flutterwave sandbox integration runbook](dcds-verified-plus-flutterwave-sandbox-runbook.md). A provider adapter and mocked contract tests are now present in the feature branch; live sandbox qualification and Development persistence/webhook integration remain outstanding.

## 3. Universal Profile

Create a new universal profile layer keyed directly to `auth.users.id`. Do not repurpose the legacy `public.profiles` table: its current primary key is a bigint and it is not directly keyed to `auth.users`.

The universal profile should own only common identity and presentation fields:

- stable user ID and unique public username/slug;
- display name, avatar and optional cover image;
- short biography, interests and optional location;
- profile visibility and discoverability preferences;
- public contact preferences (never expose private email or phone by default);
- profile completion and public-profile status;
- created/updated timestamps.

Existing specialist data should remain in its current domains and be linked or surfaced through controlled profile sections:

- `dcds_career_profiles`: career headline, skills, interests and professional links;
- `dcds_community_profiles`: student-community identity and its cohort/privacy controls;
- `dcds_student_projects` and showcase items: portfolio/project records;
- `dcds_community_credentials`: educational and professional credentials.

Do not merge student-only community visibility rules into the global profile. Do not copy credentials or student data into public fields without an explicit member choice and suitable approval.

## 4. Blue Badge identity verification

**Implementation contract:** The vendor-neutral [identity provider adapter contract](dcds-verified-plus-provider-adapter-contract.md) defines the server-side integration boundary, normalized provider outcomes, replay protection, data minimisation, review permissions, failure handling, and rollout tests. No provider is selected and no identity-verification feature is enabled by this document.

### Eligibility and journey

Support Nigerian and international applicants through a provider adapter so the identity vendor can be changed without rebuilding DCDS.

Recommended journey:

1. Member selects a plan and reads the verification/privacy notice.
2. Member confirms legal name, country and required eligibility details.
3. DCDS creates a verification case and redirects or securely hands off to the selected provider.
4. Provider validates the accepted document and performs face-match/liveness checks where available and lawful.
5. DCDS receives a signed or server-validated outcome and provider reference.
6. Automated risk checks identify duplicates or inconsistencies.
7. Exceptions go to an authorised verification reviewer.
8. Payment is independently confirmed by the payment gateway.
9. The entitlement service activates the appropriate membership only when identity and payment requirements both pass.
10. The profile displays the correct badge and feature access.

### Data-minimisation rules

- Prefer provider-hosted document capture and biometric processing.
- Do not store raw NIN, full identity-document numbers, selfie images, facial templates, or biometric scans in ordinary DCDS profile tables.
- Store the minimum outcome data needed: provider name, provider reference, country, document category, status, timestamps, reason codes, and reviewer/audit references.
- Do not make government identity data public or use it for advertising, scoring, or profile discovery.
- Any exception that requires DCDS to retain identity evidence must first pass privacy/legal review, access-control design, encryption, retention and deletion design, and a DPIA where required.

The identity-verification vendor is not selected in this specification. Do not launch with a placeholder provider or a manual NIN-upload form.

## 5. Verified+ membership, billing and entitlements

See [the Verified+ pricing and commercial policy](dcds-verified-plus-pricing-and-commercial-policy.md) for the approved three-plan catalogue, separate applicant-paid identity-verification fee and financial release guardrails.

**Membership landing page:** [Open the DCDS Verified+ membership page](../verified-plus.html). This is an informational page with plan enquiries only; it does not process payments or start identity checks.

**Visual preview:** [Open the offline Verified+ membership pricing preview](../verified-plus-pricing-preview.html). It demonstrates the three approved price cards and is not connected to checkout or payments.

### Launch catalogue

| Plan | Price | Duration |
|---|---:|---|
| Monthly | NGN 7,500 | 30 days |
| Annual | NGN 75,000 | 12 months, paid upfront |
| Five-Year | NGN 320,000 | 60 months, paid upfront |

The Annual plan costs NGN 15,000 less than twelve Monthly payments (NGN 90,000), a 16.7% saving for a member paying annually. The Five-Year plan costs NGN 55,000 less than five consecutive Annual terms (NGN 375,000), a 14.7% saving. It expires after 60 months and is not lifetime access. Lifetime membership is discontinued and must not appear in checkout, marketing or entitlement grants. Previous draft pricing is retired.

### Payment rules

- Offer only the Monthly (NGN 7,500 / 30 days), Annual (NGN 75,000 / 12 months) and Five-Year (NGN 320,000 / 60 months) membership plans. Never create a lifetime or perpetual paid entitlement.
- Keep identity verification as a separate applicant-paid fee, outside both membership prices and also outside the Five-Year price. Show the fee before the identity check begins; its amount remains unapproved until provider pricing, payment-processing charges and applicable taxes are confirmed. Do not charge an applicant again for a retry caused by a DCDS or provider technical error.
- Automatic renewal is available for Monthly, Annual and Five-Year only after a separate explicit member opt-in; do not preselect consent or silently enrol a member.
- Provide member-controlled cancellation without administrator approval. Stop future provider charges after confirmed cancellation, while preserving the already-paid entitlement through its paid-through timestamp.
- Disclose price, currency, cadence, next charge date and cancellation path before consent. Require fresh consent for a changed renewal price.
- Follow the [Automatic Renewal and Self-Service Cancellation Specification](dcds-verified-plus-auto-renewal-and-cancellation-spec.md); do not enable a plan's recurring billing until its exact interval and cancellation behaviour pass sandbox tests.
- Build a dedicated membership checkout/order path. The current `create-payment` function creates course-specific orders, and the existing `orders.course_id` column is NOT NULL; the current admin verification path also assumes course orders and course enrolment. Do not route Verified+ membership purchases through that course-enrolment pipeline. Reuse the established Flutterwave provider-verification and webhook-security patterns only after adapting them to a separate membership order.
- Create an order/reference for the membership purchase and bind it to the authenticated user and selected plan.
- Confirm amounts, currency, transaction status and gateway reference server-side; never trust a client-side success redirect.
- Make webhook and verification processing idempotent.
- Do not grant entitlements from a pending, failed, mismatched, reversed, or unverified payment.
- Keep membership accounting separate from student course enrolments, VTU orders, payouts and wallet/balance records.
- Do not introduce an internal wallet or escrow in this release.
- Provide clear Monthly, Annual and Five-Year renewal, expiry, cancellation, refund and chargeback terms before checkout. The Annual entitlement ends after 12 months and the Five-Year entitlement ends after 60 months unless a new paid term is confirmed. The Five-Year payment is a single upfront charge with no automatic renewal.

### Entitlement service

The backend must calculate entitlements from trusted identity, membership and account state. The frontend may display features, but it must never be the authority for granting them.

Suggested entitlement keys:

- `verified_badge_display`
- `verified_plus_active`
- `ad_free_access`
- `advanced_privacy_access`
- `trustmarket_seller_application_access`
- `verified_member_network_access`
- `priority_support_access`
- `early_feature_access`

Do not use user-editable `user_metadata` or client-writable profile columns for authorization. A member must not be able to grant themselves a badge, change an expiry date, mark a payment paid, or approve their own seller application.

## 6. Verified+ experience

### Baseline available to all members

- secure authentication and session management;
- account recovery and essential security notifications;
- private-by-default contact details;
- ability to block and report other accounts;
- visibility controls for information that should not be public;
- access to privacy notices and account/data controls.

### Additional Verified+ controls

- Ghost Mode and online/last-seen visibility controls;
- fine-grained profile and discoverability controls;
- advanced message-request and contact restrictions;
- trusted-device and session-management centre;
- login/security activity history and enhanced alerts;
- emergency account freeze and strengthened recovery checks;
- ad-free authenticated experience for ordinary DCDS display ads;
- advanced profile and portfolio presentation;
- profile analytics;
- digital identity card/QR code that resolves only to a safe public profile and current verification status;
- priority support queue;
- verified-member networking and early access to selected releases.

Do not promise that identity verification makes an account unhackable. Provide basic security to all users and present Verified+ protections as additional controls and risk-reduction measures.

### Advertisement rules

- Active Verified+ members are excluded from ordinary DCDS display-ad placements in authenticated areas.
- Standard members may be eligible for ads in approved placements.
- Do not target ads using NIN, government-ID data, facial data, biometrics, verification evidence, or other sensitive identity material.
- Never disguise ads as security notices, payment instructions, verification prompts, or system alerts.
- Any future sponsored marketplace listing must be clearly labelled and governed separately from ordinary display advertising.
- Expired/suspended membership entitlements must be recalculated server-side.

## 6A. Verified+ Member Network

**Product specification:** The [Verified+ Member Network specification](dcds-verified-plus-exclusive-network.md) records DCDS-wide signed-in visibility, Verified+ original-publishing privileges, standard-account engagement, audience rules and lifecycle controls.

**Brand and enforcement policy:** The [DCDS Verified+ Brand Content and Enforcement Policy](dcds-verified-plus-brand-content-policy.md) defines allowed DCDS topics, prohibited off-brand/social content, external-link controls, monitoring, strike escalation, restrictions, severe-incident response and appeals.

**Interactive prototype:** [Open the standalone synthetic Verified+ community preview](../verified-plus-community-preview.html). It includes a switch between a Verified+ publisher and a standard/unverified engager. Both roles see the same DCDS member feed; only the Verified+ role can create an original post. The preview remains local and synthetic.

**Moderation administration preview:** [Open the standalone synthetic DCDS Verified+ Moderation Centre](../verified-plus-moderation-preview.html). It is a separate, offline-only interface for moderation roles and human review.

**Server moderation engine:** [Read the Moderation Engine Server Contract](dcds-verified-plus-moderation-engine-contract.md). Pure domain rules and Deno tests cover access gates, content decisions, 180-day strike escalation, moderator delegation, Root-only long-term actions and independent appeals. This code is not wired to an Edge Function or database yet.

**Persistence and RLS design:** [Read the dedicated Verified+ Moderation Persistence and RLS Design](dcds-verified-plus-moderation-persistence-and-rls-design.md). The proposed records are separate from the existing supervised Student Community and remain unimplemented pending schema reconciliation.

The feed is available to all signed-in DCDS accounts. Original publishing is a Verified+ privilege. Standard/unverified accounts may react, comment, reply and reshare an attributed reference card without a caption or external destination. Signed-out visitors receive no feed data.

The official DCDS Verified+ Blue Badge must match the supplied first reference: a bright-blue scalloped rosette with a bold white check centred inside it. Use a large, clear mark on member profiles and profile headers, a medium mark beside names on posts, and a compact mark in comments and member lists. Keep this design blue-and-white; do not add the Creator medal's purple star or ribbons to it. The mark is rendered only when the server-confirmed identity decision is approved and the required Verified+ entitlement is active; the frontend must never infer or grant it from a client-controlled flag.

A separate **Creator** medal/label may be shown for members who identify with or qualify for the DCDS creator role under the applicable profile rules. Its artwork must match the latest approved colour reference: a gold scalloped medal face, a purple centre star and purple ribbon tails. Keep the Creator medal visually distinct from the blue-and-white identity badge. It is not a verification badge, does not prove identity or professional qualification, and grants no membership or moderation privilege by itself.

Member discovery cards and profiles should offer **Follow** and **Message** actions so eligible members can build professional connections. Follow state must respect profile visibility, blocks and privacy settings. Direct messages must be permission-checked, opt-in/contact-controlled, rate-limited, reportable and blockable, and must never expose private contact details. Keep the existing supervised Student Community messaging restrictions unchanged. Do not enable Verified+ direct messaging for minors or unresolved age states; the feature remains gated until age eligibility, safeguarding, privacy and server-side controls are approved. The standalone preview simulates these actions locally only.

The network is a brand-only DCDS learning and professional-development space, not a general social-media wall. All text-bearing surfaces and media must pass the Brand Content and Enforcement Policy. External links are blocked unless the exact DCDS-controlled destination is formally allowlisted. Moderation actions are network-scoped, reason-coded, auditable and appealable. Automated checks may block or hold content, but must not permanently ban an account without human Root Administrator review.

The network remains separate from the existing supervised Student Community. Existing 13–17 and 18+ age-cohort controls, guardian requirements, moderation queues and direct-message restrictions remain in force. Verified+ status does not override age, privacy or safeguarding rules.

A private AI conversation, course record, grade, payment, payout, VTU transaction, identity document, guardian record or private credential must never be imported automatically. The feed may contain only content deliberately submitted and approved for the DCDS-member audience.

The social-network feature requires its own server-side role and entitlement checks, RLS, abuse controls, audit trail and restriction expiry behaviour. Proposed table names remain conceptual only; do not create them until the migration-reconciliation blocker is resolved.

## 7. DCDS TRUSTMARKET

TRUSTMARKET is a separate marketplace domain connected to the Universal Profile and Verified+ entitlement service.

### Roles

- **Buyer:** discovers and requests eligible services.
- **Seller applicant:** Verified+ member who has submitted a provider application.
- **Approved seller:** applicant approved after the separate review.
- **Marketplace moderator/admin:** handles listings, reports and disputes under restricted permissions.

### Seller admission

1. Applicant must have an eligible active Verified+ membership and a successful identity check.
2. Applicant submits seller application and service category.
3. DCDS reviews capability, portfolio, business information and supporting credentials where relevant.
4. DCDS approves, rejects or requests more information.
5. Only approved sellers can publish listings.
6. Seller status remains subject to monitoring, complaints and policy enforcement.

Identity verification does not mean the person is a registered business or qualified professional. Business verification and professional-credential verification must remain separate badges and review processes.

### Marketplace capabilities

- approved service listings and search;
- seller profiles and portfolio links;
- quotation/request workflow;
- order status and activity history;
- secure enquiry/messaging controls;
- transaction-linked reviews only;
- report/block and dispute handling;
- transparent fees, cancellation and refund terms.

Do not launch escrow or hold customer funds in a DCDS-controlled wallet without separate legal, regulatory, payment-provider and operational approval.

## 8. Data model — proposed names only

No tables are created by this document. Names are conceptual and must be reconciled against the production schema and migration history before being adopted.

| Domain | Candidate objects |
|---|---|
| Universal profile | `dcds_universal_profiles`, `dcds_profile_privacy` |
| Identity | `dcds_identity_verification_cases`, `dcds_identity_verification_events` |
| Membership | `dcds_verified_memberships`, `dcds_membership_orders`, `dcds_member_entitlements` |
| Security | `dcds_trusted_devices`, `dcds_security_events`, `dcds_member_sessions` |
| TRUSTMARKET | `dcds_seller_applications`, `dcds_seller_profiles`, `dcds_service_listings`, `dcds_marketplace_orders`, `dcds_marketplace_messages`, `dcds_marketplace_reviews`, `dcds_marketplace_disputes` |
| Administration | `dcds_verification_reviews`, `dcds_trust_admin_audit`, `dcds_feature_registry` |

Each exposed table requires RLS and deliberate grants/policies. Use ownership predicates for member data, reviewer/admin checks for privileged workflows, and server-side payment/provider verification. Keep sensitive verification evidence in a non-public storage area or, preferably, at the verification provider. Audit events should be append-only to application roles.

## 9. Administration and governance

Separate permissions for:

- Root Administrator: platform-wide governance and emergency control;
- Verification Reviewer: review identity exceptions and provider outcomes;
- Membership Administrator: membership support and controlled billing corrections;
- Marketplace Administrator: seller applications, listing moderation and disputes;
- Security Administrator: security incidents, account freezes and risk review;
- Support Administrator: ordinary member support.

No role should automatically inherit Root Administrator authority. Sensitive actions require reason codes and auditable records. No administrator should be able to approve their own identity or seller application.

## 10. Existing-system integration findings

The read-only audit found:

- GitHub repository: `dechampions03-leader/De_Champions_Digital_Service`, default branch `main`.
- Supabase projects: `DCDS-Development` (`tjgsxbmkpvktlqulbktv`) and `dechampions03-leader's Project` (`qxsenflgaweeadvggnyp`). The second is treated as the production candidate based on the existing project history, but the current production deployment mapping must be confirmed before any write.
- Current public table inventory: 81 tables in Development and 94 in the production-candidate project.
- The repository `main` tree contains 48 tracked SQL migration files, but does not contain `supabase/config.toml`.
- Supabase compares migration timestamps, not names. Only 4 of the 48 checked-in timestamps match Development's 54 applied migration records, and only 8 of 48 match the production-candidate project's 80 applied records. Matching names with different timestamps are not exact migration-history matches. **This is a hard blocker for applying new migrations.**
- The repository preserves `supabase/baseline/dcds-production-complete-baseline.sql` (373,633 bytes). Its 2026-11-12 commit message says it is a schema-only baseline used to restore DCDS-Development and contains no production customer rows. Treat it as a historical reference, not as proof of either project's current schema and not as a script to replay on an existing database.
- `supabase/migrations/20261110000100_phase1_security_reliability.sql` is explicitly labelled as a draft in its own contents and says not to apply to production. It includes course-checkout and student-support-ticket changes, not Verified+ features. A GitHub workflow checks for this exact file path, so it must not be moved or deleted casually. Keep it out of any push until its intended status and dependencies are resolved.
- Existing profile-related tables include `profiles`, `dcds_career_profiles`, `dcds_community_profiles`, `dcds_student_projects`, and `dcds_community_credentials`. The legacy `profiles` table uses a bigint primary key and is not directly keyed to `auth.users`; do not retrofit it as the universal profile.
- Student community profiles have cohort/privacy restrictions and age/guardian controls. They are not a substitute for public universal profiles.
- Supabase security advisors report existing RLS-no-policy and SECURITY DEFINER execution findings in both environments. An RLS-enabled table with no policy is generally closed to API roles, but it may also break expected application functionality. SECURITY DEFINER functions callable by authenticated users must be checked individually for internal authorization and execute grants. The production-candidate advisor also warns that leaked-password protection is not enabled.
- Existing payment and VTU systems must remain isolated from the new membership ledger. The current Flutterwave webhook validates the webhook hash and re-verifies the transaction with Flutterwave before further processing; preserve that security pattern. The current course checkout is not a drop-in membership checkout because it is tied to `orders.course_id` and course enrolment.

See [the migration reconciliation report](dcds-migration-reconciliation.md) for the full timestamp comparison and safe recovery plan.

## 11. Implementation phases

1. **Reconciliation gate (blocking):** confirm production project mapping, add/review the missing Supabase CLI configuration, reconcile timestamp history using an isolated Development target, compare the preserved baseline with current schemas, inspect relevant RLS policies and payment functions, and prove a clean local rebuild. Do not run migration repair or database reset against production.
2. **Universal profile:** add profile model, unique usernames, privacy settings and a migration/backfill plan without changing legacy records.
3. **Identity verification:** select an authorised vendor, complete privacy/DPIA and data-retention work, then implement provider adapter and reviewer console.
4. **Verified+ membership:** the provider-neutral Flutterwave V3 adapter and mocked contract tests are present in the feature branch. Next, reconcile the database migration baseline, add the dedicated membership order/subscription persistence, integrate the adapter through separate Development Edge Functions and webhook handling, complete live Test-mode verification, then qualify the approved Monthly, Annual and Five-Year plans, explicit opt-in consent, self-service cancellation, idempotent renewals and paid-through expiry handling.
5. **Verified+ experience:** ad suppression, privacy centre, account guardian and advanced profile capabilities.
6. **TRUSTMARKET admission:** seller application/review first, then listings, orders, reviews and dispute processes.
7. **Release gates:** development integration tests, RLS and authorization tests, payment/webhook replay tests, privacy/security review, staging acceptance and explicit production release approval.

## 12. Open decisions before public launch

- Confirm the intended minimum age for government-ID and biometric verification. Recommended launch gate: adults 18+ only; preserve existing age-appropriate DCDS experiences for younger members.
- Select and contract an authorised identity-verification provider for Nigerian and international routes.
- Confirm whether the public Blue Badge is hidden immediately on Monthly, Annual or Five-Year expiry while the historical identity-verification record remains.
- Complete sandbox verification of the Monthly (every 30 days), Annual (every one year) and Five-Year (every five years) recurring intervals, cancellation endpoint and provider webhook lifecycle. Members must be able to cancel without administrator approval while retaining the paid-through term. Refund and chargeback terms still require separate approval. The Five-Year term must end at 60 months; lifetime membership remains unavailable.
- Decide whether unverified members may browse TRUSTMARKET and act as buyers; seller admission remains Verified+ plus separate approval.
- Define international display prices and payment currencies after provider and tax costs are known.
- Confirm the production Supabase project and reconcile migration history before preparing any migration.

## 13. Pricing sustainability guardrail

The approved NGN prices are product decisions, not proof that the service is profitable. Before public checkout is enabled, DCDS must prepare a cost forecast covering identity-provider charges (funded by the separate applicant fee), payment processing and tax, hosting, security, moderation, customer support, operational labour and a contingency reserve. Review actual costs and renewal/retention data at least quarterly. Do not promise fixed prices internationally until currency, tax and provider costs are confirmed.

## 14. Non-goals for the initial release

- No internal wallet or escrow.
- No automatic seller approval from a Blue Badge.
- No public display or advertising use of identity evidence.
- No separate DCDS account per service.
- No changes to existing course balances, student records, payout records, VTU orders, production secrets, or current production functions as part of the architecture baseline.
