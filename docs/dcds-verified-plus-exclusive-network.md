# DCDS Verified+ Exclusive Network — Product and Access Specification

**Status:** Product requirement recorded; implementation pending  
**Date:** 2026-11-21  
**Target branch:** `feature/dcds-verified-plus-ecosystem`  
**Production impact:** None. This document does not create or alter database objects, payment settings, secrets, or deployments.

## 1. Product intent

Verified+ should feel like a genuine members-only social and professional network inside DCDS, not merely a badge next to a profile name.

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

## 3. Exclusive visibility and membership rules

Default network audience: **active, eligible Verified+ members only**.

- Only active, eligible Verified+ members may open the Verified+ feed, discover network-only posts, publish, comment, reply, react, repost, follow, or use member-only sharing.
- A non-member may see a general Verified+ introduction/upgrade page, but must not receive feed data, post bodies, private media URLs, member lists, reaction identities, comments, or member-only notifications from a hidden feed.
- The frontend may hide unavailable controls for clarity, but the server and database policies must independently enforce every entitlement.
- Do not expose restricted content through search, public profile endpoints, metadata previews, APIs, cached responses, page source, or guessable storage URLs.
- DCDS administrators and moderators receive only the specific moderation access granted by their roles. A moderator is not automatically a Verified+ member and does not inherit Root Administrator authority.
- A member's privacy settings and content audience apply even inside the exclusive network. Membership does not override blocks, reports, private-profile settings, or a member's choice not to share an item.

An active membership is not permission to see everything stored anywhere in DCDS. "All network content" means content that is approved for the Verified+ network audience, not another member's private account information or restricted student records.

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

A user may choose to publish a safe excerpt or a link to a supported item. Before publishing, show the audience and a preview of exactly what will be visible. Never convert a private item into a public/network item by default.

## 5. Member publishing and social interactions

### Posts

Active eligible members may create a post with:
- text and supported formatting;
- approved images/media under file size, MIME and safety controls;
- an optional link only where the relevant posting surface permits links;
- an optional reference to a supported DCDS project/showcase or professional update;
- a clear audience label.

The initial network default is "Verified+ members". A post must not become publicly shareable unless the author deliberately chooses a public audience and the content type is allowed to be public. Keep moderation and review states server-controlled.

### Emoji reactions

Support a reaction picker with common expressive emoji, including examples such as:
- 👍 ❤️ 💖
- 😂 😭 😘 😀
- 🤔 😉 and other supported emoji.

Members may add, change or remove their reaction. A member may have one active reaction per content item at a time; changing the emoji updates that reaction rather than creating unlimited duplicate records. Display aggregate counts and, only where appropriate, the members who reacted. Reactions must obey the item's audience, block rules and cohort restrictions.

### Comments and replies

Support comments and threaded replies on eligible posts and shareable items. Provide edit/delete controls for the author within a defined policy window, report controls for members, and moderation actions for authorised moderators. Preserve edit/moderation audit history without exposing deleted or pending content to unauthorised readers.

The existing supervised 13–17 student-community moderation rules remain unchanged. Do not route teen comments into an adult Verified+ feed.

### Share and repost

Support in-network sharing/reposting with attribution to the original author and a link to the original item, provided the original author has not deleted, withdrawn, restricted or blocked the item.

- In-network sharing is the default.
- Sharing must never expand the original audience.
- A members-only post stays members-only when reshared.
- External share links are disabled by default for members-only content.
- An external share is permitted only when the author explicitly makes an eligible item public and the system confirms that no private student, course, identity or account data is included.
- When an original item is deleted or its audience is narrowed, derived shares must stop revealing the removed/restricted content.

### Additional network interactions

The architecture may support bookmarking/saving, following, mentions, notifications and feed filters. Each must be entitlement-checked and respect member blocks, privacy settings and rate limits. Direct messaging is not included by this specification; the existing student-community prohibition on student-to-student direct messages remains in force.

## 6. Content ownership, privacy and audience lifecycle

- The member owns their original post subject to DCDS platform terms and applicable law.
- Private-by-default network visibility is the starting point.
- Make the audience visible on every post and share card.
- Never reveal a private member's email address, phone number, home address, legal name or identity evidence through a post, profile preview, API response or interaction list.
- Respect block and mute rules across feed retrieval, search, comments, replies, reactions, reposts and notifications.
- When an author deletes a post or withdraws sharing permission, remove it from network feeds and stop derived shares from displaying its content.
- Keep only the minimal audit/retention record required by the approved policy; do not retain removed media as a publicly reachable object.
- Offer reporting, moderation review, account restrictions and appeals with reason-coded audit events.

## 7. Expiry, suspension and revocation

When a monthly Verified+ membership expires or an entitlement is suspended:
- immediately block new publishing, commenting, replies, reactions, reposting, following and member-only feed access;
- do not delete the member's original content or history merely because membership expired;
- preserve ownership and the member's access to lawful account/data export and support paths;
- keep existing content hidden from non-members unless the author had separately and validly made it public;
- provide a clear renewal/reactivation experience.

When identity verification is suspended or revoked for a security or policy reason, recalculate dependent entitlements server-side and apply the relevant access restriction. Preserve the decision and audit history. Do not silently change payment, wallet, payout, course-enrolment or VTU records.

The final policy for read-only access to a member's own historic posts after expiry must be decided before launch. It must not grant access to the active members-only feed.

## 8. Moderation, integrity and anti-abuse

The network requires:
- member block, mute and report controls;
- spam, harassment, impersonation, threat, scam and malicious-link handling;
- content and account rate limits enforced server-side;
- media MIME/size checks and a separate malware-safety process;
- moderation queues and reason-coded actions;
- moderator role separation and least-privilege access;
- append-only audit events for sensitive moderation and administrative decisions;
- a clear appeal/support route;
- automated safeguards against reaction/comment spam and artificial engagement.

Verified+ status is not a guarantee that a member is harmless, honest, professionally qualified or immune from moderation. The Blue Badge must never exempt a member from community standards.

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

A standalone [Verified+ community preview](../verified-plus-community-preview.html) has been added on the feature branch. It demonstrates a fictional members-only feed, post composer, emoji reactions, comments, replies, member filters, and attributed in-network reshares.

The preview is static and self-contained. It does not call an API, connect to Supabase, read an authenticated account, persist state, or send content outside the browser page. All changes disappear when the page is reloaded. It is not linked from the live homepage and is not a production feature.

A GitHub Actions check validates that these boundaries remain true and that the existing teen-community safety rules remain present.

## 11. Acceptance criteria

The exclusive network is not ready until all of the following are demonstrated:

- An active eligible Verified+ member can see the feed items approved for the Verified+ audience.
- A non-member cannot retrieve the feed, post bodies, comments, media, reaction identities, member lists or private notifications through UI, APIs, search or direct URLs.
- Members can create eligible posts, react with emoji, comment, reply, and share/repost within the original audience.
- Changing or deleting a source item cannot leave an accessible stale copy or widened repost.
- Blocks, mutes, reports, moderation and rate limits apply consistently across every interaction.
- Expired/suspended/revoked members cannot continue member-only access or interaction using stale sessions or client-side state.
- Private AI conversations, student records, grades, identity documents, payment information and guardian data never appear in the feed by default.
- Existing supervised teen-community controls remain intact.
- All permissions are enforced server-side and tested with distinct account roles and membership states.

**Current result:** The exclusive Verified+ social experience is now specified, but no database tables, feed endpoints, UI, access policies or production behaviour have been implemented by this document.
