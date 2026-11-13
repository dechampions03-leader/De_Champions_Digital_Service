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

## Visitor and Auth CAPTCHA prerequisite
- Supabase anonymous sign-ins must be enabled in DCDS-Development for visitor sessions.
- The shared AI page now renders Cloudflare Turnstile and passes the resulting token to `signInAnonymously({ options: { captchaToken } })`. New visitor sessions remain blocked until the provider keys are configured and project-level CAPTCHA protection is enabled.
- The public homepage account form passes the CAPTCHA token through email signup, password login, password reset and signup-code resend when `authProtectionEnabled` is set to `true` in `ai-config/captcha-public-config.js`.
- The separate privileged SMS-signup Edge Function verifies Turnstile server-side before it creates an Auth user. When SMS signup is enabled, configure `DCDS_TURNSTILE_SECRET_KEY` as an Edge Function secret and set `DCDS_TURNSTILE_HOSTNAMES` to the exact comma-separated allowed hostnames. It defaults to `dechampions03-leader.github.io`.
- Create a Turnstile widget in Cloudflare and allow the DCDS website hostname(s). Put only its public **site key** in `ai-config/captcha-public-config.js`. Never put the Turnstile secret or Gemini key in that file.
- In Supabase Dashboard → Authentication → Bot and Abuse Protection, choose Turnstile and save the matching **secret key**. Only after this is configured, set `authProtectionEnabled: true` in the public config. Supabase Auth CAPTCHA is project-wide, so do not enable it before the account form and OTP-resend paths are deployed and tested.
- If anonymous sign-in is disabled or blocked, the page displays a clear fallback and existing verified students can still use the normal sign-in route, provided the CAPTCHA rollout is configured consistently.
- Supabase's anonymous sign-in endpoint is rate-limited per IP; CAPTCHA and application-level abuse controls are important because visitor users can create fresh anonymous identities.

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
The shared interface, role-aware Edge Function, hardened quota migration and Turnstile client/server integration are prepared on the Development feature branch. The AI usage migration and `dcds-ai-chat` function are deployed to DCDS-Development. The DCDS owner has added `GEMINI_API_KEY` to Development Edge Function Secrets; the value is never committed or pasted into chat. Turnstile site/secret configuration, live CAPTCHA challenge, end-to-end Gemini response and identity-role test cases are still required before the Development pilot can be declared fully tested. Production is not enabled by this rollout.
