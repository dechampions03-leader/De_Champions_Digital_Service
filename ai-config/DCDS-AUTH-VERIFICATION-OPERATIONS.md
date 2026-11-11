# DCDS Account Verification Operations

## Registration policy

Every new account requires both:
- a valid email address; and
- a mobile number in E.164 format, including the correct international country calling code.

At signup the learner may choose one contact method for the six-digit verification code:
1. Email OTP.
2. SMS OTP, when SMS delivery has been configured and explicitly enabled by DCDS.

One verified contact is sufficient to activate the account. The other contact remains on the same Auth user and is not described as verified until its own confirmation timestamp is present. Email remains mandatory because it is used for Flutterwave checkout/customer contact and receipts.

Existing students can continue to sign in with their existing email/password. They are not forced to add or verify a mobile number by this rollout.

## Current deployment boundary

- The email OTP route remains available.
- The signup form shows both verification choices, but SMS is disabled until provider setup is complete.
- The SMS create-account Edge Function is deployed separately as `dcds-create-account`; it uses service-role Auth Admin only server-side.
- The function requires both the database feature flag and the server-side `DCDS_SMS_OTP_PROVIDER_READY=true` secret before it will create a phone-OTP account or advertise SMS as available.
- No SMS provider credentials are stored in GitHub, browser code, the DCDS public database API, or this document.
- The signup flow is rate-limited by SHA-256 fingerprints of email, phone and (when available) IP. The private table does not store raw IP addresses or contact details.
- A failed SMS send rolls back the newly created Auth user; DCDS does not leave an account that cannot complete the selected SMS verification route.

## Recommended production provider setup

Supabase hosted Auth supports Twilio, MessageBird and Vonage (TextLocal is also documented as community-supported). Twilio is the recommended first option for this DCDS rollout, subject to its country coverage, sender availability and pricing for the countries DCDS serves.

For Twilio:
1. Prepare an approved, billed Twilio account.
2. Create a Messaging Service and attach an SMS-capable sender.
3. Confirm the destination countries are allowed in Twilio SMS Geo Permissions and that the sender can deliver there.
4. In Supabase **Authentication → Sign In / Providers → Phone**, enable Phone authentication and select/configure Twilio.
5. Enter the Account SID, Auth Token and Messaging Service SID only in Supabase's secure provider settings. Never commit them or send them in chat.
6. Keep the six-digit OTP, Supabase OTP rate limits and CAPTCHA protections enabled. SMS delivery can incur provider charges.

## Enable SMS only after provider setup

1. In Supabase Dashboard, open **Authentication → Sign In / Providers → Phone**.
2. Enable phone authentication and configure a production SMS provider supported by Supabase (for example Twilio, MessageBird or Vonage). Configure the provider credentials and sender/template in Supabase's Auth settings; never place those values in the repository or browser.
3. Verify that a controlled DCDS test phone in international format receives and verifies a six-digit SMS OTP. Do not use a real customer's number as the first test.
4. In Supabase Edge Function Secrets, add `DCDS_SMS_OTP_PROVIDER_READY=true`. This is an operator assertion after the provider configuration and controlled delivery test; it is not a provider credential.
5. Only after steps 1–4 pass, enable the DCDS database feature flag from the Supabase SQL Editor:

   ```sql
   update public.dcds_auth_settings
   set setting_value = 'true'::jsonb,
       updated_at = now()
   where setting_key = 'phone_otp_enabled';
   ```

6. Check the DCDS signup form. The SMS radio choice should become enabled only when the database flag and server secret are both true.
7. Complete a controlled end-to-end test: create a QA account with both contacts, select SMS, receive and verify the SMS OTP, sign in using the mobile number plus password, open the student dashboard, and verify a checkout can be initiated without actually completing a customer charge.
8. Record the provider, test date, country, masked test destination and result in the internal operations record. Never log the OTP or provider credentials.

To disable SMS immediately, set the database flag back to `false` and remove/disable the `DCDS_SMS_OTP_PROVIDER_READY` secret. Email OTP remains the fallback.

## Auth and account-state rules

- Email signup uses Supabase's email/password signup and six-digit email OTP.
- SMS signup creates the same Auth identity with both email and phone values, both initially unconfirmed; DCDS sends the OTP to the selected phone route.
- Email verification is `email_confirmed_at`; SMS verification is `phone_confirmed_at`.
- DCDS private-page access, course access, General Course access and checkout accept either timestamp, while requiring the account to retain a valid email for payment-provider communication.
- Login accepts either the account email or registered phone number with the same password.
- Do not mark the unused contact method verified or claim both contacts are confirmed when only one OTP was completed.


## Global signup verification state — 11 November 2026

- The signup form already provides a two-choice selector: email OTP or mobile SMS OTP.
- Email OTP is available now.
- SMS is intentionally disabled until Supabase Auth has a production SMS provider configured and a controlled real-phone delivery-and-verification test passes.
- The server checks both `public.dcds_auth_settings.phone_otp_enabled` and the Edge Function secret `DCDS_SMS_OTP_PROVIDER_READY=true`. Keep both disabled until that test is complete.
- SMS signup uses the deployed `dcds-create-account` Edge Function, a server-side Auth Admin create, rate limiting and rollback if the SMS send fails.
- A student must always provide both email and mobile number, but only the selected verification contact is confirmed by that OTP step.
