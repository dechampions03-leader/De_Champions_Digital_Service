# DCDS Community Network — Data Map

| Data | Stored in | Who can read it |
|---|---|---|
| Community age cohort and active/suspended status | `dcds_community_access` | Owner and DCDS administrators; same-cohort lookup is exposed only as a boolean helper |
| Community access request | `dcds_community_access_requests` | Requesting student and DCDS administrators |
| Room memberships | `dcds_community_memberships` | Student sees own memberships; DCDS administrators manage them |
| Versioned community-rules acceptance | `dcds_community_rule_acceptances` | Student and DCDS administrators |
| Lounge comments/replies | `dcds_community_post_replies` | Author, DCDS administrators, and same-room members after approval, subject to blocks |
| Positive Lounge reactions | `dcds_community_post_reactions` | DCDS administrators and members of the same age-cohort room |
| Profile display name, bio, skills, interests | `dcds_community_profiles` | Owner, DCDS administrators, and same-cohort students only after profile approval |
| Profile picture | Private `dcds-community-avatars` bucket | Owner, DCDS administrators, and same-cohort students when profile is approved |
| Credential metadata and files | `dcds_community_credentials` and private `dcds-community-credentials` bucket | Owner and authorised DCDS administrators only |
| Group messages | `dcds_community_messages` | Members of the same age-cohort room, author for own pending message, and DCDS administrators |
| Project/showcase posts | `dcds_community_posts` and private `dcds-community-posts` bucket | Author, same-room members after approval, and DCDS administrators |
| Block list | `dcds_community_blocks` | Blocking student only |
| Reports | `dcds_community_reports` | Reporting student and DCDS administrators |
| Moderation audit | `dcds_community_moderation_actions` | DCDS administrators only |
| Scheduled sessions | `dcds_community_live_sessions` | Room members of the same cohort and DCDS administrators |
| Join links | `dcds_community_live_session_links` | Registered participants and DCDS administrators only |
| Registration | `dcds_community_live_registrations` | Student sees own registration; DCDS administrators manage all |

## Not collected in community profiles

Date of birth, exact age, gender, email address, telephone number, home address, government ID number, passport, bank details and payment credentials.

## Storage constraints

- Avatars: private bucket, JPEG/PNG/WebP, 3 MB maximum.
- Posts: private bucket, JPEG/PNG/WebP, 5 MB maximum.
- Credentials: private bucket, PDF/JPEG/PNG, 8 MB maximum.
- Chat messages do not accept file attachments or external URLs.
- Supabase Storage MIME/size checks are not malware scanning. Admin review and safe handling remain necessary.
