# DCDS International Payout Operations

## Programme policy

The Global Ambassador & Rewards Programme remains NGN-denominated:

- ₦1,000 NGN per qualifying distinct referred-course purchase.
- ₦5,000 NGN minimum withdrawal request (measured against the NGN reward amount).
- Referral registration and attribution are worldwide.
- The existing verified Nigerian bank payout remains available through its existing NGN workflow.

Worldwide referral participation does not mean every international withdrawal corridor is enabled. International payout is exposed to ambassadors only for individually approved and activated routes.

## Current implementation

The international payout lifecycle now includes:

1. Country/currency route registry. Twelve Flutterwave corridors are seeded and remain disabled until separately approved and tested.
2. Encrypted beneficiary storage using AES-GCM. The full beneficiary payload is only available to server-side functions and authorised administrator review.
3. Country-specific beneficiary forms and provider bank-list lookup where applicable.
4. Live FX rate and transfer-fee lookups from Flutterwave. Quotes expire after five minutes and show NGN debit, destination amount, rate, fee and fee currency. Flutterwave documents transfer amounts as integers; DCDS rejects fractional destination transfer amounts.
5. Atomic NGN reward allocation. A request can reserve partial amounts from one or more ₦1,000 reward rows. A paid partial allocation cannot be spent again by either the international or local Nigerian payout path.
6. Explicit DCDS administrator confirmation before a transfer is sent. The request is locked before the provider call. An uncertain response moves to manual review and is never submitted a second time automatically.
7. Provider transfer status verification by API and signed webhook. The transfer reference, provider transfer ID, currency and amount must match before settlement.
8. Release of reserved rewards only after a verified provider failure or pre-transfer cancellation. Refund/reversal processing accounts for already-paid international allocations.

Beneficiary verification is currently an authorised, evidence-based DCDS administrator review. The review note and actor are audited. This is not an automated provider name-match result and must never be described as one.

## Provider corridor reference

Flutterwave's published bank-transfer guide currently lists these destination corridors: EUR to SEPA countries, GBP to the UK, GHS to Ghana, KES to Kenya, MWK to Malawi, NGN to Nigeria, TZS to Tanzania, UGX to Uganda, USD to the United States (and Nigerian domiciliary accounts), XAF to Cameroon, XOF to Côte d'Ivoire and Senegal, and ZAR to South Africa.

This is provider-wide documentation, not confirmation that DCDS's merchant account is approved for every corridor. The specific country, bank, payout method, branch requirements, beneficiary fields, fees, limits and wallet availability must be checked in DCDS's own account.

For USD, GBP and EUR, Flutterwave's guide requires details such as account number, beneficiary name, routing number, bank name and other country/currency-specific metadata. The fields are represented in the DCDS form configuration; confirm each route against the live provider guide before enabling it.

Provider references (checked 11 November 2026):
- [Flutterwave bank account transfer coverage](https://developer.flutterwave.com/docs/bank-account)
- [Flutterwave international USD, EUR and GBP transfers](https://developer.flutterwave.com/docs/international-usd-eur-gbp)
- [Flutterwave transfer rates](https://developer.flutterwave.com/docs/transfer-rates)
- [Flutterwave create transfer API](https://developer.flutterwave.com/reference/create-a-transfer)
- [Flutterwave transfer webhooks](https://developer.flutterwave.com/docs/webhooks)

## Financial and FX controls

Flutterwave's transfer-rate API returns the source amount needed for the requested destination amount, a rate, and the destination amount. The provider says rates are updated several times daily. DCDS stores a quote snapshot for five minutes and requires a fresh quote after expiry.

The provider's international transfer guide states that cross-currency transfers debit the source wallet for the converted transfer amount while the transfer fee is charged to the transfer-currency wallet. DCDS therefore blocks route enablement unless the relevant destination-currency fee wallet is confirmed funded.

Never promise a fixed FX rate, net destination amount, fee, delivery time or destination country. The current provider quote and route configuration are the source of truth.

The NGN reward ledger remains the source of funds. Partial allocations are recorded separately and locked atomically. A partially paid reward row returns to available with only its remaining NGN value; the already paid portion cannot be requested again.

## Server-side configuration gates

The international function is fail-closed. Set each value only after the named condition has been verified in the DCDS Flutterwave account:

- `FLW_SECRET_KEY` — Flutterwave secret key (server-side only).
- `FLW_WEBHOOK_HASH` — the existing V3 webhook secret hash already used by the customer-payment webhook. The combined endpoint reuses this same value for payment and international transfer events. `FLW_SECRET_HASH` remains a supported fallback alias, but a second Flutterwave webhook URL or separate secret is not required.
- `DCDS_PAYOUT_ENCRYPTION_KEY` — the existing 32-byte hexadecimal AES key used by the payout encryption workflow.
- `DCDS_FLW_INTL_KYC_APPROVED=true` — Flutterwave confirms international transfer approval for the DCDS merchant.
- `DCDS_FLW_TRANSFER_API_ENABLED=true` — transfer API is activated on the DCDS merchant account.
- `DCDS_FLW_IP_WHITELISTED=true` — the server's actual outgoing IP is allowed by Flutterwave.
- `DCDS_FLW_DESTINATION_WALLETS_FUNDED=true` — required transfer-fee wallets are funded.
- `DCDS_INTL_SANDBOX_VERIFIED=true` — the exact intended corridors/beneficiary fields pass sandbox tests.
- `DCDS_INTL_PAYOUTS_ENABLED=true` — the DCDS operator deliberately enables international payout after all previous conditions have evidence.

The Supabase service-role credential is injected server-side by Supabase and is never placed in HTML, JavaScript delivered to a browser, or GitHub files.

Do not set a flag to true merely because a provider documentation page lists a route. Do not share secrets in GitHub, chat, source control, or user-visible UI.

A route record may be enabled only after provider approval, sandbox verification, live verification, and the global gates have all passed. The database also enforces the route's evidence timestamps. Every route starts disabled.

## Admin operations

- **Readiness:** check all global configuration gates and each route's verification status.
- **Review beneficiary:** authorised admins can reveal encrypted beneficiary details for a confidential evidence review. A verification note is mandatory before marking the beneficiary DCDS-verified.
- **Enable route:** requires the global gates and route-specific provider, sandbox and live evidence.
- **Process request:** only a requested, reserved withdrawal can be submitted, and only after explicit confirmation. Confirm the NGN debit, destination amount, fee-wallet funding and verified beneficiary.
- **Reconcile:** use the stored provider transfer ID to check Flutterwave. If no provider transfer ID exists after an uncertain submission, investigate with the unique DCDS transfer reference manually. Never click process again.
- **Refund/reversal:** do not erase a paid allocation. The system records recovery due for paid portions and reverses only the unpaid remainder.

## Deployment boundary

The international database lifecycle and authenticated Edge Functions are deployed. The production database currently contains 12 registered routes, and all 12 are disabled. No beneficiary records, quotes, international requests or transfers have been created by the rollout.

International payouts are not available to ambassadors until the DCDS account configuration, the webhook secret, the global flags, and at least one route's sandbox and live verification are completed. The existing Nigerian bank withdrawal flow has not been replaced.


## Verified webhook and payout checkpoint — 11 November 2026

The following is the verified rollout state after merging the combined Flutterwave payment and international payout webhook:

- International payout requests: **0**.
- International reward allocations: **0**.
- Beneficiary accounts and FX quote records: **0** at the rollout checkpoint.
- All 12 international payout routes remain disabled.
- No international transfer was initiated.
- No payout balance was moved.
- The combined webhook is deployed at the existing customer-payment URL:
  `https://qxsenflgaweeadvggnyp.supabase.co/functions/v1/flutterwave-webhook`.
- The Flutterwave V3 webhook URL was not changed or replaced.
- GitHub validation and deployment checks passed for the merged combined-webhook code.
- Still outstanding: a real signed Flutterwave transfer callback test and a post-deployment customer payment test. Automated checks do not substitute for either live integration test.

Keep these two external validation items open until each is performed and its result is recorded. Do not describe international payouts or the live callback/payment path as fully end-to-end tested before then.
