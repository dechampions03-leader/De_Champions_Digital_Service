# DCDS Student Community & Professional Network

**Release state:** Development implementation / preview only. Not approved for public launch.

## Confirmed product decisions

- Separate age cohorts: 13–17 and 18+.
- Group messages only. No student-to-student direct messaging, private inboxes, or user-created private rooms.
- Live group sessions are scheduled and hosted by authorised DCDS administrators.
- Under-13 accounts are not eligible for social-community chat or calls.
- Existing course discussions remain the place for course-specific academic questions; the new network is the supervised cross-course community.

## Age and access gate

Community access is a separate approval from ordinary student registration and from AI usage.

1. A student must have a confirmed, non-anonymous DCDS account.
2. The student submits a separate community age-band request. Only 13–17 and 18+ are accepted; no under-13 social account is possible.
3. A 13–17 student nominates a separately verified adult DCDS account as guardian. The guardian must explicitly approve the community consent request through their own account.
4. A DCDS administrator performs age assurance and records a private evidence reference. The database will not store a full date of birth or identity-document image.
5. A teen age request cannot be approved until guardian consent is verified. An adult request must be an 18+ declaration and does not require a guardian.
6. A DCDS administrator must separately approve the community-access request after the age review is verified.
7. The database derives the cohort from the independently reviewed community age request; a client cannot choose or edit its own cohort.
8. Access suspension immediately suspends the user's room memberships.
9. The community age process is separate from AI eligibility; an AI access restriction or approval does not grant social-community access.

No full date of birth, gender, home address, identity number, or identity-document image is added to the community profile.

## Cohorts and content controls

### 13–17

- Teen-only rooms; no adult student memberships.
- Every student message is saved as pending until an authorised moderator publishes it.
- Project-showcase posts and image attachments require moderation before classmates can see them.
- No external URLs in chat messages.
- Teen live sessions require two distinct authorised DCDS administrators (host and co-host).
- No one-to-one calls, direct messages, call recording, or cross-cohort room.
- No live meeting link is shown until the student is registered for that scheduled session.

### 18+

- Adult-only rooms; no teen student memberships.
- Group text chat is visible after server-side checks and rate limits.
- Posts and image attachments are moderated before they are visible.
- External links are not allowed in chat; students use approved project-sharing surfaces.
- Live sessions are scheduled and administrator-hosted; join links are visible only to registered participants.
- Recording remains disabled.

## Professional identity and documents

- Community profiles are visible only to the same approved age cohort after DCDS review.
- Profile display name, headline, biography, skills, interests and a profile picture are supported.
- Date of birth, gender, email, phone number, home address and government ID are not collected for public profiles.
- Profile visibility defaults to private. A student can request cohort visibility; DCDS must approve it.
- Academic/professional credential files use a separate private bucket and are visible only to their owner and authorised DCDS administrators.
- Government identity documents, bank statements, passwords, OTPs and payment details must not be uploaded as professional credentials.
- Files are limited to supported image/PDF MIME types and size limits. These controls do not constitute malware scanning; suspicious documents must not be opened on an administrator's primary device.

## Group-chat safeguards

- No direct messages or student-created private rooms.
- Server-side RLS enforces room membership and age cohort.
- Message length and per-account rate limits are enforced server-side.
- Chat links are blocked to reduce phishing, payment scams and off-platform solicitation.
- Students can report messages/posts and block another member in a shared room.
- Blocks hide that member's content from the blocker; they do not replace reporting.
- Moderators can publish, hide or remove messages/posts and suspend community access.
- Reports and moderation actions are private to the reporter and authorised administrators.
- Moderation actions are recorded in an audit table.
- No online-presence indicator, typing indicator, or read receipt is enabled; these would reveal student activity patterns unnecessarily.

## Live group sessions

- Only authorised DCDS administrators can schedule sessions.
- A room's age cohort determines who can see the event.
- Teen events require two distinct authorised DCDS administrators.
- Join links are stored separately from event details and are visible only to registered members and administrators.
- Recording is disabled at database level.
- DCDS uses an external meeting provider link supplied by the administrator; this release does not provide its own video-conferencing infrastructure.
- The administrator must configure the provider's waiting room, participant permissions, screen-sharing restrictions and privacy settings before sending the link.

## Moderation operating procedure required before launch

The technical queue is not a substitute for a staffed safeguarding operation. Before public launch, DCDS must document:

1. Named primary community moderator and backup.
2. Who is permitted to moderate teen spaces and how conflicts of interest are escalated.
3. Published coverage hours and a realistic response target for routine reports.
4. Immediate escalation route for credible threats, grooming, exploitation, self-harm disclosures, extortion or suspected child sexual abuse material.
5. A safe procedure for preserving evidence without copying or redistributing illegal material.
6. A suspension/appeal process and an audit review schedule.
7. A retention and deletion schedule for messages, reports, credentials, uploaded files and moderation records.
8. A tested parent/guardian contact and escalation procedure for teen accounts.
9. A provider review for any external meeting service used with minors.

DCDS should obtain an appropriate legal/privacy review for the countries in which it accepts learners before enabling minors' social features.

## Launch gates

- [ ] Development RLS and storage-policy tests pass.
- [ ] Independent community age-band and guardian-consent flow is tested; it does not depend on AI access eligibility.
- [ ] Cross-cohort read/write attempts fail.
- [ ] Under-13 access attempts fail.
- [ ] Teen messages remain pending until moderator approval.
- [ ] Students cannot publish profile visibility without review.
- [ ] Credential files are private and not visible to other students.
- [ ] Reports, blocks, message removal and account suspension work.
- [ ] Teen live sessions cannot be scheduled without two distinct authorised administrators.
- [ ] Registered-only meeting-link access is tested.
- [ ] Account deletion and retention behavior are tested.
- [ ] Moderation staffing, incident response and retention procedures are approved.
- [ ] Privacy policy and community terms are reviewed and published.
- [ ] Real student/admin device tests pass.

**No production release should occur while any launch gate remains incomplete.**
