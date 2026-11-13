# DCDS AI — Production release readiness

**Last reviewed:** 13 November 2026  
**Scope:** DCDS AI Learning Assistant, its shared website/dashboard surface, and the opt-in automatic learning-preference extension.

## Current verified state

- The Production Supabase Edge Function `dcds-ai-chat` is ACTIVE, version 4, with JWT verification enabled.
- The live service requires a verified account and derives the student/administrator role on the server. Anonymous visitor access remains disabled.
- The automatic learning-preference extension is a candidate on `feature/dcds-ai-private-learning-memory` / PR #59. It is not yet merged or deployed.
- The candidate schema change adds `auto_learning_enabled BOOLEAN NOT NULL DEFAULT false`; existing students remain opted out.
- A passing CI run validates type-checking and static privacy/retrieval invariants. It is not a substitute for an authenticated end-to-end student test.

## Release blockers that must be resolved

### 1. Age and provider eligibility

The Gemini API Additional Terms effective 23 March 2026 require API users to be at least 18 and prohibit using the API in an application directed to, or likely to be accessed by, people under 18:
https://ai.google.dev/gemini-api/terms

DCDS's privacy notice contemplates younger learners and parent/guardian-managed accounts. The current public `profiles` table has no date-of-birth field, so no database-backed age gate is evident from that table.

**Do not expand or re-release Gemini-backed student AI until DCDS confirms that the AI surface is genuinely restricted to adults and that the provider terms permit the deployment.** If DCDS needs AI access for under-18 learners, select a provider/product whose terms and safeguarding controls permit that use; do not rely on a simple UI disclaimer.

### 2. Gemini API billing and data handling

Google's terms distinguish Unpaid Services from Paid Services. With Unpaid Services, prompts and responses may be used to improve and develop Google products and may be reviewed by humans. With Paid Services, prompts and responses are not used for product improvement, but limited logging may still occur for safety and legal requirements. Gemini API access is treated as Paid Services when the API is accessed through a Cloud Project with an active billing account.

DCDS must verify the billing status of the exact Cloud Project used by the Production `GEMINI_API_KEY`. Do not assume a key is on paid terms merely because the application is deployed or because API usage has a quota. Do not send sensitive or confidential student information to unpaid service.

Reference: https://ai.google.dev/gemini-api/terms

## Safe release sequence after blockers are cleared

1. Record the approved age/provider decision and verify the Gemini API Cloud Project billing status.
2. Confirm the public privacy notice accurately describes the actual provider mode and data flow.
3. Apply the additive opt-in migration. It must remain OFF by default.
4. Merge the reviewed candidate only after CI passes.
5. Deploy the matching Edge Function and website page as one release; do not deploy code before the schema exists.
6. Verify the deployed function version and page deployment.
7. Run tests with a verified, non-admin adult student account:
   - Send a general tutoring request and confirm a complete, practical answer.
   - Save a conversation, start a new one, reopen the old one, and delete it.
   - Leave automatic learning OFF and verify no preferences are appended.
   - Enable it explicitly; send a harmless preference such as “I prefer step-by-step explanations”; confirm only that preference is saved.
   - Try sensitive and third-party examples; confirm none is saved.
   - Turn automatic learning OFF and confirm future additions stop.
   - Clear the memory and confirm it is removed.
   - Verify a second account cannot read the first account's conversations or memory.

## Release integrity

- A deployment status is not proof that a student workflow passed.
- Never say personal referral, payment, payout, certificate, grade or account status was checked unless a protected platform tool actually checked it.
- Never let private chats or student memory become shared DCDS knowledge automatically.
- Keep visitor access disabled until a separate security review qualifies CAPTCHA, rate limits and abuse controls.
