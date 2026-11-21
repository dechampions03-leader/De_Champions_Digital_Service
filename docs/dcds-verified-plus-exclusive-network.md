# DCDS Verified+ Member Network — Product and Access Specification

**Status:** Product requirement recorded; implementation pending  
**Date:** 2026-11-21  
**Target branch:** `feature/dcds-verified-plus-ecosystem`  
**Production impact:** None. This document does not create or alter database objects, payment settings, secrets, or deployments.

## 1. Product intent

Verified+ should feel like a genuine DCDS professional and learning network, with exclusive original-publishing privileges for eligible members and useful feed access for the wider signed-in DCDS community.

Eligible active members should be able to discover the approved content shared into the network, publish their own posts, express themselves with reactions, join conversations, comment, reply, and share/repost content within the network. The experience should be unified across supported DCDS surfaces rather than fragmented into unrelated mini-communities.

The exclusive network is an additional layer. It must not replace the DCDS Academy, existing student learning discussions, supervised Student Community, or private account areas.

## 2. Access terminology — do not confuse the two systems

DCDS has separate forms of access which must remain separate:

### A. Approved Student Community access

The existing Student Community uses its own age-band and moderation approval model. Approved students participate under its current rules:

- 13–17 and 18+ cohorts remain separate.
- Teen posts, comments, replies and positive reactions remain subject to the required moderation and guardian/safety controls.
- Under-13 accounts do not receive social chat/call access.
- Current no-direct-message, no-user-created-private-room, approved-link and supervised-session rules remain in force.
- Ordinary student-community approval does not grant Verified+ membership or access to the adults-only features of a paid membership.

Do not weaken or replace the existing student safety specification.

### B. Verified+ Exclusive Network access

The new Verified+ network requires both:
1. a trusted DCDS identity decision that satisfies the launch eligibility rules; and
2. an active Verified+ membership entitlement (monthly or lifetime).

Payment alone does not grant identity verification. Identity verification alone does not grant an active paid membership. A normal student/community approval does not satisfy either condition automatically.

The final minimum age and the relationship between minors' existing student-community access and any paid Verified+ social features remain a launch decision. Do not silently enrol minors into an adult identity-verification or paid social product. Until that policy is formally approved, keep Verified+ social activation age-gated and disabled for accounts whose eligibility is unresolved.

## 3. Network visibility and publishing permissions

Default audience for approved Verified+ network content: **all signed-in DCDS accounts**, including Verified+ members and standard/unverified accounts. Signed-out visitors do not receive the feed.

- Only a server-confirmed account with approved identity eligibility and an active Verified+ membership may create original posts.
- All signed-in DCDS accounts may view approved network posts, regardless of Verified+ status.
- Standard/unverified accounts may react, comment, reply and reshare an existing item inside DCDS. A reshare is an attributed reference card only: no added caption, new media, external destination or audience expansion.
- Standard/unverified accounts may not create original posts, upload original post media, or add new authored commentary through a repost.
- Suspended or restricted accounts lose the interactions specified by the restriction; hiding a button in the frontend is never the security control.
- No guest/anonymous feed access is included. A general Verified+ introduction or upgrade page may be public, but it must not expose feed bodies, private media, comments or member-only notifications.
- The backend must enforce role and entitlement rules independently of the UI. Never trust client-submitted verification, membership, role, owner or moderation flags.
- Respect blocks, mutes, removals and each item's approved audience for every account state.

Verified+ is therefore the exclusive **publishing privilege**, not an exclusive audience. The feed is available to the wider signed-in DCDS membership so standard members can learn from and engage with approved work.

## 4. Unified network feed — supported content

Provide one Verified+ feed that can collect items deliberately published or shared to the network from supported DCDS surfaces.

Potential shareable item types include:
- a member's Verified+ post;
- an approved portfolio or creative-showcase item that its owner explicitly shares to the network;
- a member-selected course achievement or learning milestone that is safe to disclose;
- a member-selected professional update or service announcement;
- an official DCDS announcement or featured item, where DCDS has enabled appropriate engagement.

The originating feature remains the source of truth for its underlying record. The feed stores a safe reference and presentation snapshot as needed; it must not duplicate an entire student record or private document.

Do not automatically ingest or publish:
- private AI conversations, private learning memory or uploaded AI content;
- grades, assessment answers, assignment feedback, attendance, certificates not designated shareable, payment records, balances, payout records or VTU transactions;
- private messages, private profiles, guardian details, age evidence, identity evidence or verification provider payloads;
- private credentials, document uploads, contact details, or administrator-only records.

A user may choose to publish a safe excerpt or a DCDS-controlled internal link to a supported item. External links are blocked unless the exact destination has been formally allowlisted. Before publishing, show the audience and a preview of exactly what will be visible. Never convert a private item into a network item by default.

## 5. Publishing and social interactions

### Original posts

Only an eligible active Verified+ member may create an original post. The post must comply with the [Brand Content and Enforcement Policy](dcds-verified-plus-brand-content-policy.md). The composer is unavailable to standard/unverified accounts.

A new post must:
- concern DCDS-supported learning, digital skills, creative work, projects, professional development, DCDS services or official DCDS activities;
- use an approved media format and safety checks;
- display the audience as "DCDS members" and remain visible only to authenticated accounts;
- pass server-side topic, link, spam and safety checks before publication;
- contain no external URL or off-platform social/contact invitation unless the exact DCDS-controlled destination has been formally allowlisted.

### Viewing and engagement by all signed-in accounts

Both Verified+ and standard/unverified DCDS accounts can view approved feed posts, react, comment and reply. They can also reshare an existing item inside DCDS as an attributed reference card only; a standard account cannot add a caption, new media or external link to the reshare. Every text-bearing interaction is subject to the same brand-content and safety rules as an original post.

### Emoji reactions

Support a reaction picker with common expressive emoji, including examples such as:
- 👍 ❤️ 💖
- 😂 😭 😘 😀
- 🤔 😉 and other supported emoji.

A signed-in account may add, change or remove its reaction while permitted to engage. A member may have one active reaction per content item at a time; changing the emoji updates that reaction rather than creating unlimited duplicate records. Display aggregate counts and, only where appropriate, the members who reacted. Reactions must obey the item's audience, block rules, restrictions and cohort policies.

### Comments and replies

Support comments and threaded replies by both Verified+ and standard/unverified signed-in accounts. Comments, replies and edits must pass topic, link, spam and safety checks. Provide edit/delete controls for the author within a defined policy window, report controls for members, and moderation actions for authorised moderators. Preserve edit/moderation audit history without exposing deleted or pending content to unauthorised readers.

The existing supervised 13–17 student-community moderation rules remain unchanged. Do not route teen comments into an adult Verified+ feed unless the final age policy expressly permits that account state.

### Reshare

Support in-network reshares by permitted accounts using an attributed reference card only.

- A reshare never creates a new original post and never expands the original audience.
- Standard/unverified accounts cannot add a caption, commentary, extra media or external destination.
- No public/external sharing is available in the initial release.
- A DCDS-member feed item remains limited to signed-in DCDS accounts when reshared.
- When an original item is deleted, withdrawn or restricted, derived reshares must stop revealing its content.

Direct messaging is not included by this specification. Existing Student Community direct-message restrictions remain in force.

## 6. Content ownership, privacy and audience lifecycle

- The member owns their original post subject to DCDS platform terms and applicable law.
- The default network audience is all signed-in DCDS accounts. A post is not visible to signed-out visitors. Never expose the private source record or fields outside the explicitly selected, approved excerpt.
- Make the audience visible on every post and share card.
- Never reveal a private member's email address, phone number, home address, legal name or identity evidence through a post, profile preview, API response or interaction list.
- Respect block and mute rules across feed retrieval, search, comments, replies, reactions, reposts and notifications.
- When an author deletes a post or withdraws sharing permission, remove it from network feeds and stop derived shares from displaying its content.
- Keep only the minimal audit/retention record required by the approved policy; do not retain removed media as a publicly reachable object.
- Offer reporting, moderation review, account restrictions and appeals with reason-coded audit events.

## 7. Expiry, suspension and revocation

When a monthly Verified+ membership expires or an entitlement is suspended:
- immediately block new original publishing and other Verified+-only privileges. General DCDS feed viewing/engagement remains available only where account status and any restriction permit it;
- do not delete the member's original content or history merely because membership expired;
- preserve ownership and the member's access to lawful account/data export and support paths;
- keep existing network content available to signed-in DCDS accounts while the author's account and the item remain eligible; keep source records and private data hidden;
- provide a clear renewal/reactivation experience.

When identity verification is suspended or revoked for a security or policy reason, recalculate dependent entitlements server-side and apply the relevant access restriction. Preserve the decision and audit history. Do not silently change payment, wallet, payout, course-enrolment or VTU records.

The final policy for access to a member's own historic posts after expiry must be decided before launch. Expiry removes original publishing privileges; feed viewing/engagement follows account status and network restrictions.

## 8. Brand-only moderation, integrity and anti-abuse

The network is not a general social-media space. All posts, comments, replies, reshares, media captions and content displayed in the network must be directly connected to DCDS learning, digital skills, creative work, professional development, DCDS services or official DCDS activities.

The [DCDS Verified+ Brand Content and Enforcement Policy](dcds-verified-plus-brand-content-policy.md) defines approved topics, prohibited social/lifestyle promotion, strict external-link rules, pre-publication monitoring, moderator workflow, strike ladder, restrictions, severe-incident response, appeals and audit requirements.

The [Moderation Engine Server Contract](dcds-verified-plus-moderation-engine-contract.md) specifies the provider-neutral domain layer and its server-authoritative access, content, strike and administrator permission checks. The pure domain module and synthetic tests are prepared; persistent cases and live request handlers remain blocked pending migration reconciliation.

The [Moderation Persistence and RLS Design](dcds-verified-plus-moderation-persistence-and-rls-design.md) maps proposed Verified+ content, reports, cases, strikes, restrictions, appeals and audit records to dedicated access policies. It deliberately keeps the existing room/cohort Student Community moderation domain separate.

Core controls:
- reject or hide off-brand content and unapproved external links before they become visible;
- apply topic, spam, harassment, impersonation, scam, malicious-link and media checks to posts, comments, replies and reshares;
- provide member block, mute and report controls;
- enforce content and account rate limits server-side;
- hold ambiguous content for human review rather than silently publishing it;
- apply transparent, reason-coded strikes and progressive network-only restrictions;
- require human review for long-term/permanent action; an automated classifier must never impose a permanent ban;
- preserve role separation, least-privilege moderation and append-only audit events;
- provide a clear 14-day appeal route;
- do not inspect private AI conversations, student records, identity documents, payment records, balances, payouts or VTU activity to moderate network posts;
- never allow a Verified+ badge or paid entitlement to exempt a member from moderation.

The policy's restrictions apply to the Verified+ network surface and must not silently change course access, membership billing, identity status, wallet balances, payout records, VTU orders or existing Student Community permissions.

## 9. Suggested domain boundaries — not approved schema

Names below are conceptual only. They are not instructions to create tables and must be reconciled against the current database and migration history first.

Possible domain objects:
- `dcds_verified_feed_items` — references to shareable source items;
- `dcds_verified_posts` — original member-authored posts;
- `dcds_verified_post_media` — private media metadata and ownership;
- `dcds_verified_comments` — comments and parent reply references;
- `dcds_verified_reactions` — one active reaction per member/item;
- `dcds_verified_reposts` — attributed in-network shares;
- `dcds_verified_bookmarks` — private member saves;
- `dcds_verified_follows` — member follow relationships;
- `dcds_verified_reports` — member reports;
- `dcds_verified_moderation_actions` — restricted moderation audit;
- `dcds_verified_feature_entitlements` — server-computed access only if not already provided by the central entitlement service.

Do not create a separate account system or a separate profile for this network. Reuse the approved universal identity and central entitlement service when it is implemented.

Every exposed table requires deliberate RLS, grants and indexes. Policies must validate the current user's identity, active entitlement, content audience, ownership, block relationship and moderation state as appropriate. Never trust a client-submitted `is_verified`, `membership_active`, role, owner ID or audience override.

## 10. Implementation and release gates

1. Confirm final age eligibility and relationship to the existing 13–17 and 18+ student community.
2. Finish Supabase migration reconciliation; the existing blocker remains. Do not use the network specification to justify a migration push or repair.
3. Review existing student community schemas, policies and moderation behaviour before choosing any reusable component.
4. Build a front-end-only feed prototype using synthetic content and disabled feature flags.
5. Build synthetic tests for entitlement denial, audience isolation, blocks, delete/withdrawal propagation, comment/reaction rate limits, moderation and expired membership.
6. Design database changes only after the schema baseline is reconciled and access policies have been reviewed.
7. Complete Development-only integration and age-cohort safety tests.
8. Obtain privacy/security approval and explicit production release approval before deployment or public activation.

## 10A. Synthetic UI prototype

A standalone [Verified+ community preview](../verified-plus-community-preview.html) has been added on the feature branch. It demonstrates the signed-in DCDS-wide feed, a role switch between Verified+ publisher and standard/unverified engager, a gated post composer, emoji reactions, comments, replies and attributed in-network reshares.

The preview is static and self-contained. It does not call an API, connect to Supabase, read an authenticated account, persist state, or send content outside the browser page. All changes disappear when the page is reloaded. It is not linked from the live homepage and is not a production feature.

A GitHub Actions check validates that these boundaries remain true and that the existing teen-community safety rules remain present.

## 11. Acceptance criteria

The exclusive network is not ready until all of the following are demonstrated:

- An active eligible Verified+ member can see the feed items approved for the Verified+ audience.
- A signed-out visitor cannot retrieve feed bodies, comments, media or notifications through UI, APIs, search or direct URLs. Standard signed-in accounts can retrieve only content approved for the DCDS member audience.
- Active Verified+ members can publish original posts. Standard/unverified signed-in accounts can view, react, comment, reply and reshare attributed cards without captions. All interactions remain inside the signed-in DCDS audience.
- Changing or deleting a source item cannot leave an accessible stale copy or widened repost.
- Blocks, mutes, reports, moderation and rate limits apply consistently across every interaction.
- Expired/suspended/revoked members cannot continue member-only access or interaction using stale sessions or client-side state.
- Private AI conversations, student records, grades, identity documents, payment information and guardian data never appear in the feed by default.
- Existing supervised teen-community controls remain intact.
- All permissions are enforced server-side and tested with distinct account roles and membership states.

**Current result:** The DCDS-wide viewing/engagement model, Verified+ original-publishing privilege and strict brand-only enforcement policy are specified. The static role-switch preview is illustrative only; no database tables, moderation engine, feed endpoints, access policies or production behaviour have been enabled.
