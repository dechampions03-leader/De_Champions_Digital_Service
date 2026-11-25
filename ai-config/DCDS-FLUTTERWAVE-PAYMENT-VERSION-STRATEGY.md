# DCDS Flutterwave Payment-Version Release Strategy

**Status:** Phase 1 source preparation; no Production deployment performed.

## Phase 1 — NGN hosted checkout

- Retain the current Flutterwave V3 Standard hosted-checkout redirect. DCDS does not collect or store card numbers, expiry dates, CVV, card PINs or OTPs.
- Accept NGN only through this V3 release branch.
- Use an authoritative amount from the server-side dcds_create_checkout_order RPC. Ignore browser-supplied amounts.
- Enforce a positive integer amount within the V3 Standard API's documented int32 range before calling Flutterwave.
- Keep the existing unique transaction reference, short checkout session, link expiry, authenticated customer check, provider transaction verification, webhook verification, order-reference/amount/currency matching, duplicate-transaction prevention and enrollment-after-verification rules.
- Display USD/GBP/EUR price information only; foreign-currency payment buttons remain disabled until the provider-version migration is approved and tested.

## Important Flutterwave compatibility constraint

Flutterwave's published FAQ says merchants cannot use V3 and V4 APIs simultaneously. Do not implement a permanent split where NGN uses V3 while foreign currencies use V4 on the same merchant integration.

The V4 docs reviewed for this release describe the Orchestrator/direct-charge flow. It accepts decimal amounts, but card payments require encrypted card data, OAuth2 client credentials, trace/idempotency headers, customer authentication handling and final server-side verification. Flutterwave's card guide states that PCI DSS compliance is mandatory and that direct card charges must be enabled for the account.

Therefore, V4 is a full collection-stack migration gate, not a sidecar endpoint. Before implementation or student exposure, DCDS must obtain written confirmation of account eligibility, PCI DSS applicability/approval and supported currencies/payment methods from Flutterwave. Do not collect card details in a DCDS-built form before that gate is satisfied.

## Phase 1 Development sandbox checklist

1. Use the isolated DCDS-Development Supabase project only.
2. Add the provider's V3 test secret key to Development Edge Function secrets as FLW_SECRET_KEY. Never copy the Production key into Development.
3. Set DCDS_SERVICE_ROLE_KEY to the Development project's own service-role key. Do not use a Production service-role key.
4. Configure the Development Flutterwave webhook URL and its test webhook hash; keep webhook secrets server-side.
5. Use a dedicated Development student account and test course. Never use a real student, Production account, or Production checkout.
6. Run success, declined, cancelled, timeout/ambiguous creation, invalid reference, amount mismatch, currency mismatch, duplicate callback and duplicate verification scenarios.
7. Confirm a student is enrolled only after Flutterwave confirms a successful transaction and every order field matches. Confirm failed/pending/mismatched transactions never create enrolments.
8. Record sandbox transaction references and outcomes. Do not claim a sandbox test passed until a real test-mode transaction and webhook have been observed.

## Release gates

- CI type-check and source-level safety checks pass.
- Development schema and Edge Functions are provisioned with Development-only configuration.
- NGN sandbox card and non-card methods pass end-to-end checks.
- Production webhook and payment verification behavior are reviewed against the unchanged deployed functions.
- Explicit owner approval is obtained before any Production migration, secret change, function deployment or website release.

## Official references reviewed

- V3 Standard hosted Checkout: https://developer.flutterwave.com/docs/collections-inflow/flutterwave-standard
- V3 Standard API reference (amount is int32): https://developer.flutterwave.com/reference/checkout
- V4 authentication: https://developer.flutterwave.com/docs/authentication
- V4 Orchestrator Flow: https://developer.flutterwave.com/docs/payment-orchestrator-flow
- V4 Card Payments and PCI DSS requirement: https://developer.flutterwave.com/docs/card
- Flutterwave API version FAQ: https://developer.flutterwave.com/v2.0.0/
