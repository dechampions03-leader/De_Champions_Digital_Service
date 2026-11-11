# DCDS Global Signup Verification — SMS Provider Activation

**Status:** Email OTP is active. SMS OTP is implemented but intentionally disabled pending provider configuration and a real delivery test.

## Student experience

Every new account must supply:
- A valid email address (required for receipts, account recovery and platform communication).
- A valid mobile number in international E.164 format, including `+` and the country calling code.

The student chooses one signup verification method:
1. **Email OTP** — the existing six-digit email code.
2. **Mobile OTP (SMS)** — the six-digit Supabase Auth SMS code, shown as selectable only after production SMS setup is verified.

Only the selected contact is confirmed by that signup step. Do not describe the other contact as verified. Existing users retain their existing login access.

## Existing implementation

- `index.html` renders the email/SMS radio choice, validates the international number, requests the server capability flag and routes the selected verification flow.
- `dcds-create-account` creates the SMS-selected account server-side, applies signup rate limits, requests Supabase Auth to send the OTP, and rolls the account back if SMS delivery fails.
- `verifyOtp({ phone, token, type: "sms" })` completes SMS verification.
- The existing Auth signup trigger validates and privately records the required mobile number and preserves referral attribution.
- SMS capability requires BOTH:
  - `public.dcds_auth_settings.phone_otp_enabled = true`
  - Edge Function secret `DCDS_SMS_OTP_PROVIDER_READY=true`
- Neither gate should be enabled until the Supabase Auth SMS provider is configured and a real test message has been received and verified.

## Recommended provider: Twilio

Supabase hosted Auth supports SMS providers including Twilio, MessageBird and Vonage. Twilio is the recommended first integration for this DCDS rollout because its account, sender and delivery controls are documented in Supabase's Auth provider setup.

### 1. Prepare the provider account

In Twilio:
1. Create or use an approved Twilio account.
2. Complete the account/business verification and billing setup required for production messaging.
3. Create a Messaging Service and attach an SMS-capable sender.
4. Confirm the destination countries DCDS intends to serve are enabled in Twilio's SMS Geo Permissions and supported by the selected sender.
5. Keep the Account SID, Auth Token and Messaging Service SID private. Never paste them into GitHub, this repository, the website, or a ChatGPT conversation.

### 2. Configure Supabase Auth

In the Supabase project `qxsenflgaweeadvggnyp`:
1. Open **Authentication → Sign In / Providers → Phone** (the exact dashboard label may vary).
2. Enable Phone authentication.
3. Select/configure the Twilio SMS provider.
4. Enter the Twilio Account SID, Auth Token and Messaging Service SID in the provider's secure fields.
5. Save the provider settings.
6. Keep email authentication enabled. DCDS requires both email and mobile contact details even when the student chooses SMS as the verification route.
7. Set a six-digit OTP and a sensible expiry/rate limit. Supabase's default SMS send interval is 60 seconds; keep or increase safeguards rather than weakening them.

### 3. Test before opening the option

1. Use a controlled test account and a real mobile number that is permitted by the provider.
2. Confirm that the SMS arrives and contains the correct six-digit code.
3. Submit the code in the DCDS signup screen.
4. Confirm the Auth user has `phone_confirmed_at` set and the account can reach the student portal.
5. Confirm the required email and mobile number are present, the private contact registry has exactly one record for the user, and referral attribution still works when a valid referral code is used.
6. Test a duplicate mobile number and confirm that a second account is rejected.
7. Review Supabase Auth and Edge Function logs for delivery/verification errors.

### 4. Enable DCDS SMS only after the test passes

Only after the real SMS test is successful:

- Set the Edge Function secret `DCDS_SMS_OTP_PROVIDER_READY=true` in **Project Settings → Edge Functions → Secrets**.
- Set `public.dcds_auth_settings.phone_otp_enabled` to true using the authenticated Supabase SQL editor:

```sql
update public.dcds_auth_settings
set setting_value = 'true'::jsonb
where setting_key = 'phone_otp_enabled';
```

If the setting row is missing, stop and investigate rather than creating a duplicate. Confirm exactly one row exists first.

The public signup page checks the server capability endpoint. Once both gates are true, the Mobile OTP option becomes selectable. If either gate is false or the capability check fails, email OTP remains available and SMS stays disabled.

## Rollback

If delivery fails, provider credentials expire, the provider account is suspended, or verification errors rise:
1. Set `phone_otp_enabled` back to false.
2. Set `DCDS_SMS_OTP_PROVIDER_READY=false` (or remove that readiness secret).
3. Confirm the public signup page disables SMS and still allows email OTP.
4. Investigate provider logs before re-enabling.

## Security and operational requirements

- Never expose provider credentials to the browser or source control.
- Never ask students to disclose OTPs or passwords to support staff.
- Keep SMS rate limits and CAPTCHA protections enabled; SMS delivery can incur provider charges and abuse can create costs.
- Check provider country restrictions, sender registration rules, and local telecom regulations for each destination.
- Do not enable SMS based on a successful deployment or a test-number bypass alone. Require a real end-to-end delivery and verification test.
- Do not claim that the mobile contact is verified when the student selected email OTP.
- Do not alter the existing Flutterwave payment/webhook URL as part of SMS setup.

## Related deployment checkpoint — 11 November 2026

- International payout requests: **0**.
- Reward allocations: **0**.
- No international transfer was initiated.
- No payout balance was moved.
- Automated validation and deployment checks passed.
- A real signed Flutterwave transfer callback and a post-deployment customer payment have not yet been tested.
- The combined Flutterwave webhook integration was completed without changing the existing Flutterwave URL.

Keep the two live Flutterwave tests outstanding until they are performed and their results are recorded. SMS provider activation is a separate task and must not change this payout/webhook checkpoint.
