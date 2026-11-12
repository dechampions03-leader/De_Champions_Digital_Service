# DCDS Shared AI — Development rollout and launch checklist

## One assistant, three server-verified roles
- Main homepage, student dashboard and admin dashboard open the same `ai-learning-assistant.html` page.
- All clients call one Supabase Edge Function: `dcds-ai-chat`.
- The Edge Function determines roles from the authenticated Supabase user:
  - Visitor: Supabase anonymous session, or a signed-in user without a verified email/phone.
  - Student: verified email OR verified phone.
  - Administrator: `public.is_dcds_admin()` confirms the user's ID against `public.dcds_admins`.
- The browser never supplies a trusted role. The admin AI is advisory/read-only and has no database or financial action tools.

## Development environment
- Supabase project: `DCDS-Development` (`tjgsxbmkpvktlqulbktv`).
- Development website bundle must use the Development project URL and its public publishable key.
- Do not copy the Development URL/key into the production website bundle.
- Keep Production secrets and payment/payout systems unchanged.

## Server-side configuration
Set these values in Supabase Dashboard → DCDS-Development → Edge Functions → Secrets:
- `GEMINI_API_KEY`: API key created by the DCDS owner in Google AI Studio.
- `DCDS_AI_MODEL`: optional; defaults to `gemini-3.8-flash`.

Never place the provider key in HTML, JavaScript, browser storage, GitHub, a URL or a student form. Configure it only in the Development project's Edge Function secrets. The API key has not been included in this repository or deployment payload.

## Database migration
Apply `supabase/migrations/20261110000000_dcds_ai_usage_windows.sql` to DCDS-Development only. It creates:
- A private per-user request-window table with RLS enabled and no client table access.
- A SECURITY DEFINER quota RPC with a fixed search path.
- Bounded request counts that saturate at limit + 1 instead of growing indefinitely.
- Role limits enforced by the Edge Function: visitor 5/minute, student 10/minute, admin 15/minute.

Do not run `supabase db push` until remote migration history is reconciled; the restored baseline was applied as schema-only SQL and the project initially had no migration records.

## Visitor-access prerequisite
- Supabase anonymous sign-ins must be enabled in DCDS-Development for visitor sessions.
- Configure CAPTCHA / abuse protection before public launch.
- If anonymous sign-in is disabled or blocked, the page displays a clear fallback and verified students can still sign in.

## Deployment order
1. Review this branch and preserve the AI implementation through a pull request.
2. Apply the AI usage migration to DCDS-Development only.
3. Set `GEMINI_API_KEY` in DCDS-Development Edge Function Secrets.
4. Deploy `supabase/functions/dcds-ai-chat/index.ts` with JWT verification enabled.
5. Test visitor, verified-email student, verified-phone student, admin and unverified-user paths.
6. Test missing provider key, quota exceeded, provider failure and prompt-injection attempts.
7. Test desktop/mobile website and Capacitor WebView.
8. Run the DCDS AI evaluation cases and record actual results before production consideration.

## Privacy and free-tier warning
The assistant sends the user's message and limited user-provided conversation context to the Gemini API to produce a response. It does not query or send private student, account, payment, payout or admin records. Google's applicable terms and data practices apply; free-tier Gemini content may be used to improve Google products. Keep the assistant limited to public DCDS information and general learning. Do not ask users to submit passwords, OTPs, payment credentials, banking details or sensitive personal information.

## Current Development status
The shared interface, role-aware Edge Function and hardened quota migration are prepared for the Development rollout. The migration and function deployment are performed separately in DCDS-Development. The Gemini provider secret must be entered by the DCDS owner in Supabase Dashboard; it is never committed or pasted into chat. Production is not enabled by this rollout.
