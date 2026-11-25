# DCDS Verified+ Automatic Renewal and Self-Service Cancellation Specification

**Status:** Approved product behaviour; gateway integration, sandbox validation and deployment remain pending  
**Target branch:** `feature/dcds-verified-plus-ecosystem`  
**Applies to:** Monthly, Annual and Five-Year Verified+ memberships  
**Production impact:** None. This is an implementation specification only. It does not create payment plans, store payment credentials, alter gateway settings, change databases or deploy services.

## 1. Approved membership and renewal behaviour

| Plan | Current approved price | Entitlement term | Intended automatic renewal interval |
|---|---:|---|---|
| Monthly | NGN 7,500 | 30 days | Every 30 days |
| Annual | NGN 75,000 | 12 months | Every one year |
| Five-Year | NGN 320,000 | 60 months | Every five years |

Automatic renewal is available for all three plans, but it is **opt-in**. A member must actively agree to recurring billing during checkout or through a later, clearly presented subscription-management flow. Do not preselect consent, hide it in general terms, or activate recurring billing merely because a member buys a one-time term.

When automatic renewal is not enabled, the member receives the ordinary paid term and can renew manually. One-time membership checkout must not include a Flutterwave Payment Plan ID; this keeps the member out of the recurring subscription flow. The membership catalogue prices and durations remain unchanged by this specification. The separate identity-verification fee remains separate and is not included in a recurring membership charge.

The Five-Year plan remains one NGN 320,000 charge for each 60-month term. It must not be converted into five annual charges or 60 monthly instalments.

## 2. Consent and checkout disclosure

Before the first recurring charge, display a separate, unticked consent control with plain language that states:

- the selected plan name and current price;
- the currency and exact first charge;
- the renewal interval and the amount expected at each renewal;
- the next scheduled billing date (or a clear explanation of how it is calculated);
- that the payment method will be charged automatically;
- how to cancel in the DCDS account, without contacting support or waiting for administrator approval;
- that cancellation stops future charges but does not remove an already-paid membership period;
- any applicable taxes or payment-provider charges that the member will pay.

Record a server-verifiable consent event with the authenticated user ID, plan and price version, currency, interval, displayed terms version, consent timestamp, and provider subscription reference once created. Keep the consent evidence append-only or otherwise auditable. Do not treat a payment-success redirect as proof of recurring-billing consent.

If a price or renewal amount changes, notify members before the next charge and obtain fresh explicit consent for the changed amount. If the member does not accept the new price, stop future automatic renewal; do not silently charge a different amount.

## 3. Self-service cancellation — no administrator approval

Member journey:

**Account → Verified+ → Manage Subscription → Cancel Automatic Renewal**

The cancellation action must be available to the member who owns that subscription. It must not require an administrator, moderator, support agent or Root Administrator to approve or process the request.

The cancellation screen may offer these optional reasons:

- Too expensive
- Don't use enough
- Benefits don't meet expectations
- Technical problems
- Switching to another service
- Only needed temporarily
- Other
- Prefer not to say

The reason and any free-text feedback are optional. A member must be able to cancel without selecting a reason or writing an explanation. Do not use a survey, retention offer, repeated confirmation loop or support contact as a blocker.

After the member confirms cancellation:

1. Authenticate the member and verify ownership of the subscription on the server.
2. Request cancellation of the matching provider subscription, using the provider's authenticated server-side API.
3. Verify the provider response and persist the result idempotently.
4. Show a clear confirmation and send a cancellation receipt/notification.
5. Disable future automatic charges immediately once provider cancellation is confirmed.
6. Keep the current membership entitlement active through its already-paid-through timestamp. Do not revoke the remaining paid period solely because renewal was cancelled.
7. Record the cancellation timestamp, effective future-billing stop, optional reason, provider reference and audit event.

Use a `cancellation_pending` state while awaiting provider confirmation. Do not show a successful cancellation message before the provider confirms. If the provider request fails, explain that cancellation has not yet been confirmed and provide a safe retry path. Never mark a subscription cancelled based only on a browser event.

The subscription record may be visible to authorised administrators for support and audit, but administration must not be able to block, delay, reject or require approval for a valid member-initiated cancellation. An administrator may assist only when the member requests help or when a documented security/legal exception applies; ordinary cancellation remains member-controlled.

## 4. Entitlement and billing states

Keep billing state separate from membership entitlement and identity verification.

Suggested billing states:

- `not_enrolled`
- `consent_pending`
- `active_auto_renew`
- `cancellation_pending`
- `cancelled_auto_renew`
- `payment_retrying`
- `payment_failed`
- `provider_suspended`
- `expired`

Store the current paid-through timestamp separately from provider subscription status. A confirmed cancellation changes future billing behaviour; it does not rewrite the existing paid-through timestamp. When that timestamp passes, the membership entitlement expires unless a new verified payment has been completed. Identity approval remains historical and independent; the Blue Badge still requires both approved identity and a currently active paid entitlement.

Reactivation, where supported, must be a deliberate member action with the next charge date and amount shown again. Otherwise, let the member create a new subscription with fresh consent.

## 5. Payment-provider integration requirements

Prefer the provider's managed subscription/payment-plan capability over a DCDS-built card vault. For the current Flutterwave candidate:

- Payment Plans can manage future recurring cycles and expose cancellation/reactivation operations. The first charge subscribes the customer to the plan.
- The provider documentation says Payment Plans are card-only, and subscriptions are tied to the customer's email address. If the DCDS account email changes, the old subscription must be cancelled and a new one created only after the member has been informed and has explicitly consented again.
- Flutterwave sends reminders and subscription/charge webhooks; its documented retry behaviour is three further attempts at 30-minute intervals after a failed charge, after which the subscription is cancelled. DCDS must process each event idempotently and reconcile the provider state.
- The intended intervals are every 30 days, every one year and every five years. Flutterwave documents custom `every x y` intervals, with examples such as every five months, every 90 days and every one year. The exact `every five years` value must be created and tested in the Flutterwave sandbox before Five-Year automatic renewal is enabled. Do not substitute annual or monthly billing if this exact interval is rejected.
- A provider payment-plan ID must be included in the first supported checkout flow only after the member has explicitly consented. Confirm the initial transaction server-side before granting the membership term or showing auto-renew as active.
- Use authenticated webhooks, verify webhook authenticity, re-fetch/verify transactions with the provider where applicable, match amount/currency/reference/customer/plan, and enforce idempotency for both successful and failed events.
- Do not extend membership for pending, failed, reversed, mismatched or unverified transactions. Do not let a delayed or duplicate webhook extend an entitlement twice.
- Keep the provider's subscription ID, plan ID, safe billing status, next billing date, consent record and masked payment-method display details only where the provider returns them and where required. Never collect or store raw card numbers, CVV, PIN or OTP in DCDS.
- Do not use direct card tokenization as the default fallback without a separate review. Flutterwave documents a one-year expiry for card tokens, ties tokens to email addresses, and requires the merchant to manage future charges and cancellations when using tokenization. NOAUTH subsequent charges require provider approval. Any such route needs token-expiry/re-tokenization handling and a separate security review.
- Existing Flutterwave course checkout is course-specific. Build a separate membership order/subscription path; do not put membership purchases through the `orders.course_id` and course-enrolment pipeline.
- If the provider cannot honour the approved interval, cancellation or consent behaviour, keep automatic renewal disabled for that plan and retain manual renewal until a compatible payment route is selected and tested.

## 6. Notifications and member controls

Provide member-visible billing details in Manage Subscription:

- current plan, paid-through date and active entitlement;
- whether automatic renewal is on or off;
- amount, currency, renewal interval and next billing date;
- safe payment-method label where available (for example, card network and last four digits only);
- date and version of recurring-billing consent;
- a direct cancellation control while auto-renew is active;
- cancellation confirmation and the date the paid entitlement ends.

Send clear notices for subscription activation, upcoming renewal, successful renewal receipt, failed payment, provider cancellation, member cancellation and membership expiry. Do not put payment credentials or sensitive identity-verification information in notifications.

## 7. Security, privacy and accounting boundaries

- All subscription creation, cancellation, reactivation and entitlement changes are authenticated and server-authorised.
- A member may manage only their own subscription. Client-supplied user IDs, prices, provider IDs or status values are never trusted as authority.
- Use unique provider references, webhook signature validation, idempotency keys, replay protection, audit events and least-privilege secrets.
- Keep membership charges separate from identity-verification fees, course payments, VTpass orders, wallet/balance records, referral commissions and payouts.
- Never debit a DCDS wallet or internal balance under this feature.
- Do not expose provider tokens, raw provider payloads or private billing metadata to other members.
- Cancellation reason/feedback is optional service-quality data, not a condition of cancelling.

## 8. Required tests and release gates

Before any public activation, test in a non-production environment:

1. Explicit opt-in creates the intended provider subscription; no opt-in creates no recurring subscription.
2. Monthly, Annual and Five-Year intervals charge at their exact approved cadence and amount; Five-Year interval parsing is proven in sandbox.
3. First payment, successful renewal, duplicate webhook, delayed webhook, mismatched amount/currency, failed charge, provider retry, final failure and provider cancellation.
4. Member can cancel from their account without admin approval; provider future billing stops; already-paid access remains active through the paid-through timestamp.
5. Member can cancel with no reason selected; optional reasons and feedback are saved safely when supplied.
6. Provider API failure leaves an honest pending/error state and a safe retry path.
7. Email change, provider subscription re-linking, price-change re-consent, reactivation and expired payment credential cases.
8. RLS and server-side authorisation prevent one member reading or cancelling another member's subscription.
9. No production balances, course orders, student records, payouts, VTpass orders, production secrets or current production functions are touched.

**Blocking infrastructure gate:** the existing DCDS migration-reconciliation report identifies mismatched Supabase migration histories and prohibits applying new migrations until reconciliation is complete. This specification does not override that blocker. Do not create or apply membership billing tables, functions or secrets to Production as part of this documentation task.

