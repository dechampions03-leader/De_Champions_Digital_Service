# DCDS account-deletion operations runbook

Internal operational guide for authorised DCDS administrators. This document is not a substitute for legal advice. It describes the database relationships reviewed in the DCDS Supabase project as of 12 November 2026.

## Safety principles

1. A user request is not proof that every related record has been erased.
2. The account-deletion request table intentionally has no foreign key to Supabase Auth. The request audit record must survive deletion of the login identity.
3. The current public schema has no foreign-key constraints directly referencing `auth.users`. Deleting a Supabase Auth user therefore does **not** automatically cascade through DCDS public tables.
4. Do not delete paid orders, payment evidence, course enrolments, reward ledger entries, payout requests, transfer identifiers or compliance/audit records merely to make a deletion request appear complete.
5. Delete or anonymise personal data that is no longer needed. Retain only data with a valid legal, financial, security or claims-related reason, restrict access to retained records, and document the reason.
6. Never perform a deletion test on a live customer or administrator account. Use a dedicated test identity and synthetic transactions.

## Request workflow

### 1. Verify the request

- Confirm the request belongs to the signed-in DCDS account and the email or mobile method has been verified.
- Review the user's current request status and any pending payment, receipt review, refund, support or payout work.
- Check whether the account has administrator privileges. Student deletion is blocked for identities in `dcds_admins` or legacy `admin_users`; administrator offboarding is a separate owner-controlled procedure.
- Use the requester's verified contact channel for any follow-up. Never request a password, one-time code, card PIN or CVV.

### 2. Inventory personal information

Use the authenticated user UUID as the primary search key. The production schema reviewed contains user-linked identifiers in these tables:

- Learning and identity: `assignment_submissions.user_id`, `certificates.user_id`, `enrollments.user_id`, `lesson_progress.user_id`, `quiz_attempts.user_id`, `student_support_tickets.user_id`, `student_reviews.student_id`, `dcds_reviews.user_id`, `dcds_student_contact_numbers.user_id`, `notification_recipients.user_id`.
- Orders and payments: `orders.user_id`, `payments.user_id`, `dcds_payment_receipt_reviews.created_by`, `dcds_payment_receipt_reviews.reviewed_by`.
- Referral and reward: `dcds_ambassadors.user_id`, `dcds_referrals.referred_user_id`, `dcds_reward_ledger.referred_user_id`, `dcds_reward_ledger.ambassador_user_id`, `dcds_reward_events.ambassador_user_id`.
- Payouts: `dcds_payout_accounts.user_id`, `dcds_payout_requests.user_id`, `dcds_payout_events.user_id`, `dcds_international_payout_accounts.user_id`, `dcds_international_payout_beneficiary_events.user_id`, `dcds_international_payout_events.user_id`, `dcds_international_payout_quotes.user_id`, `dcds_international_payout_requests.user_id`.
- Administrative attribution and records: `student_admin_audit.student_id`, `student_admin_notes.student_id`, `student_admin_audit.admin_id`, `student_admin_notes.created_by`, plus creator/updater attribution in `assignments`, `quizzes`, `notifications`, `public_announcements` and `course_regional_prices`.

The schema also includes legacy `profiles` records with email/phone fields and a numeric primary key rather than a direct Auth UUID. Search those records by verified email/phone only as part of the authorised inventory; do not assume that every matching name is the same person.

The list above is a starting inventory. Review current schema, storage buckets, logs and provider integrations again at the time of each deletion because new features may introduce additional personal-data locations.

### 3. Resolve learning and public-content records

- Check assignment submissions and feedback, quiz answers/attempts, lesson progress, certificates, student reviews, support tickets, profile/contact details and notifications.
- Delete or anonymise user-generated or displayable personal content where it is no longer needed.
- Keep course completion or certificate verification records only where a justified operational or legal need exists. Remove unnecessary contact fields from retained snapshots where possible.
- Review related storage objects (including receipts and assignment uploads) using the actual storage buckets and object ownership paths. The table inventory alone does not reveal every stored file.

### 4. Resolve financial and referral records

- Reconcile all orders, payments, receipt reviews and refunds. Do not remove a record while a transaction, dispute, refund or chargeback is unresolved.
- Review ambassador/referral attribution, reward ledger, payout accounts, payout requests, payout events, international beneficiary details, provider transfer identifiers and webhook/audit events.
- Preserve the minimal financial and audit linkage that DCDS must or may retain. Anonymise unrelated profile/contact fields when permitted; do not break foreign keys or remove evidence needed to explain an issued reward or completed transfer.
- Confirm encrypted beneficiary payloads are no longer required for an open or completed payout. Remove or cryptographically render unnecessary beneficiary data unusable only after payout reconciliation and legal review.

### 5. Review external processors and access

- Identify information held by Supabase, Flutterwave and any relevant storage or course-content provider for this user.
- Where provider-side deletion is required and supported, submit and record the request through the provider's authorised channel.
- Revoke access or sessions as part of the approved offboarding procedure. Do not remove unrelated DCDS shared course content or another person's records.

### 6. Complete the request

Only after the inventory and data-handling work above is verified:

- Set status to `approved_for_deletion` with an evidence note.
- In the final admin action, attest all four items: personal data reviewed, learning records handled, financial/audit records retained as required, and storage/third-party review completed.
- Provide a final note of at least 50 characters.
- The Edge Function will then delete the Supabase Auth login identity and mark the request complete while retaining the minimal request audit reference. If the Auth deletion fails, the request must remain uncompleted and be investigated.
- Verify the Auth identity is no longer active; verify retained records are restricted; notify the user through an appropriate verified channel.

## Explicitly excluded from automatic processing

The Edge Function does not bulk-delete rows from learning, orders, payment, referral, payout, storage, or audit tables. It does not issue refunds or cancel subscriptions. Those actions require separate decisions and safe, feature-specific processing. The completion checkboxes are administrator attestations, not automatic database verification.

## Audit and review

- Record the reviewer, date, request ID and evidence note in the deletion request record.
- Do not put full account numbers, passwords, one-time codes or card details in the review note.
- Escalate unresolved payments, rewards, payouts, disputes, legal holds or uncertainty about retention to the DCDS owner before approving deletion.
- Periodically compare the table inventory and storage locations with current schema and Edge Functions.
