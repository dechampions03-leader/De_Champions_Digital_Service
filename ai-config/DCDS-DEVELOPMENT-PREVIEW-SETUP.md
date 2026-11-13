# DCDS Development-only CAPTCHA preview

This preview is intentionally separate from the public GitHub Pages website and from Supabase Production.

## Cloudflare Pages setup

Create a **new, separate** Cloudflare Pages project. Do not change the existing GitHub Pages configuration or any existing customer-facing Cloudflare project.

Use these settings:

- Project name: `dcds-dev-auth-preview`
- Git repository: `dechampions03-leader/De_Champions_Digital_Service`
- Production branch **for this separate Pages project only**: `feature/shared-dcds-ai`
- Framework preset: `None`
- Build command: leave blank
- Build output directory: `dev-preview`
- Root directory: leave blank

The dedicated Pages project's base hostname should be:

`dcds-dev-auth-preview.pages.dev`

If Cloudflare reports that this project name is unavailable, stop and use the actual hostname it offers; add that exact hostname to the Turnstile widget before testing.

## Turnstile hostname

In the existing DCDS Turnstile widget, keep `dechampions03-leader.github.io` and add:

`dcds-dev-auth-preview.pages.dev`

Do not remove the GitHub Pages hostname. The Turnstile widget's site key is public and is already included in the Development preview config.

## Test sequence

1. Open `https://dcds-dev-auth-preview.pages.dev/`.
2. Choose **Open DCDS AI visitor test**.
3. Confirm that Turnstile renders on the AI page.
4. Complete the challenge. The page calls anonymous sign-in against DCDS-Development with the CAPTCHA token.
5. Send one harmless test question. The page invokes only the Development `dcds-ai-chat` Edge Function.

The first successful visit creates an anonymous test user in DCDS-Development. Do not use real customer credentials or submit personal, payment, OTP, or private student information.

## Safety

- The public GitHub Pages `main` branch is not changed by this preview.
- The preview's Supabase URL and publishable key point to `tjgsxbmkpvktlqulbktv` (DCDS-Development).
- No Supabase service-role key, Turnstile secret, or Gemini API key is included in the preview files.
- `X-Robots-Tag: noindex, nofollow` and `Cache-Control: no-store` are applied by the Pages `_headers` file.
- Do not merge PR #53 or deploy this preview as the public DCDS website as part of this test.


## Verified student tutor qualification

The preview now includes `/student-test-login.html`, a sign-in-only page for a dedicated DCDS-Development test identity.

1. In Supabase **DCDS-Development** → Authentication → Users, create a dedicated test user with an email address you control and a strong temporary password. Confirm the email for this Development test user in the dashboard.
2. Do not add the test user to `public.dcds_admins`; the test must resolve to the ordinary verified-student role, not administrator.
3. Do not use a real customer account or an administrator account. Do not paste the password into GitHub, chat, source files, support tickets or logs.
4. Open `https://dcds-dev-auth-preview.pages.dev/student-test-login.html`, complete Turnstile, and sign in with that dedicated Development test account.
5. The page checks that the user is non-anonymous, has a confirmed email or phone, and is not a DCDS administrator. It then redirects to the shared AI page. The AI Edge Function independently determines the role from the verified Supabase user; there is no client-side role switch.
6. Send a harmless teaching prompt, such as: `Teach me the basics of graphic design. I am a beginner using an Android phone. Give me one example and one practice task.`
7. Confirm that the assistant identifies the session as `Student · Learning Assistant` after its first successful response. Then test a learner-submitted answer and ask for constructive feedback.

This page does not create users, change accounts, read private student records, or change Production. Remove the temporary Development test user from Supabase Auth after qualification if it is no longer needed.
