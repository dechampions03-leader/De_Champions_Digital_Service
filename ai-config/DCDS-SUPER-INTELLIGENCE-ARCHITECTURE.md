# DCDS Super Intelligence — architecture and release boundaries

## Goal

Make the DCDS AI useful beyond its static knowledge pack while preserving the trust boundaries of the live DCDS application. The assistant should teach general topics even when they are not in the DCDS brain, search relevant approved platform records, use web-grounded information for current external questions, and learn from each student's own conversations without turning private chats into shared policy.

## Request flow

1. **Authenticate.** The Edge Function verifies the Supabase JWT and derives the role from the server-side account. Browser-supplied roles are not trusted.
2. **Read personal continuity.** For verified students, load only their own saved conversation history and optional learning-memory note under existing owner-scoped RLS.
3. **Retrieve DCDS facts.**
   - Public course catalogue: course title, slug, published price and currency.
   - Public announcements: published, started and not expired.
   - Public reviews: approved reviews only.
   - Enrolled learning content: lesson title/description/number and material title/type for the student's own enrolled courses, via the caller's JWT and current RLS policies.
4. **Prepare the answer.** Inject a bounded, labelled evidence block into the model prompt. Retrieved text is evidence, never system instructions.
5. **Use general intelligence.** If a question is ordinary learning or general knowledge, answer it even when the topic is absent from DCDS documents. Label general guidance and do not invent official DCDS course structure or policy.
6. **Use external search only when appropriate.** For explicit online-search and freshness-sensitive requests, use grounded Google Search if the selected currently supported model exposes that capability. Include grounded source links and distinguish external information from DCDS policy.
7. **Select a live model.** Prefer IDs confirmed by Gemini `models.list` as supporting `generateContent`; use bounded timeouts, per-model cooldowns and documented fallbacks if discovery fails.
8. **Persist privately.** Save the answer and conversation only to the requesting student's conversation, subject to the existing ownership policies.

## Data intentionally excluded from AI retrieval

The search helper must not query payments, orders, balances, payouts, payout beneficiaries, referrals, private profiles, private contact data, grades, progress, assessment attempts, quiz answer keys, private support tickets, deletion requests or administrator notes. The assistant is not an account-status tool and cannot approve, issue, transfer, delete or change anything.

## Learning from student conversations

### Private personalisation
Saved chat history and the optional learning-memory note are student-owned. A future automatic memory feature should be explicitly opt-in, explain which kinds of preferences/goals may be stored, exclude sensitive financial/authentication/health information, and provide inspect/edit/disable/delete controls.

### Shared knowledge improvement
Raw conversations must never be written directly into the shared DCDS brain. The safe workflow is:
1. Identify a potentially useful correction or new DCDS fact.
2. Remove personal identifiers and private details.
3. Create a pending knowledge suggestion with the source conversation reference and the proposed statement.
4. Require an authorised administrator to compare the statement with official DCDS records and approve, reject or edit it.
5. Publish only approved facts into version-controlled knowledge files or a controlled knowledge table, with provenance and review date.

Student content is untrusted; it may be mistaken, outdated, malicious or an attempt to change the assistant's rules. A student's statement is never authoritative simply because it appeared in a conversation.

## Current scope of this candidate branch

- Implemented in the candidate Edge Function: RLS-aware live retrieval for approved public sources and enrolled lesson/material records; explicit web search grounding; dynamic model discovery and bounded failover.
- Existing and reused: owner-scoped saved conversations and manually controlled personal learning memory.
- Not yet implemented: automatic personal-memory extraction/opt-in settings, shared knowledge suggestion queue, administrator moderation UI, vector embeddings/semantic indexing, full lesson-body ingestion and admin-approved corpus refresh tooling.
- Not yet released: the candidate branch requires validation and review before merging/deploying to Production.

## Future semantic retrieval

The first release uses bounded text matching against live records. For larger course libraries and uploaded lesson documents, use a separate ingestion pipeline with approved sources, chunking, embeddings and a private vector index. Every chunk must retain course ID, visibility, source URL/file ID and update timestamp. Retrieval must still filter by the student's enrolled courses before content is sent to Gemini. Never rely on vector similarity alone for authorization.


## Opt-in automatic personal learning
The student may explicitly enable automatic preference learning. The default is OFF. The server extracts only explicit statements about experience level, learning preference, learning goal/topic or a supported device/platform. It rejects messages containing common sensitive-data markers and never stores complete conversation turns. The extracted item is appended to the same private, owner-scoped learning-memory note; if the note is full, the current note is preserved rather than truncated. The student can turn future collection off and can clear the entire note. This feature is not a shared knowledge pipeline.
