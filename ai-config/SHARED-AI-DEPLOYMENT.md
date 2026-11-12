# DCDS Shared AI — Deployment and launch checklist

## One assistant, two entry points
- Main website notification bell and mobile navigation open `ai-learning-assistant.html`.
- Student dashboard opens the same page.
- Both call the single `dcds-ai-chat` Supabase Edge Function.
- The Edge Function loads the same DCDS Master Brain, Conversation Intelligence, Teaching Engine, Response Playbook and structured knowledge base from the repository's main branch.

## Server-side configuration
Set these values in Supabase Dashboard → Edge Functions → Secrets:
- `GEMINI_API_KEY`: API key created by the DCDS owner in Google AI Studio.
- `DCDS_AI_MODEL`: optional; defaults to `gemini-3.8-flash`.

Never place the provider key in HTML, JavaScript, browser storage, GitHub or a student form. The key is configured once for the shared Edge Function.

## Database prerequisite
Review and apply `supabase/migrations/20261110000000_dcds_ai_usage_windows.sql` in the Supabase SQL Editor before deploying the Edge Function. The repository previously had no checked-in migration history despite existing remote migrations, so reconcile the remote migration history before using `supabase db push`. The SQL creates a private per-user request counter and the authenticated RPC used for a 10-request-per-60-second guard.

## Deployment order
1. Merge this feature branch after review.
2. Apply the SQL migration.
3. Set `GEMINI_API_KEY` in Supabase Dashboard → Edge Functions → Secrets. The Gemini 3.8 Flash model ID is `gemini-3.8-flash`; it is the default in the shared Edge Function.
4. Deploy `supabase/functions/dcds-ai-chat/index.ts` with JWT verification enabled.
5. Test with a verified student account, an unverified account, missing provider key, quota exceeded, provider failure and prompt-injection attempts.
6. Run all 22 existing DCDS AI evaluation cases and record real results before public launch.

## Privacy and free-tier warning
The default Gemini model is `gemini-3.8-flash`. Google's current Gemini API pricing page says free-tier content may be used to improve Google products; paid-tier content is not used for that purpose. Keep the initial assistant limited to public DCDS information and general learning. Do not connect private student records or invite users to submit payment credentials, health information or other sensitive personal data. Review current terms, model availability and pricing before production use.

## Current status
This branch prepares the shared user interface, one Edge Function and a quota migration. It does not deploy the function, set the provider secret, apply the migration or switch production traffic. The AI is not live until those steps and tests are complete.
