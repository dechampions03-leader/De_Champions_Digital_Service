# DCDS Verified+ Flutterwave Sandbox Integration Runbook

**Status:** Provider adapter and mocked contract tests added; live sandbox verification pending  
**Target branch:** `feature/dcds-verified-plus-ecosystem`  
**Environment:** DCDS-Development only  
**Production impact:** None. This runbook and adapter do not create provider plans, charge customers, create database objects, change secrets or deploy Edge Functions.

## 1. What is implemented in the repository

- `membership-billing.ts`: server-domain rules for explicit renewal consent, plan prices, member-owned cancellation and paid-through entitlement.
- `flutterwave-recurring-provider.ts`: provider-neutral Flutterwave V3 adapter methods for creating a plan, starting the first hosted subscription payment, looking up a subscription by its initial transaction, verifying a transaction and cancelling one individual subscription.
- `flutterwave-recurring-provider_test.ts`: mocked HTTP contract tests for the provider request paths and payloads, plan prices/intervals, subscription cancellation, subscription lookup, transaction checks and webhook signature verification.
- `dcds-verified-plus-auto-renewal-and-cancellation-spec.md`: the approved member-facing product and security rules.

The adapter does not persist membership orders, store provider plan/subscription references, update entitlement state, send receipts or create a member cancellation screen. Those require a reconciled schema and a separately secured Development Edge Function.

## 2. Flutterwave contract used

Flutterwave V3 uses the following operations:

| Purpose | Method and endpoint |
|---|---|
| Create one reusable plan | `POST /v3/payment-plans` |
| Start the first hosted charge with a plan | `POST /v3/payments` with `payment_plan` |
| Verify a transaction | `GET /v3/transactions/{id}/verify` |
| Find the subscription from the first charge | `GET /v3/subscriptions?transaction_id={id}` |
| Cancel one member's subscription | `PUT /v3/subscriptions/{id}/cancel` |

Use the individual subscription cancellation endpoint. Never call the plan-cancellation endpoint to cancel one person's membership: cancelling the plan can affect all subscriptions attached to it.

### Current DCDS catalogue mapped to provider plans

| DCDS plan | Amount | Currency | Interval sent |
|---|---:|---|---|
| Monthly | 7,500 | NGN | `every 30 days` |
| Annual | 75,000 | NGN | `every one year` |
| Five-Year | 320,000 | NGN | `every five years` |

These are NGN major-unit values as used by the existing DCDS hosted checkout. The provider plan creation request explicitly sets `currency: NGN`. The plan `duration` is omitted so the subscription continues until cancelled.

Flutterwave documents custom `every x y` intervals, including “every one year”. “Every five years” remains a DCDS release gate until the exact returned interval and subsequent billing behaviour pass a real sandbox test. Do not substitute a different interval if Flutterwave rejects it; keep Five-Year renewal manual until resolved.

## 3. Test-mode credentials and isolation

Flutterwave has separate Test and Live modes. Test API keys carry the `_TEST` marker; Test mode does not move real money. Use only the test secret key and test webhook hash for this qualification.

The existing DCDS-Development functions read `FLW_SECRET_KEY` and the existing webhook reads `FLW_WEBHOOK_HASH` (falling back to `FLW_SECRET_HASH`). Do not assume the current secret value is a test key merely because the function is in Development. An authorised DCDS owner must inspect the secret label/prefix privately in the Development project before any provider call.

- Never paste a key, webhook hash, card detail, PIN or OTP into chat, GitHub, source files or logs.
- Never place the Flutterwave secret key in browser code or a public HTML file.
- Do not copy Development secrets into Production.
- Do not call provider plan-creation or checkout endpoints with a Live key while testing.
- Provider plan IDs are identifiers, not authentication credentials, but keep them in server-side configuration/storage and never trust a browser-supplied plan ID. The adapter maps each DCDS plan to its provider plan ID from trusted server configuration; it does not accept a provider plan ID from checkout input.

The Flutterwave API endpoint remains `https://api.flutterwave.com/v3`; the API key mode selects Test or Live.

## 4. One-time plan provisioning

After the Development key is confirmed as Test mode:

1. Run the trusted server-side provisioning operation once for Monthly, Annual and Five-Year.
2. Confirm every response has a positive plan ID, exact amount, NGN currency and the expected interval string.
3. Store the three returned provider plan IDs in a restricted Development-only location, with an environment label showing that they are Test IDs.
4. Check for existing plans before re-running provisioning. Do not create duplicates on every member checkout.
5. Keep the Five-Year plan disabled from member checkout unless its exact “every five years” interval passes the provider sandbox test.

The new adapter's `createPaymentPlan` method is deliberately a one-time operator method. It is not an endpoint for an ordinary signed-in member.

## 5. Sandbox qualification sequence

Run this only after the Development secret is confirmed to be Test mode and after a dedicated membership test record exists:

1. Create the three test plans and record their IDs and provider-returned intervals.
2. Use a dedicated DCDS test account to opt in explicitly to renewal. The control must start unchecked; no consent means no recurring plan ID is sent to checkout. To qualify an unapproved custom interval such as Five-Year, explicitly enable `allowSandboxQualification` only in Test mode. This lets a test card subscription prove the cadence while the constructor refuses that switch for Live mode. After successful qualification, store the exact plan ID in `providerPlanIds` and add the plan to `validatedPlanIds`; then disable the temporary qualification switch.
3. If the member chose manual renewal, use `createOneTimeMembershipCheckout` and confirm no `payment_plan` is included. If the member explicitly opted in to auto-renew, use the recurring checkout with the server-owned provider plan ID. Flutterwave's Payment Plans flow is card-only.
4. Complete a Flutterwave test-card charge. Verify the returned transaction ID, DCDS reference, exact amount, NGN currency, successful status and customer email by calling the transaction verification endpoint.
5. Query subscriptions using the first transaction ID. The adapter's `resolveSubscriptionFromInitialCharge` helper requires exactly one active match for the trusted provider plan ID, the approved amount and the customer's email before the DCDS server persists the provider subscription ID.
6. Test one individual cancellation using the returned subscription ID. Re-query subscriptions and confirm the exact subscription is cancelled; do not cancel the reusable plan.
7. Confirm the DCDS paid-through timestamp stays unchanged after cancellation and member access lasts until that timestamp.
8. Trigger/inspect successful, failed and cancelled subscription events. Verify the webhook signature against the exact raw request body, re-query critical charge details with the API and process each event idempotently.
9. Confirm Flutterwave's failed-charge retry lifecycle and ensure DCDS sends clear notices without extending an unverified entitlement.

Flutterwave documents three further charge attempts at 30-minute intervals after a failed charge, and says it cancels the subscription after those failed attempts. DCDS must reconcile that provider state and never assume a failed payment renews membership.

## 6. Webhook signature verification

The current Flutterwave webhook guide documents the `verif-hash` request header. It tells merchants to compare that value with the secret hash configured in the Flutterwave dashboard and stored server-side. The current DCDS-Development `flutterwave-webhook` uses this same header and a constant-time comparison.

The new adapter supports only the documented `verif-hash` method and rejects missing or mismatched headers. Do not treat an undocumented signature header as a substitute. Keep the webhook secret in the Development Edge Function secrets store; never put it in the client or repository. Do not change the existing course/VTU webhook during this separate Verified+ work.

## 7. Current test coverage and what has not been proven

The Deno tests use a mocked HTTP transport. They verify that the adapter sends the expected requests and rejects incorrect provider responses. They do not call Flutterwave, create a real Test-mode plan, charge a test card, or prove that Flutterwave accepts the Five-Year custom interval.

A real sandbox run remains outstanding because the Test-mode secret and a safe membership test record have not been made available to this code execution. No payment credential has been read or copied.

## 8. DCDS release blockers

- The existing migration-reconciliation report identifies mismatched Supabase migration histories. It remains a hard blocker for applying new membership tables or RPCs.
- The current production/course payment `orders.course_id` pipeline must not be reused for Verified+ memberships.
- No new webhook or billing Edge Function has been deployed to DCDS-Development yet.
- No Flutterwave payment-plan IDs have been provisioned or stored.
- No recurring checkout, provider subscription or customer billing profile has been created.
- The new member-facing Manage Subscription and Cancel Automatic Renewal UI remains unbuilt.
- The live sandbox interval, retry, webhook, cancellation and entitlement lifecycle tests remain outstanding.

Do not deploy this adapter or enable public checkout until the database migration baseline is reconciled, the dedicated membership persistence model is reviewed, the Development Edge Functions and webhook are integrated and tested, and the DCDS owner approves the Production release separately.
