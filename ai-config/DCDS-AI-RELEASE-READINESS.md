# DCDS AI — Production release readiness

**Last reviewed:** 13 November 2026  
**Candidate:** `feature/dcds-ai-private-learning-memory` / PR #59  
**Current Production:** Supabase `dcds-ai-chat` remains the previous deployed release. This candidate is not merged or deployed.

## Preview database isolation correction — 13 November 2026

- Root cause of the Preview message "AI access eligibility could not be checked": the candidate website pages were still configured to use the Production Supabase URL and publishable key, while the four new eligibility/memory/usage migrations exist only in the existing DCDS-Development Free project.
- Updated the candidate branch's website/auth pages to use the DCDS-Development project URL and its publishable key. This includes the login entry page, AI assistant, student dashboard, and related account/admin pages. Production branch files and Production Supabase were not changed.
- These commits should trigger a fresh Cloudflare Preview deployment. Verify the deployed preview commit before testing. The Development project has its own authentication users: use a dedicated, confirmed test-student account created in DCDS-Development; do not use a real customer account or assume a Production login is valid in Development.
- Important security follow-up: the currently inspected Development Edge Function version 10 does not yet contain a server-side lookup of `dcds_ai_access_eligibility`. The browser UI currently performs that lookup, but this alone is not an adequate authorization boundary. Add and test server-side eligibility enforcement in the candidate Edge Function before any Production release. Keep Production unchanged until that is complete.


- DCDS has declined a billable Supabase development branch. **Do not create a Supabase subscription branch or another paid project.**
- Use the already-existing Supabase organisation's Free-plan `DCDS-Development` project (`tjgsxbmkpvktlqulbktv`) for candidate database checks. The four candidate migrations listed below have been applied and schema/policy checks run there only.
- Production remains unchanged: the live `dcds-ai-chat` function is still version 4; no Production migration, provider secret, merge or deployment was performed.
- DCDS is not adding an `OPENAI_API_KEY` at this time. OpenAI API usage is billed separately from ChatGPT and is not covered by a ChatGPT Go subscription. This candidate currently requires OpenAI Responses and Moderation APIs, so it cannot be published as written without a funded API project.
- Keep PR #59 as a draft. A no-cost candidate route may retain the existing Gemini integration, but the generation and moderation design must be reviewed and tested as one safety system before changing this PR. The current free Gemini terms have different data-use conditions; the live DCDS privacy notice already warns that free-tier Gemini content may be used to improve Google's products. Do not send confidential, sensitive or financial information to an unpaid provider tier.
- Do not describe the candidate as production-ready until the Cloudflare Pages preview error is fixed and the no-cost provider path has been tested end-to-end.


## Candidate scope

- OpenAI Responses API generation, default model `gpt-6-astra`, and server-only `OPENAI_API_KEY`.
- OpenAI Moderation API checks before and after generation, with fail-closed behaviour.
- DCDS-owned identity and concise, polished GPT-style writing. No voluntary vendor or infrastructure disclosure in ordinary assistant replies.
- Safe Markdown rendering using DOM nodes and text-only content, never model-generated HTML.
- Native DCDS action buttons for verified course, enrolled lesson/material, service, announcement, dashboard, support, privacy and grounded web resources.
- Curated official tool shortcuts for relevant external learning and creator products (Canva, CapCut, Adobe Express, ChatGPT, Claude, Gemini, Grok, YouTube Studio, Meta Business Suite, Figma, GitHub, Supabase, Cloudflare, WordPress, Flutterwave, Selar, Google Drive, Google Docs, Notion and Paystack), with history reconstruction.
- Optional student-controlled learning preference capture, OFF by default and owner-scoped.
- Server-enforced age-band eligibility and guardian review, plus an administrator-only review page.
- Rolling per-minute and daily per-account AI request limits.

## Access policy

- Every account must be authenticated, contact-verified, non-anonymous and assigned its role server-side. DCDS AI is members-only: no guests, anonymous sessions, public visitors, open demo mode or general public access.
- An 18+ account requires an administrator-reviewed `age_band=18_plus`, `access_status=approved` record.
- A 13–17 account requires an administrator-reviewed age record, a separately approved adult DCDS guardian account, verified guardian consent and a non-sensitive internal consent evidence reference.
- **13–17 access remains disabled by default** (`DCDS_AI_TEENS_ENABLED` is unset/false and the page release switch is false). A guardian-approved record does not unlock chat until DCDS completes and approves the under-18 disclosure, monitoring, escalation and real-account tests.
- Under-13 requests are recorded as blocked. **Do not approve under-13 AI access** until DCDS selects a provider whose data-processing and retention terms are suitable for this use, completes age-appropriate child-safety, privacy and legal review, and implements all required safeguards. A provider feature flag is not evidence of approval.
- Age typed into chat or selected in the browser is not proof. Browser-supplied role, guardian flags or eligibility values must never unlock access.
- Do not collect a full date of birth, identity-document image or unnecessary sensitive family details in the AI system.

## Provider, privacy and child-safety gates

1. **Current budget decision:** do not add `OPENAI_API_KEY`; OpenAI billing is separate from ChatGPT Go. The current PR code cannot run without a funded OpenAI API project, so keep it draft/unmerged.
2. First evaluate a Gemini-based candidate using the existing provider integration and the existing DCDS-Development Free project. Confirm the exact model, quota availability, safety-filter behaviour and data terms before changing the deployment path. Do not assume the candidate's model name or free quota is currently available.
3. If DCDS later chooses OpenAI, add `OPENAI_API_KEY` through Supabase Edge Function secrets only; never place secrets in HTML, GitHub or chat, and confirm the API project, billing, model availability, budget limits and alerts before launch.
3. Review current OpenAI Under-18 API Guidance and ensure DCDS has appropriate age assurance, child-appropriate disclosures, content filters, monitoring, escalation and support processes.
4. Do not send known or suspected child sexual abuse material to the Moderation API. The endpoint is not a CSAM detector; suspected material requires a separate safeguarding route.
5. `store: false` does not confer Zero Data Retention. Standard API abuse monitoring may retain content for up to 30 days unless the project has an approved ZDR or modified-monitoring arrangement.
6. Keep under-13 access blocked until ZDR is formally approved and effective. Do not treat the presence of a feature flag as provider approval.
7. Confirm the Privacy Policy describes the actual API data path, moderation checks, storage and retention. Have DCDS's privacy/legal reviewer approve the under-18 launch approach.

Official references:
- https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance
- https://developers.openai.com/api/docs/guides/your-data
- https://developers.openai.com/api/docs/guides/moderation
- https://developers.openai.com/api/docs/models/gpt-6-astra

## Database migrations required before deploy

Apply and verify all of these additive migrations in the target environment:
1. `20261113110000_dcds_ai_opt_in_learning_memory.sql` — automatic learning flag, default OFF.
2. `20261113120000_dcds_ai_age_guardian_eligibility.sql` — age bands, consent audit reference, RLS and approved-adult guardian check.
3. `20261113123000_dcds_ai_daily_usage_budget.sql` — rolling minute plus daily request counts and function.
4. `20261113133000_dcds_ai_eligibility_review_policy_scope.sql` — separates administrator UPDATE/DELETE permissions from user SELECT/initial INSERT policies.

Do not deploy the candidate Edge Function until its schema, functions, RLS and admin review UI exist.

## Controlled rollout sequence

1. Configure provider secrets and provider-side budget/usage alerts.
2. Obtain and record the DCDS provider, privacy and child-safety approval.
3. Apply the four migrations in the existing DCDS-Development Free project; inspect RLS and SQL advisor results. Do not create a billable Supabase branch.
4. Merge PR #59 only after approval and all CI checks pass.
5. Deploy the matching Edge Function and page together. Keep visitor access disabled.
6. Start with a small controlled cohort: DCDS administrators and adult test students first. Validate the provider response, source citations, buttons, history, memory and quota behaviour.
7. Add 13–17 learners only after the guardian-review flow, verified adult guardian RPC, parent consent evidence handling, support/escalation and adult-under-18 disclosure process have been tested.
8. Keep under-13 blocked until the exact project receives approved ZDR and DCDS completes the additional under-13 release review.
9. Verify production version, run post-deploy smoke tests, inspect logs and monitor token usage/cost before expanding cohort sizes.

## Required tests

- Valid adult request succeeds only after administrator approval; missing or pending eligibility returns 403 and never contacts the provider.
- 13–17 cannot access without a separately approved adult guardian account, guardian consent reference and administrator approval.
- Under-13 remains blocked even if a browser request attempts to alter the record; the environment flag alone is insufficient.
- Known or suspected child sexual exploitation inputs are intercepted locally and never forwarded to the Moderation or generation API.
- Input and output moderation failures are closed safely; no unmoderated answer is returned.
- No assistant response contains volunteered model-vendor branding; direct technical-provider questions remain truthful.
- Simple questions are concise; substantial lessons contain the requested tools, steps, prompts, examples and checks.
- Valuable DCDS courses, enrolled lessons/materials, dashboard, services and official pages render real native action buttons.
- Invalid links are discarded; assistant text is rendered as text/Markdown nodes and never as executable HTML.
- Course and enrolled lesson buttons resolve; a second student cannot see the first student's enrolled lesson or memory.
- Curated external tool buttons resolve to the approved official HTTPS domains; reopening a saved conversation restores those buttons.
- Conversation history can be saved, reopened and deleted; optional learning preference storage stays OFF until explicitly enabled and can be switched off/cleared.
- Per-minute and daily caps return a controlled limit message.
- Admin eligibility review is inaccessible to students and cannot approve under-13 accounts.
- General visitor access is permanently out of scope for this release; do not add a visitor mode or guest chat in future release work.

## Release integrity

A CI pass proves only the checks that CI actually runs. It does not prove provider billing, age assurance, guardian consent, ZDR approval, a real signed-in student flow, legal compliance, production deployment or cost safety. Record those independently.
- DCDS has declined a billable Supabase development branch. **Do not create a Supabase subscription branch or another paid project.**
- Use the already-existing Supabase organisation's Free-plan `DCDS-Development` project (`tjgsxbmkpvktlqulbktv`) for candidate database checks. The four candidate migrations listed below have been applied and schema/policy checks run there only.
- Production remains unchanged: the live `dcds-ai-chat` function is still version 4; no Production migration, provider secret, merge or deployment was performed.
- DCDS is not adding an `OPENAI_API_KEY` at this time. OpenAI API usage is billed separately from ChatGPT and is not covered by a ChatGPT Go subscription. This candidate currently requires OpenAI Responses and Moderation APIs, so it cannot be published as written without a funded API project.
- Keep PR #59 as a draft. A no-cost candidate route may retain the existing Gemini integration, but the generation and moderation design must be reviewed and tested as one safety system before changing this PR. The current free Gemini terms have different data-use conditions; the live DCDS privacy notice already warns that free-tier Gemini content may be used to improve Google's products. Do not send confidential, sensitive or financial information to an unpaid provider tier.
- Do not describe the candidate as production-ready until the Cloudflare Pages preview error is fixed and the no-cost provider path has been tested end-to-end.


## Candidate scope

- OpenAI Responses API generation, default model `gpt-6-astra`, and server-only `OPENAI_API_KEY`.
- OpenAI Moderation API checks before and after generation, with fail-closed behaviour.
- DCDS-owned identity and concise, polished GPT-style writing. No voluntary vendor or infrastructure disclosure in ordinary assistant replies.
- Safe Markdown rendering using DOM nodes and text-only content, never model-generated HTML.
- Native DCDS action buttons for verified course, enrolled lesson/material, service, announcement, dashboard, support, privacy and grounded web resources.
- Curated official tool shortcuts for relevant external learning and creator products (Canva, CapCut, Adobe Express, ChatGPT, Claude, Gemini, Grok, YouTube Studio, Meta Business Suite, Figma, GitHub, Supabase, Cloudflare, WordPress, Flutterwave, Selar, Google Drive, Google Docs, Notion and Paystack), with history reconstruction.
- Optional student-controlled learning preference capture, OFF by default and owner-scoped.
- Server-enforced age-band eligibility and guardian review, plus an administrator-only review page.
- Rolling per-minute and daily per-account AI request limits.

## Access policy

- Every account must be authenticated, contact-verified, non-anonymous and assigned its role server-side. DCDS AI is members-only: no guests, anonymous sessions, public visitors, open demo mode or general public access.
- An 18+ account requires an administrator-reviewed `age_band=18_plus`, `access_status=approved` record.
- A 13–17 account requires an administrator-reviewed age record, a separately approved adult DCDS guardian account, verified guardian consent and a non-sensitive internal consent evidence reference.
- **13–17 access remains disabled by default** (`DCDS_AI_TEENS_ENABLED` is unset/false and the page release switch is false). A guardian-approved record does not unlock chat until DCDS completes and approves the under-18 disclosure, monitoring, escalation and real-account tests.
- Under-13 requests are recorded as blocked. **Do not approve under-13 AI access** until DCDS selects a provider whose data-processing and retention terms are suitable for this use, completes age-appropriate child-safety, privacy and legal review, and implements all required safeguards. A provider feature flag is not evidence of approval.
- Age typed into chat or selected in the browser is not proof. Browser-supplied role, guardian flags or eligibility values must never unlock access.
- Do not collect a full date of birth, identity-document image or unnecessary sensitive family details in the AI system.

## Provider, privacy and child-safety gates

1. **Current budget decision:** do not add `OPENAI_API_KEY`; OpenAI billing is separate from ChatGPT Go. The current PR code cannot run without a funded OpenAI API project, so keep it draft/unmerged.
2. First evaluate a Gemini-based candidate using the existing provider integration and the existing DCDS-Development Free project. Confirm the exact model, quota availability, safety-filter behaviour and data terms before changing the deployment path. Do not assume the candidate's model name or free quota is currently available.
3. If DCDS later chooses OpenAI, add `OPENAI_API_KEY` through Supabase Edge Function secrets only; never place secrets in HTML, GitHub or chat, and confirm the API project, billing, model availability, budget limits and alerts before launch.
3. Review current OpenAI Under-18 API Guidance and ensure DCDS has appropriate age assurance, child-appropriate disclosures, content filters, monitoring, escalation and support processes.
4. Do not send known or suspected child sexual abuse material to the Moderation API. The endpoint is not a CSAM detector; suspected material requires a separate safeguarding route.
5. `store: false` does not confer Zero Data Retention. Standard API abuse monitoring may retain content for up to 30 days unless the project has an approved ZDR or modified-monitoring arrangement.
6. Keep under-13 access blocked until ZDR is formally approved and effective. Do not treat the presence of a feature flag as provider approval.
7. Confirm the Privacy Policy describes the actual API data path, moderation checks, storage and retention. Have DCDS's privacy/legal reviewer approve the under-18 launch approach.

Official references:
- https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance
- https://developers.openai.com/api/docs/guides/your-data
- https://developers.openai.com/api/docs/guides/moderation
- https://developers.openai.com/api/docs/models/gpt-6-astra

## Database migrations required before deploy

Apply and verify all of these additive migrations in the target environment:
1. `20261113110000_dcds_ai_opt_in_learning_memory.sql` — automatic learning flag, default OFF.
2. `20261113120000_dcds_ai_age_guardian_eligibility.sql` — age bands, consent audit reference, RLS and approved-adult guardian check.
3. `20261113123000_dcds_ai_daily_usage_budget.sql` — rolling minute plus daily request counts and function.
4. `20261113133000_dcds_ai_eligibility_review_policy_scope.sql` — separates administrator UPDATE/DELETE permissions from user SELECT/initial INSERT policies.

Do not deploy the candidate Edge Function until its schema, functions, RLS and admin review UI exist.

## Controlled rollout sequence

1. Configure provider secrets and provider-side budget/usage alerts.
2. Obtain and record the DCDS provider, privacy and child-safety approval.
3. Apply the four migrations in the existing DCDS-Development Free project; inspect RLS and SQL advisor results. Do not create a billable Supabase branch.
4. Merge PR #59 only after approval and all CI checks pass.
5. Deploy the matching Edge Function and page together. Keep visitor access disabled.
6. Start with a small controlled cohort: DCDS administrators and adult test students first. Validate the provider response, source citations, buttons, history, memory and quota behaviour.
7. Add 13–17 learners only after the guardian-review flow, verified adult guardian RPC, parent consent evidence handling, support/escalation and adult-under-18 disclosure process have been tested.
8. Keep under-13 blocked until the exact project receives approved ZDR and DCDS completes the additional under-13 release review.
9. Verify production version, run post-deploy smoke tests, inspect logs and monitor token usage/cost before expanding cohort sizes.

## Required tests

- Valid adult request succeeds only after administrator approval; missing or pending eligibility returns 403 and never contacts the provider.
- 13–17 cannot access without a separately approved adult guardian account, guardian consent reference and administrator approval.
- Under-13 remains blocked even if a browser request attempts to alter the record; the environment flag alone is insufficient.
- Known or suspected child sexual exploitation inputs are intercepted locally and never forwarded to the Moderation or generation API.
- Input and output moderation failures are closed safely; no unmoderated answer is returned.
- No assistant response contains volunteered model-vendor branding; direct technical-provider questions remain truthful.
- Simple questions are concise; substantial lessons contain the requested tools, steps, prompts, examples and checks.
- Valuable DCDS courses, enrolled lessons/materials, dashboard, services and official pages render real native action buttons.
- Invalid links are discarded; assistant text is rendered as text/Markdown nodes and never as executable HTML.
- Course and enrolled lesson buttons resolve; a second student cannot see the first student's enrolled lesson or memory.
- Curated external tool buttons resolve to the approved official HTTPS domains; reopening a saved conversation restores those buttons.
- Conversation history can be saved, reopened and deleted; optional learning preference storage stays OFF until explicitly enabled and can be switched off/cleared.
- Per-minute and daily caps return a controlled limit message.
- Admin eligibility review is inaccessible to students and cannot approve under-13 accounts.
- General visitor access is permanently out of scope for this release; do not add a visitor mode or guest chat in future release work.

## Release integrity

A CI pass proves only the checks that CI actually runs. It does not prove provider billing, age assurance, guardian consent, ZDR approval, a real signed-in student flow, legal compliance, production deployment or cost safety. Record those independently.